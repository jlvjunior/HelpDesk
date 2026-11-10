const express = require('express');
const pinoHttp = require('pino-http');
const { randomUUID } = require('crypto');
const logger = require('./logger');
const metrics = require('./metrics');

const PRIORITIES = ['baixa', 'media', 'alta'];
const STATUSES = ['aberto', 'em_andamento', 'resolvido', 'fechado'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Recebe as dependências (repositório e publicador) para facilitar os testes.
function createApp({ repo, publisher }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
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

  // Liveness: o processo está de pé.
  app.get('/healthz', (req, res) => res.json({ status: 'ok' }));

  // Readiness: só recebe tráfego se o banco responde.
  app.get('/readyz', async (req, res) => {
    try {
      await repo.ping();
      res.json({ status: 'ready', broker: publisher.isReady() });
    } catch (err) {
      res.status(503).json({ status: 'not_ready', error: err.message });
    }
  });

  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', metrics.register.contentType);
    res.end(await metrics.register.metrics());
  });

  const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

  app.get('/tickets', wrap(async (req, res) => {
    const { status } = req.query;
    if (status && !STATUSES.includes(status)) return res.status(400).json({ error: 'status inválido' });
    res.json(await repo.list({ status }));
  }));

  app.get('/tickets/:id', wrap(async (req, res) => {
    if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'id inválido' });
    const ticket = await repo.get(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'chamado não encontrado' });
    res.json(ticket);
  }));

  app.post('/tickets', wrap(async (req, res) => {
    const { title, description, requester, priority = 'media' } = req.body || {};
    const errors = [];
    if (typeof title !== 'string' || title.trim().length < 3 || title.length > 200) errors.push('title deve ter entre 3 e 200 caracteres');
    if (typeof description !== 'string' || !description.trim() || description.length > 5000) errors.push('description é obrigatória (até 5000 caracteres)');
    if (typeof requester !== 'string' || !EMAIL_RE.test(requester)) errors.push('requester deve ser um e-mail válido');
    if (!PRIORITIES.includes(priority)) errors.push(`priority deve ser uma de: ${PRIORITIES.join(', ')}`);
    if (errors.length) return res.status(400).json({ error: 'dados inválidos', details: errors });

    const ticket = await repo.create({
      id: randomUUID(),
      title: title.trim(),
      description: description.trim(),
      requester: requester.trim(),
      priority,
    });
    metrics.ticketsCreated.inc({ priority });
    req.log.info({ ticketId: ticket.id, priority }, 'chamado aberto');
    await publisher.publish('ticket.created', ticket);
    res.status(201).json(ticket);
  }));

  app.patch('/tickets/:id', wrap(async (req, res) => {
    if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'id inválido' });
    const { status } = req.body || {};
    if (!STATUSES.includes(status)) return res.status(400).json({ error: `status deve ser um de: ${STATUSES.join(', ')}` });
    const ticket = await repo.updateStatus(req.params.id, status);
    if (!ticket) return res.status(404).json({ error: 'chamado não encontrado' });
    metrics.ticketsStatusChanged.inc({ status });
    req.log.info({ ticketId: ticket.id, status }, 'status do chamado alterado');
    await publisher.publish('ticket.status_changed', ticket);
    res.json(ticket);
  }));

  app.use((req, res) => res.status(404).json({ error: 'rota não encontrada' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido' });
    (req.log || logger).error({ err }, 'erro não tratado');
    res.status(500).json({ error: 'erro interno' });
  });

  return app;
}

module.exports = { createApp, PRIORITIES, STATUSES };
