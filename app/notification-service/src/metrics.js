const client = require('prom-client');

const register = new client.Registry();
register.setDefaultLabels({ service: 'notification-service' });
client.collectDefaultMetrics({ register });

const httpDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duração das requisições HTTP em segundos',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [register],
});

const eventsConsumed = new client.Counter({
  name: 'events_consumed_total',
  help: 'Eventos consumidos da fila, por tipo e resultado (ok, duplicado, descartado, erro)',
  labelNames: ['type', 'result'],
  registers: [register],
});

const processingDuration = new client.Histogram({
  name: 'event_processing_duration_seconds',
  help: 'Tempo de processamento de cada evento',
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
  registers: [register],
});

const eventLag = new client.Histogram({
  name: 'event_delivery_lag_seconds',
  help: 'Tempo entre a publicação do evento e o seu processamento',
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5, 15, 60],
  registers: [register],
});

function httpMetrics(req, res, next) {
  if (['/metrics', '/healthz', '/readyz'].includes(req.path)) return next();
  const end = httpDuration.startTimer();
  res.on('finish', () => {
    const route = req.route ? req.baseUrl + req.route.path : 'unmatched';
    end({ method: req.method, route, status: res.statusCode });
  });
  next();
}

module.exports = { register, httpMetrics, eventsConsumed, processingDuration, eventLag };
