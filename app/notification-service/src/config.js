module.exports = {
  serviceName: 'notification-service',
  port: Number(process.env.PORT || 3000),
  databaseUrl: process.env.DATABASE_URL || 'postgres://helpdesk:helpdesk@localhost:5432/helpdesk',
  amqpUrl: process.env.AMQP_URL || 'amqp://helpdesk:helpdesk@localhost:5672',
  exchange: process.env.AMQP_EXCHANGE || 'helpdesk.events',
  queue: process.env.AMQP_QUEUE || 'notifications',
  prefetch: Number(process.env.AMQP_PREFETCH || 10),
  // Mesmo segredo do ticket-service, que emite os tokens. Obrigatório.
  jwtSecret: process.env.JWT_SECRET,
  logLevel: process.env.LOG_LEVEL || 'info',
};
