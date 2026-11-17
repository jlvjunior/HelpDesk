module.exports = {
  serviceName: 'ticket-service',
  port: Number(process.env.PORT || 3000),
  databaseUrl: process.env.DATABASE_URL || 'postgres://helpdesk:helpdesk@localhost:5432/helpdesk',
  amqpUrl: process.env.AMQP_URL || 'amqp://helpdesk:helpdesk@localhost:5672',
  exchange: process.env.AMQP_EXCHANGE || 'helpdesk.events',
  logLevel: process.env.LOG_LEVEL || 'info',
  // Segredo compartilhado com o notification-service para validar os tokens. Obrigatório.
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  // Contas criadas na primeira inicialização (quando a tabela de usuários está vazia).
  seedUsers: [
    { name: 'Administrador', email: process.env.ADMIN_EMAIL || 'admin@helpdesk.local', password: process.env.ADMIN_PASSWORD || 'admin123', role: 'admin' },
    { name: 'Operador de Suporte', email: process.env.OPERATOR_EMAIL || 'operador@helpdesk.local', password: process.env.OPERATOR_PASSWORD || 'operador123', role: 'operador' },
    { name: 'Usuário de Teste', email: process.env.USER_EMAIL || 'usuario@helpdesk.local', password: process.env.USER_PASSWORD || 'usuario123', role: 'usuario' },
  ],
};
