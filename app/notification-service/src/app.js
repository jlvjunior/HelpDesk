const express = require('express');
const pinoHttp = require('pino-http');
const { randomUUID } = require('crypto');
const logger = require('./logger');
const metrics = require('./metrics');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function createApp({ repo, consumer }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => req.headers['x-request-id'] || randomUUID(),
      // Log enxuto: só o necessário para correlacionar (id da requisição, rota e status).
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
      autoLogging: { ignore: (req) => ['/metrics', '/healthz', '/readyz'].includes(req.url) },
    })
  );
  app.use(metrics.httpMetrics);

  app.get('/healthz', (req, res) => res.json({ status: 'ok' }));

  app.get('/readyz', async (req, res) => {
    try {
      await repo.ping();
      res.json({ status: 'ready', consumer: consumer.isReady() });
    } catch (err) {
      res.status(503).json({ status: 'not_ready', error: err.message });
    }
  });

  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', metrics.register.contentType);
    res.end(await metrics.register.metrics());
  });

  app.get('/notifications', async (req, res, next) => {
    try {
      const { ticketId } = req.query;
      if (ticketId && !UUID_RE.test(ticketId)) return res.status(400).json({ error: 'ticketId inválido' });
      res.json(await repo.list({ ticketId }));
    } catch (err) {
      next(err);
    }
  });

  app.use((req, res) => res.status(404).json({ error: 'rota não encontrada' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    (req.log || logger).error({ err }, 'erro não tratado');
    res.status(500).json({ error: 'erro interno' });
  });

  return app;
}

module.exports = { createApp };
