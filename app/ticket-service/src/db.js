const { Pool } = require('pg');
const config = require('./config');

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
    async list({ status } = {}) {
      const { rows } = status
        ? await pool.query('SELECT * FROM tickets WHERE status = $1 ORDER BY created_at DESC LIMIT 200', [status])
        : await pool.query('SELECT * FROM tickets ORDER BY created_at DESC LIMIT 200');
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
    async updateStatus(id, status) {
      const { rows } = await pool.query(
        'UPDATE tickets SET status = $2, updated_at = now() WHERE id = $1 RETURNING *',
        [id, status]
      );
      return rows[0] || null;
    },
  };
}

module.exports = { createPool, migrate, createRepository };
