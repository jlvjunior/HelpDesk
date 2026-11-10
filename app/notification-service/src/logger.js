const pino = require('pino');
const config = require('./config');

// Logs estruturados em JSON no stdout: o coletor (Promtail) envia para o Loki.
module.exports = pino({
  level: config.logLevel,
  base: { service: config.serviceName, instance: process.env.HOSTNAME },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: { level: (label) => ({ level: label }) },
});
