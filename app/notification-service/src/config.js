module.exports = {
  serviceName: 'notification-service',
  port: Number(process.env.PORT || 3000),
  databaseUrl: process.env.DATABASE_URL || 'postgres://helpdesk:helpdesk@localhost:5432/helpdesk',
  amqpUrl: process.env.AMQP_URL || 'amqp://helpdesk:helpdesk@localhost:5672',
  exchange: process.env.AMQP_EXCHANGE || 'helpdesk.events',
  queue: process.env.AMQP_QUEUE || 'notifications',
  prefetch: Number(process.env.AMQP_PREFETCH || 10),
  logLevel: process.env.LOG_LEVEL || 'info',
};
