const { Pool } = require('pg');
const { randomUUID } = require('crypto');
const config = require('./config');
const { hashPassword } = require('./auth');

function createPool() {
  return new Pool({ connectionString: config.databaseUrl, max: 10 });
}

// Migração idempotente. O advisory lock evita corrida quando várias réplicas sobem juntas.
async function migrate(pool) {
  const c = await pool.connect();
  try {
    await c.query('SELECT pg_advisory_lock(42001)');
    await c.query(`
      CREATE TABLE IF NOT EXISTS tickets (
        id           UUID PRIMARY KEY,
        title        TEXT NOT NULL,
        description  TEXT NOT NULL,
        requester    TEXT NOT NULL,
        priority     TEXT NOT NULL CHECK (priority IN ('baixa','media','alta')),
        status       TEXT NOT NULL CHECK (status IN ('aberto','em_andamento','resolvido','fechado')),
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
    await c.query('CREATE INDEX IF NOT EXISTS tickets_created_at_idx ON tickets (created_at DESC)');
    await c.query('ALTER TABLE tickets ADD COLUMN IF NOT EXISTS close_reason TEXT');
    // Pedido de reabertura feito pelo solicitante (pendente enquanto reopen_requested_at estiver preenchido).
    await c.query('ALTER TABLE tickets ADD COLUMN IF NOT EXISTS reopen_reason TEXT');
    await c.query('ALTER TABLE tickets ADD COLUMN IF NOT EXISTS reopen_requested_at TIMESTAMPTZ');
    // Contas e perfis de acesso (admin, operador, usuario).
    await c.query(`
      CREATE TABLE IF NOT EXISTS users (
        id             UUID PRIMARY KEY,
        name           TEXT NOT NULL,
        email          TEXT NOT NULL UNIQUE,
        password_hash  TEXT NOT NULL,
        role           TEXT NOT NULL CHECK (role IN ('admin','operador','usuario')),
        created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
    const { rows: [{ total }] } = await c.query('SELECT count(*)::int AS total FROM users');
    if (total === 0) {
      for (const u of config.seedUsers) {
        await c.query(
          'INSERT INTO users (id, name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (email) DO NOTHING',
          [randomUUID(), u.name, u.email.toLowerCase(), hashPassword(u.password), u.role]
        );
      }
    }
    // Conversa do chamado (atendimento online entre solicitante e atendente).
    await c.query(`
      CREATE TABLE IF NOT EXISTS ticket_messages (
        id           UUID PRIMARY KEY,
        ticket_id    UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        author_role  TEXT NOT NULL CHECK (author_role IN ('solicitante','atendente')),
        author_name  TEXT NOT NULL,
        body         TEXT NOT NULL,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
    await c.query('CREATE INDEX IF NOT EXISTS ticket_messages_ticket_idx ON ticket_messages (ticket_id, created_at)');
  } finally {
    await c.query('SELECT pg_advisory_unlock(42001)').catch(() => {});
    c.release();
  }
}

function createRepository(pool) {
  return {
    async ping() {
      await pool.query('SELECT 1');
    },
    // requester: quando informado, restringe aos chamados daquele e-mail (perfil usuario).
    // Cada chamado traz o resumo da conversa (quantidade e última mensagem), usado no aviso de mensagens novas.
    async list({ status, requester } = {}) {
      const where = [];
      const params = [];
      if (status) where.push(`t.status = $${params.push(status)}`);
      if (requester) where.push(`t.requester = $${params.push(requester)}`);
      const { rows } = await pool.query(
        `SELECT t.*, COALESCE(c.n, 0)::int AS message_count, l.created_at AS last_message_at, l.author_role AS last_message_role
           FROM tickets t
           LEFT JOIN LATERAL (SELECT count(*) AS n FROM ticket_messages WHERE ticket_id = t.id) c ON true
           LEFT JOIN LATERAL (SELECT created_at, author_role FROM ticket_messages
                               WHERE ticket_id = t.id ORDER BY created_at DESC LIMIT 1) l ON true
          ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
          ORDER BY t.created_at DESC LIMIT 1000`,
        params
      );
      return rows;
    },
    async get(id) {
      const { rows } = await pool.query('SELECT * FROM tickets WHERE id = $1', [id]);
      return rows[0] || null;
    },
    async create(t) {
      const { rows } = await pool.query(
        `INSERT INTO tickets (id, title, description, requester, priority, status)
         VALUES ($1, $2, $3, $4, $5, 'aberto') RETURNING *`,
        [t.id, t.title, t.description, t.requester, t.priority]
      );
      return rows[0];
    },
    // A justificativa é guardada ao resolver ou fechar. Qualquer mudança de status encerra um pedido de reabertura pendente.
    async updateStatus(id, status, reason = null) {
      const { rows } = await pool.query(
        `UPDATE tickets
            SET status = $2,
                close_reason = CASE WHEN $2 IN ('resolvido','fechado') THEN $3 ELSE NULL END,
                reopen_reason = NULL, reopen_requested_at = NULL, updated_at = now()
          WHERE id = $1 RETURNING *`,
        [id, status, reason]
      );
      return rows[0] || null;
    },
    // Resolve ou fecha vários chamados de uma vez, com a mesma justificativa.
    // Resolver só alcança chamados abertos ou em andamento; fechar ignora os já fechados.
    async bulkStatus(ids, status, reason) {
      const eligible = status === 'fechado' ? "status <> 'fechado'" : "status IN ('aberto','em_andamento')";
      const { rows } = await pool.query(
        `UPDATE tickets
            SET status = $2, close_reason = $3, reopen_reason = NULL, reopen_requested_at = NULL, updated_at = now()
          WHERE id = ANY($1::uuid[]) AND ${eligible} RETURNING *`,
        [ids, status, reason]
      );
      return rows;
    },
    // Registra o pedido de reabertura. Retorna null se o chamado não está resolvido/fechado ou já tem pedido pendente.
    async requestReopen(id, reason) {
      const { rows } = await pool.query(
        `UPDATE tickets SET reopen_reason = $2, reopen_requested_at = now(), updated_at = now()
          WHERE id = $1 AND status IN ('resolvido','fechado') AND reopen_requested_at IS NULL RETURNING *`,
        [id, reason]
      );
      return rows[0] || null;
    },
    async dismissReopen(id) {
      const { rows } = await pool.query(
        `UPDATE tickets SET reopen_reason = NULL, reopen_requested_at = NULL, updated_at = now()
          WHERE id = $1 AND reopen_requested_at IS NOT NULL RETURNING *`,
        [id]
      );
      return rows[0] || null;
    },
    async findUserByEmail(email) {
      const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
      return rows[0] || null;
    },
    async listUsers() {
      const { rows } = await pool.query('SELECT id, name, email, role, created_at FROM users ORDER BY created_at ASC');
      return rows;
    },
    // Retorna null se o e-mail já estiver cadastrado.
    async createUser(u) {
      const { rows } = await pool.query(
        `INSERT INTO users (id, name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (email) DO NOTHING RETURNING id, name, email, role, created_at`,
        [u.id, u.name, u.email, u.passwordHash, u.role]
      );
      return rows[0] || null;
    },
    async updateUserRole(id, role) {
      const { rows } = await pool.query(
        'UPDATE users SET role = $2 WHERE id = $1 RETURNING id, name, email, role, created_at',
        [id, role]
      );
      return rows[0] || null;
    },
    async deleteUser(id) {
      const { rowCount } = await pool.query('DELETE FROM users WHERE id = $1', [id]);
      return rowCount === 1;
    },
    async listMessages(ticketId) {
      const { rows } = await pool.query(
        'SELECT * FROM ticket_messages WHERE ticket_id = $1 ORDER BY created_at ASC LIMIT 500',
        [ticketId]
      );
      return rows;
    },
    async addMessage(m) {
      const { rows } = await pool.query(
        `INSERT INTO ticket_messages (id, ticket_id, author_role, author_name, body)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [m.id, m.ticketId, m.authorRole, m.authorName, m.body]
      );
      return rows[0];
    },
  };
}

module.exports = { createPool, migrate, createRepository };
