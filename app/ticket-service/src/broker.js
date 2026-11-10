const amqp = require('amqplib');
const { randomUUID } = require('crypto');
const config = require('./config');
const logger = require('./logger');
const { eventsPublished } = require('./metrics');

// Publicador RabbitMQ com reconexão automática.
function createPublisher() {
  let channel = null;
  let closing = false;

  async function connect() {
    try {
      const conn = await amqp.connect(config.amqpUrl);
      conn.on('error', (err) => logger.error({ err }, 'erro na conexão AMQP'));
      conn.on('close', () => {
        channel = null;
        if (!closing) {
          logger.warn('conexão AMQP fechada, reconectando em 3s');
          setTimeout(connect, 3000);
        }
      });
      const ch = await conn.createConfirmChannel();
      await ch.assertExchange(config.exchange, 'topic', { durable: true });
      channel = ch;
      logger.info({ exchange: config.exchange }, 'conectado ao RabbitMQ');
    } catch (err) {
      logger.error({ err: err.message }, 'falha ao conectar no RabbitMQ, nova tentativa em 3s');
      setTimeout(connect, 3000);
    }
  }

  return {
    connect,
    isReady: () => channel !== null,
    // Publica o evento e aguarda o confirm do broker (mensagem persistente).
    async publish(type, data) {
      const event = { id: randomUUID(), type, occurredAt: new Date().toISOString(), data };
      try {
        if (!channel) throw new Error('broker indisponível');
        const ch = channel;
        await new Promise((resolve, reject) => {
          ch.publish(
            config.exchange,
            type,
            Buffer.from(JSON.stringify(event)),
            { persistent: true, contentType: 'application/json', messageId: event.id },
            (err) => (err ? reject(err) : resolve())
          );
        });
        eventsPublished.inc({ type, result: 'ok' });
        logger.info({ eventId: event.id, eventType: type, ticketId: data.id }, 'evento publicado');
        return true;
      } catch (err) {
        eventsPublished.inc({ type, result: 'erro' });
        logger.error({ err: err.message, eventType: type, ticketId: data.id }, 'falha ao publicar evento');
        return false;
      }
    },
    async close() {
      closing = true;
      if (channel) await channel.connection.close().catch(() => {});
    },
  };
}

module.exports = { createPublisher };
