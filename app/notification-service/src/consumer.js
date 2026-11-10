const amqp = require('amqplib');
const config = require('./config');
const logger = require('./logger');

// Consumidor RabbitMQ com reconexão automática, ack manual e dead-letter queue.
function createConsumer({ handle }) {
  let connection = null;
  let ready = false;
  let closing = false;

  async function connect() {
    try {
      connection = await amqp.connect(config.amqpUrl);
      connection.on('error', (err) => logger.error({ err: err.message }, 'erro na conexão AMQP'));
      connection.on('close', () => {
        ready = false;
        if (!closing) {
          logger.warn('conexão AMQP fechada, reconectando em 3s');
          setTimeout(connect, 3000);
        }
      });

      const ch = await connection.createChannel();
      const dlx = `${config.exchange}.dlx`;
      const dlq = `${config.queue}.dlq`;
      await ch.assertExchange(config.exchange, 'topic', { durable: true });
      await ch.assertExchange(dlx, 'fanout', { durable: true });
      await ch.assertQueue(dlq, { durable: true });
      await ch.bindQueue(dlq, dlx, '');
      await ch.assertQueue(config.queue, { durable: true, arguments: { 'x-dead-letter-exchange': dlx } });
      await ch.bindQueue(config.queue, config.exchange, 'ticket.*');
      await ch.prefetch(config.prefetch);

      await ch.consume(config.queue, async (msg) => {
        if (!msg) return;
        try {
          await handle(msg.content);
          ch.ack(msg);
        } catch {
          // 1ª falha: volta para a fila; 2ª falha: vai para a DLQ.
          ch.nack(msg, false, !msg.fields.redelivered);
        }
      });

      ready = true;
      logger.info({ queue: config.queue, exchange: config.exchange }, 'consumindo eventos do RabbitMQ');
    } catch (err) {
      logger.error({ err: err.message }, 'falha ao conectar no RabbitMQ, nova tentativa em 3s');
      setTimeout(connect, 3000);
    }
  }

  return {
    connect,
    isReady: () => ready,
    async close() {
      closing = true;
      if (connection) await connection.close().catch(() => {});
    },
  };
}

module.exports = { createConsumer };
