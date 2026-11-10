const { Pool } = require('pg');
const config = require('./config');

function createPool() {
  return new Pool({ connectionString: config.databaseUrl, max: 10 });
}

async function migrate(pool) {
  const c = await pool.connect();
  try {
    await c.query('SELECT pg_advisory_lock(42002)');
    // event_id UNIQUE garante idempotência: a mesma mensagem entregue duas vezes gera uma só notificação.
    await c.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id          BIGSERIAL PRIMARY KEY,
        event_id    UUID NOT NULL UNIQUE,
        event_type  TEXT NOT NULL,
        ticket_id   UUID NOT NULL,
        recipient   TEXT NOT NULL,
        subject     TEXT NOT NULL,
        body        TEXT NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
    await c.query('CREATE INDEX IF NOT EXISTS notifications_created_at_idx ON notifications (created_at DESC)');
  } finally {
    await c.query('SELECT pg_advisory_unlock(42002)').catch(() => {});
    c.release();
  }
}

function createRepository(pool) {
  return {
    async ping() {
      await pool.query('SELECT 1');
    },
    // Retorna false se o evento já tinha sido processado.
    async save(n) {
      const { rowCount } = await pool.query(
        `INSERT INTO notifications (event_id, event_type, ticket_id, recipient, subject, body)
         VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (event_id) DO NOTHING`,
        [n.eventId, n.eventType, n.ticketId, n.recipient, n.subject, n.body]
      );
      return rowCount === 1;
    },
    async list({ ticketId } = {}) {
      const { rows } = ticketId
        ? await pool.query('SELECT * FROM notifications WHERE ticket_id = $1 ORDER BY created_at DESC LIMIT 100', [ticketId])
        : await pool.query('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 100');
      return rows;
    },
  };
}

module.exports = { createPool, migrate, createRepository };
