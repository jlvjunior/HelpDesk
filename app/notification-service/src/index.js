const config = require('./config');
const logger = require('./logger');
const { createPool, migrate, createRepository } = require('./db');
const { createHandler } = require('./handler');
const { createConsumer } = require('./consumer');
const { createApp } = require('./app');

async function waitForDb(pool, attempts = 30) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await migrate(pool);
      return;
    } catch (err) {
      logger.warn({ attempt: i, err: err.message }, 'banco indisponível, aguardando');
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error('não foi possível conectar ao banco');
}

async function main() {
  const pool = createPool();
  pool.on('error', (err) => logger.error({ err: err.message }, 'erro no pool do Postgres'));
  await waitForDb(pool);

  const repo = createRepository(pool);
  const consumer = createConsumer({ handle: createHandler({ repo }) });
  consumer.connect();

  const app = createApp({ repo, consumer });
  const server = app.listen(config.port, () => logger.info({ port: config.port }, 'notification-service no ar'));

  const shutdown = (signal) => {
    logger.info({ signal }, 'encerrando');
    server.close(async () => {
      await consumer.close();
      await pool.end();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err: err.message }, 'falha na inicialização');
  process.exit(1);
});
