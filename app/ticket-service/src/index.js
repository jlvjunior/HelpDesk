const config = require('./config');
const logger = require('./logger');
const { createPool, migrate, createRepository } = require('./db');
const { createPublisher } = require('./broker');
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

  const publisher = createPublisher();
  publisher.connect(); // não bloqueia: o serviço sobe mesmo com o broker fora

  const app = createApp({ repo: createRepository(pool), publisher });
  const server = app.listen(config.port, () => logger.info({ port: config.port }, 'ticket-service no ar'));

  // Graceful shutdown: termina as requisições em andamento antes de sair (rolling update sem erro).
  const shutdown = (signal) => {
    logger.info({ signal }, 'encerrando');
    server.close(async () => {
      await publisher.close();
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
