const express = require('express');
const pinoHttp = require('pino-http');
const { randomUUID } = require('crypto');
const logger = require('./logger');
const metrics = require('./metrics');
const auth = require('./auth');

const PRIORITIES = ['baixa', 'media', 'alta'];
const STATUSES = ['aberto', 'em_andamento', 'resolvido', 'fechado'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Valida os dados de uma conta. Retorna a lista de erros.
function validateAccount({ name, email, password }) {
  const errors = [];
  if (typeof name !== 'string' || name.trim().length < 2 || name.length > 80) errors.push('name deve ter entre 2 e 80 caracteres');
  if (typeof email !== 'string' || !EMAIL_RE.test(email) || email.length > 200) errors.push('email deve ser um e-mail válido');
  if (typeof password !== 'string' || password.length < 6 || password.length > 100) errors.push('password deve ter entre 6 e 100 caracteres');
  return errors;
}

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
  const { authenticate, requireRole } = auth;

  // ----- Autenticação -----
  app.post('/auth/login', wrap(async (req, res) => {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string') return res.status(400).json({ error: 'informe email e password' });
    const user = await repo.findUserByEmail(email.trim().toLowerCase());
    if (!user || !auth.verifyPassword(password, user.password_hash)) {
      metrics.logins.inc({ result: 'recusado' });
      req.log.warn({ email: email.trim().toLowerCase() }, 'login recusado');
      return res.status(401).json({ error: 'e-mail ou senha incorretos' });
    }
    metrics.logins.inc({ result: 'ok' });
    req.log.info({ userId: user.id, role: user.role }, 'login realizado');
    res.json({ token: auth.signToken(user), user: auth.publicUser(user) });
  }));

  // Cadastro aberto: sempre cria uma conta com o perfil "usuario".
  app.post('/auth/register', wrap(async (req, res) => {
    const errors = validateAccount(req.body || {});
    if (errors.length) return res.status(400).json({ error: 'dados inválidos', details: errors });
    const { name, email, password } = req.body;
    const user = await repo.createUser({
      id: randomUUID(),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      passwordHash: auth.hashPassword(password),
      role: 'usuario',
    });
    if (!user) return res.status(409).json({ error: 'e-mail já cadastrado' });
    req.log.info({ userId: user.id, role: user.role }, 'conta criada');
    res.status(201).json({ token: auth.signToken(user), user: auth.publicUser(user) });
  }));

  app.get('/auth/me', authenticate, (req, res) => res.json(req.user));

  // ----- Usuários (somente admin) -----
  app.get('/users', authenticate, requireRole('admin'), wrap(async (req, res) => {
    res.json(await repo.listUsers());
  }));

  app.post('/users', authenticate, requireRole('admin'), wrap(async (req, res) => {
    const body = req.body || {};
    const errors = validateAccount(body);
    if (!auth.ROLES.includes(body.role)) errors.push(`role deve ser um de: ${auth.ROLES.join(', ')}`);
    if (errors.length) return res.status(400).json({ error: 'dados inválidos', details: errors });
    const user = await repo.createUser({
      id: randomUUID(),
      name: body.name.trim(),
      email: body.email.trim().toLowerCase(),
      passwordHash: auth.hashPassword(body.password),
      role: body.role,
    });
    if (!user) return res.status(409).json({ error: 'e-mail já cadastrado' });
    req.log.info({ userId: user.id, role: user.role, by: req.user.id }, 'conta criada pelo admin');
    res.status(201).json(user);
  }));

  app.patch('/users/:id', authenticate, requireRole('admin'), wrap(async (req, res) => {
    if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'id inválido' });
    const { role } = req.body || {};
    if (!auth.ROLES.includes(role)) return res.status(400).json({ error: `role deve ser um de: ${auth.ROLES.join(', ')}` });
    if (req.params.id === req.user.id) return res.status(409).json({ error: 'não é possível alterar o próprio perfil' });
    const user = await repo.updateUserRole(req.params.id, role);
    if (!user) return res.status(404).json({ error: 'usuário não encontrado' });
    req.log.info({ userId: user.id, role, by: req.user.id }, 'perfil alterado');
    res.json(user);
  }));

  app.delete('/users/:id', authenticate, requireRole('admin'), wrap(async (req, res) => {
    if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'id inválido' });
    if (req.params.id === req.user.id) return res.status(409).json({ error: 'não é possível excluir a própria conta' });
    if (!(await repo.deleteUser(req.params.id))) return res.status(404).json({ error: 'usuário não encontrado' });
    req.log.info({ userId: req.params.id, by: req.user.id }, 'conta excluída');
    res.status(204).end();
  }));

  // ----- Chamados -----
  // Carrega o chamado e garante o acesso: o perfil "usuario" só enxerga os próprios.
  async function loadTicket(req, res) {
    if (!UUID_RE.test(req.params.id)) {
      res.status(400).json({ error: 'id inválido' });
      return null;
    }
    const ticket = await repo.get(req.params.id);
    if (!ticket || (!auth.isStaff(req.user) && ticket.requester !== req.user.email)) {
      res.status(404).json({ error: 'chamado não encontrado' });
      return null;
    }
    return ticket;
  }

  app.get('/tickets', authenticate, wrap(async (req, res) => {
    const { status } = req.query;
    if (status && !STATUSES.includes(status)) return res.status(400).json({ error: 'status inválido' });
    const requester = auth.isStaff(req.user) ? undefined : req.user.email;
    res.json(await repo.list({ status, requester }));
  }));

  app.get('/tickets/:id', authenticate, wrap(async (req, res) => {
    const ticket = await loadTicket(req, res);
    if (ticket) res.json(ticket);
  }));

  // O solicitante é sempre a conta autenticada.
  app.post('/tickets', authenticate, wrap(async (req, res) => {
    const { title, description, priority = 'media' } = req.body || {};
    const errors = [];
    if (typeof title !== 'string' || title.trim().length < 3 || title.length > 200) errors.push('title deve ter entre 3 e 200 caracteres');
    if (typeof description !== 'string' || !description.trim() || description.length > 5000) errors.push('description é obrigatória (até 5000 caracteres)');
    if (!PRIORITIES.includes(priority)) errors.push(`priority deve ser uma de: ${PRIORITIES.join(', ')}`);
    if (errors.length) return res.status(400).json({ error: 'dados inválidos', details: errors });

    const ticket = await repo.create({
      id: randomUUID(),
      title: title.trim(),
      description: description.trim(),
      requester: req.user.email,
      priority,
    });
    metrics.ticketsCreated.inc({ priority });
    req.log.info({ ticketId: ticket.id, priority, userId: req.user.id }, 'chamado aberto');
    await publisher.publish('ticket.created', ticket);
    res.status(201).json(ticket);
  }));

  // Regras de status: o operador atende, resolve e reabre chamados resolvidos; só o administrador fecha.
  // Depois de fechado, o chamado só pode ser alterado (ou devolvido à fila) pelo administrador.
  const CLOSED_MSG = 'chamado fechado: somente o administrador pode alterá-lo ou devolvê-lo à fila';
  const canSetStatus = (user, status) => status !== 'fechado' || user.role === 'admin';
  const validJustification = (j) => typeof j === 'string' && j.trim().length >= 5 && j.length <= 500;

  app.patch('/tickets/:id', authenticate, requireRole(...auth.STAFF), wrap(async (req, res) => {
    if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'id inválido' });
    const { status, justification } = req.body || {};
    if (!STATUSES.includes(status)) return res.status(400).json({ error: `status deve ser um de: ${STATUSES.join(', ')}` });
    if (justification !== undefined && (typeof justification !== 'string' || justification.length > 500)) {
      return res.status(400).json({ error: 'justification deve ter até 500 caracteres' });
    }
    if (!canSetStatus(req.user, status)) return res.status(403).json({ error: 'somente o administrador pode fechar chamados' });
    const current = await repo.get(req.params.id);
    if (!current) return res.status(404).json({ error: 'chamado não encontrado' });
    if (current.status === 'fechado' && req.user.role !== 'admin') return res.status(403).json({ error: CLOSED_MSG });
    const ticket = await repo.updateStatus(req.params.id, status, justification ? justification.trim() : null);
    if (!ticket) return res.status(404).json({ error: 'chamado não encontrado' });
    metrics.ticketsStatusChanged.inc({ status });
    req.log.info({ ticketId: ticket.id, status, userId: req.user.id }, 'status do chamado alterado');
    await publisher.publish('ticket.status_changed', ticket);
    res.json(ticket);
  }));

  // Mudança em lote: resolver (operador ou admin) ou fechar (só admin), com uma única justificativa.
  app.post('/tickets/bulk-status', authenticate, requireRole(...auth.STAFF), wrap(async (req, res) => {
    const { ids, status, justification } = req.body || {};
    const errors = [];
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500 || !ids.every((id) => typeof id === 'string' && UUID_RE.test(id))) {
      errors.push('ids deve ser uma lista de 1 a 500 identificadores de chamados');
    }
    if (!['resolvido', 'fechado'].includes(status)) errors.push('status deve ser resolvido ou fechado');
    if (!validJustification(justification)) errors.push('justification deve ter entre 5 e 500 caracteres');
    if (errors.length) return res.status(400).json({ error: 'dados inválidos', details: errors });
    if (!canSetStatus(req.user, status)) return res.status(403).json({ error: 'somente o administrador pode fechar chamados' });

    const changed = await repo.bulkStatus([...new Set(ids)], status, justification.trim());
    if (changed.length) metrics.ticketsStatusChanged.inc({ status }, changed.length);
    req.log.info({ status, requested: ids.length, changed: changed.length, userId: req.user.id }, 'status alterado em lote');
    for (const ticket of changed) await publisher.publish('ticket.status_changed', ticket);
    res.json({ changed: changed.length, ids: changed.map((t) => t.id) });
  }));

  // O solicitante pede a reabertura de um chamado resolvido ou fechado, com justificativa.
  app.post('/tickets/:id/reopen-request', authenticate, wrap(async (req, res) => {
    const { justification } = req.body || {};
    if (!validJustification(justification)) {
      return res.status(400).json({ error: 'dados inválidos', details: ['justification deve ter entre 5 e 500 caracteres'] });
    }
    const ticket = await loadTicket(req, res);
    if (!ticket) return undefined;
    if (ticket.requester !== req.user.email) return res.status(403).json({ error: 'apenas o solicitante pode pedir a reabertura' });
    if (!['resolvido', 'fechado'].includes(ticket.status)) return res.status(409).json({ error: 'só é possível pedir a reabertura de um chamado resolvido ou fechado' });
    const updated = await repo.requestReopen(ticket.id, justification.trim());
    if (!updated) return res.status(409).json({ error: 'já existe um pedido de reabertura pendente para este chamado' });
    metrics.reopenRequests.inc({ result: 'solicitado' });
    req.log.info({ ticketId: updated.id, userId: req.user.id }, 'reabertura solicitada');
    await publisher.publish('ticket.reopen_requested', updated);
    return res.status(201).json(updated);
  }));

  // O atendimento recusa o pedido (para aceitar, basta mudar o status para aberto ou em andamento).
  app.delete('/tickets/:id/reopen-request', authenticate, requireRole(...auth.STAFF), wrap(async (req, res) => {
    if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'id inválido' });
    const current = await repo.get(req.params.id);
    if (current && current.status === 'fechado' && req.user.role !== 'admin') return res.status(403).json({ error: CLOSED_MSG });
    const ticket = await repo.dismissReopen(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'não há pedido de reabertura pendente para este chamado' });
    metrics.reopenRequests.inc({ result: 'recusado' });
    req.log.info({ ticketId: ticket.id, userId: req.user.id }, 'pedido de reabertura recusado');
    await publisher.publish('ticket.reopen_dismissed', ticket);
    res.json(ticket);
  }));

  // ----- Conversa do chamado (atendimento online) -----
  app.get('/tickets/:id/messages', authenticate, wrap(async (req, res) => {
    const ticket = await loadTicket(req, res);
    if (ticket) res.json(await repo.listMessages(ticket.id));
  }));

  // O papel na conversa vem do perfil da conta: usuario = solicitante; operador/admin = atendente.
  app.post('/tickets/:id/messages', authenticate, wrap(async (req, res) => {
    const { body } = req.body || {};
    if (typeof body !== 'string' || !body.trim() || body.length > 2000) {
      return res.status(400).json({ error: 'dados inválidos', details: ['body é obrigatório (até 2000 caracteres)'] });
    }
    const ticket = await loadTicket(req, res);
    if (!ticket) return undefined;
    if (ticket.status === 'fechado') return res.status(409).json({ error: 'chamado fechado não aceita novas mensagens' });

    const role = auth.isStaff(req.user) ? 'atendente' : 'solicitante';
    const message = await repo.addMessage({
      id: randomUUID(),
      ticketId: ticket.id,
      authorRole: role,
      authorName: req.user.name,
      body: body.trim(),
    });
    metrics.ticketMessages.inc({ role });
    req.log.info({ ticketId: ticket.id, messageId: message.id, role, userId: req.user.id }, 'mensagem registrada no chamado');
    await publisher.publish('ticket.message_added', { ...ticket, message });
    return res.status(201).json(message);
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
