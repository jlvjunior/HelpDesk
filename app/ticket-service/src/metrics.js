const client = require('prom-client');

const register = new client.Registry();
register.setDefaultLabels({ service: 'ticket-service' });
client.collectDefaultMetrics({ register });

const httpDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duração das requisições HTTP em segundos',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [register],
});

const ticketsCreated = new client.Counter({
  name: 'tickets_created_total',
  help: 'Total de chamados abertos',
  labelNames: ['priority'],
  registers: [register],
});

const ticketsStatusChanged = new client.Counter({
  name: 'tickets_status_changed_total',
  help: 'Total de mudanças de status de chamados',
  labelNames: ['status'],
  registers: [register],
});

const eventsPublished = new client.Counter({
  name: 'events_published_total',
  help: 'Eventos publicados na mensageria',
  labelNames: ['type', 'result'],
  registers: [register],
});

// Middleware que mede todas as rotas (exceto /metrics e probes).
function httpMetrics(req, res, next) {
  if (['/metrics', '/healthz', '/readyz'].includes(req.path)) return next();
  const end = httpDuration.startTimer();
  res.on('finish', () => {
    const route = req.route ? req.baseUrl + req.route.path : 'unmatched';
    end({ method: req.method, route, status: res.statusCode });
  });
  next();
}

module.exports = { register, httpMetrics, ticketsCreated, ticketsStatusChanged, eventsPublished };
