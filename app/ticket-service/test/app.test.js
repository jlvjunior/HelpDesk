const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { randomUUID } = require('crypto');

process.env.LOG_LEVEL = 'silent';
process.env.JWT_SECRET = 'segredo-de-teste';
const { createApp } = require('../src/app');
const auth = require('../src/auth');

// Dublês em memória: testam a API sem Postgres nem RabbitMQ.
function fakes() {
  const tickets = new Map();
  const users = new Map();
  const published = [];
  const messages = [];
  const addUser = (name, email, role, password = 'senha123') => {
    const u = { id: randomUUID(), name, email, role, password_hash: auth.hashPassword(password) };
    users.set(u.id, u);
    return u;
  };
  const f = {
    published,
    users: { admin: addUser('Admin', 'admin@x.com', 'admin'), op: addUser('Operador', 'op@x.com', 'operador'), ana: addUser('Ana', 'ana@x.com', 'usuario'), bia: addUser('Bia', 'bia@x.com', 'usuario') },
    repo: {
      ping: async () => {},
      list: async ({ status, requester } = {}) => [...tickets.values()].filter((t) => (!status || t.status === status) && (!requester || t.requester === requester)),
      get: async (id) => tickets.get(id) || null,
      create: async (t) => {
        const row = { ...t, status: 'aberto' };
        tickets.set(t.id, row);
        return row;
      },
      updateStatus: async (id, status, reason = null) => {
        const t = tickets.get(id);
        if (!t) return null;
        Object.assign(t, { status, close_reason: ['resolvido', 'fechado'].includes(status) ? reason : null, reopen_reason: null, reopen_requested_at: null });
        return t;
      },
      bulkStatus: async (ids, status, reason) =>
        ids.map((id) => tickets.get(id))
          .filter((t) => t && (status === 'fechado' ? t.status !== 'fechado' : ['aberto', 'em_andamento'].includes(t.status)))
          .map((t) => Object.assign(t, { status, close_reason: reason })),
      requestReopen: async (id, reason) => {
        const t = tickets.get(id);
        if (!t || !['resolvido', 'fechado'].includes(t.status) || t.reopen_requested_at) return null;
        return Object.assign(t, { reopen_reason: reason, reopen_requested_at: new Date().toISOString() });
      },
      dismissReopen: async (id) => {
        const t = tickets.get(id);
        if (!t || !t.reopen_requested_at) return null;
        return Object.assign(t, { reopen_reason: null, reopen_requested_at: null });
      },
      listMessages: async (ticketId) => messages.filter((m) => m.ticket_id === ticketId),
      addMessage: async (m) => {
        const row = { id: m.id, ticket_id: m.ticketId, author_role: m.authorRole, author_name: m.authorName, body: m.body };
        messages.push(row);
        return row;
      },
      findUserByEmail: async (email) => [...users.values()].find((u) => u.email === email) || null,
      listUsers: async () => [...users.values()].map(auth.publicUser),
      createUser: async (u) => {
        if ([...users.values()].some((x) => x.email === u.email)) return null;
        const row = { id: u.id, name: u.name, email: u.email, role: u.role, password_hash: u.passwordHash };
        users.set(u.id, row);
        return auth.publicUser(row);
      },
      updateUserRole: async (id, role) => {
        const u = users.get(id);
        if (!u) return null;
        u.role = role;
        return auth.publicUser(u);
      },
      deleteUser: async (id) => users.delete(id),
    },
    publisher: {
      isReady: () => true,
      publish: async (type, data) => published.push({ type, data }),
    },
  };
  f.as = (user) => ({ Authorization: `Bearer ${auth.signToken(user)}` });
  return f;
}

const valid = { title: 'Impressora parada', description: 'Não imprime', priority: 'alta' };

test('login: aceita credenciais corretas e recusa as erradas', async () => {
  const app = createApp(fakes());
  const ok = await request(app).post('/auth/login').send({ email: 'ANA@x.com', password: 'senha123' });
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(ok.body.user.role, 'usuario');
  assert.strictEqual(ok.body.user.password_hash, undefined);
  const me = await request(app).get('/auth/me').set('Authorization', `Bearer ${ok.body.token}`);
  assert.strictEqual(me.body.email, 'ana@x.com');
  assert.strictEqual((await request(app).post('/auth/login').send({ email: 'ana@x.com', password: 'errada' })).status, 401);
  assert.strictEqual((await request(app).post('/auth/login').send({ email: 'ninguem@x.com', password: 'senha123' })).status, 401);
});

test('cadastro: cria conta de usuario e recusa e-mail repetido', async () => {
  const app = createApp(fakes());
  const res = await request(app).post('/auth/register').send({ name: 'Caio', email: 'caio@x.com', password: 'segredo1', role: 'admin' });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.user.role, 'usuario'); // o cadastro aberto nunca cria admin
  assert.strictEqual((await request(app).post('/auth/register').send({ name: 'Caio', email: 'caio@x.com', password: 'segredo1' })).status, 409);
  assert.strictEqual((await request(app).post('/auth/register').send({ name: 'C', email: 'x', password: '1' })).status, 400);
});

test('rotas de chamados exigem autenticação', async () => {
  const app = createApp(fakes());
  assert.strictEqual((await request(app).get('/tickets')).status, 401);
  assert.strictEqual((await request(app).post('/tickets').send(valid)).status, 401);
  assert.strictEqual((await request(app).get('/tickets').set('Authorization', 'Bearer token-invalido')).status, 401);
});

test('usuario abre chamado em seu nome e publica ticket.created', async () => {
  const f = fakes();
  const res = await request(createApp(f)).post('/tickets').set(f.as(f.users.ana)).send({ ...valid, requester: 'outro@x.com' });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.requester, 'ana@x.com'); // ignora o solicitante enviado no corpo
  assert.strictEqual(f.published[0].type, 'ticket.created');
  assert.strictEqual((await request(createApp(f)).post('/tickets').set(f.as(f.users.ana)).send({ title: 'x' })).status, 400);
});

test('usuario vê apenas os próprios chamados; operador vê todos', async () => {
  const f = fakes();
  const app = createApp(f);
  const a = (await request(app).post('/tickets').set(f.as(f.users.ana)).send(valid)).body;
  await request(app).post('/tickets').set(f.as(f.users.bia)).send(valid);
  assert.strictEqual((await request(app).get('/tickets').set(f.as(f.users.ana))).body.length, 1);
  assert.strictEqual((await request(app).get('/tickets').set(f.as(f.users.op))).body.length, 2);
  assert.strictEqual((await request(app).get(`/tickets/${a.id}`).set(f.as(f.users.bia))).status, 404);
  assert.strictEqual((await request(app).get(`/tickets/${a.id}/messages`).set(f.as(f.users.bia))).status, 404);
  assert.strictEqual((await request(app).get(`/tickets/${a.id}`).set(f.as(f.users.op))).status, 200);
});

test('só operador e admin alteram o status', async () => {
  const f = fakes();
  const app = createApp(f);
  const t = (await request(app).post('/tickets').set(f.as(f.users.ana)).send(valid)).body;
  assert.strictEqual((await request(app).patch(`/tickets/${t.id}`).set(f.as(f.users.ana)).send({ status: 'resolvido' })).status, 403);
  const res = await request(app).patch(`/tickets/${t.id}`).set(f.as(f.users.op)).send({ status: 'resolvido' });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(f.published.at(-1).type, 'ticket.status_changed');
  assert.strictEqual((await request(app).patch(`/tickets/${t.id}`).set(f.as(f.users.admin)).send({ status: 'xyz' })).status, 400);
});

test('conversa: o papel vem do perfil e chamado fechado não aceita mensagens', async () => {
  const f = fakes();
  const app = createApp(f);
  const t = (await request(app).post('/tickets').set(f.as(f.users.ana)).send(valid)).body;
  const m1 = await request(app).post(`/tickets/${t.id}/messages`).set(f.as(f.users.ana)).send({ body: 'Alguma previsão?' });
  const m2 = await request(app).post(`/tickets/${t.id}/messages`).set(f.as(f.users.op)).send({ body: 'Já estamos verificando.' });
  assert.strictEqual(m1.body.author_role, 'solicitante');
  assert.strictEqual(m2.body.author_role, 'atendente');
  assert.strictEqual(m2.body.author_name, 'Operador');
  assert.strictEqual(f.published.at(-1).type, 'ticket.message_added');
  assert.strictEqual((await request(app).get(`/tickets/${t.id}/messages`).set(f.as(f.users.ana))).body.length, 2);
  assert.strictEqual((await request(app).post(`/tickets/${t.id}/messages`).set(f.as(f.users.bia)).send({ body: 'oi' })).status, 404);
  assert.strictEqual((await request(app).post(`/tickets/${t.id}/messages`).set(f.as(f.users.ana)).send({ body: '' })).status, 400);
  await request(app).patch(`/tickets/${t.id}`).set(f.as(f.users.admin)).send({ status: 'fechado' });
  assert.strictEqual((await request(app).post(`/tickets/${t.id}/messages`).set(f.as(f.users.ana)).send({ body: 'oi' })).status, 409);
});

test('gestão de usuários é exclusiva do admin', async () => {
  const f = fakes();
  const app = createApp(f);
  assert.strictEqual((await request(app).get('/users').set(f.as(f.users.op))).status, 403);
  assert.strictEqual((await request(app).get('/users').set(f.as(f.users.ana))).status, 403);
  assert.strictEqual((await request(app).get('/users').set(f.as(f.users.admin))).body.length, 4);
  const novo = await request(app).post('/users').set(f.as(f.users.admin)).send({ name: 'Novo Operador', email: 'novo@x.com', password: 'segredo1', role: 'operador' });
  assert.strictEqual(novo.status, 201);
  assert.strictEqual((await request(app).patch(`/users/${novo.body.id}`).set(f.as(f.users.admin)).send({ role: 'admin' })).body.role, 'admin');
  assert.strictEqual((await request(app).patch(`/users/${f.users.admin.id}`).set(f.as(f.users.admin)).send({ role: 'usuario' })).status, 409);
  assert.strictEqual((await request(app).delete(`/users/${f.users.admin.id}`).set(f.as(f.users.admin))).status, 409);
  assert.strictEqual((await request(app).delete(`/users/${novo.body.id}`).set(f.as(f.users.admin))).status, 204);
});

test('expõe health, readiness e métricas sem autenticação', async () => {
  const app = createApp(fakes());
  assert.strictEqual((await request(app).get('/healthz')).status, 200);
  assert.strictEqual((await request(app).get('/readyz')).status, 200);
  const m = await request(app).get('/metrics');
  assert.match(m.text, /tickets_created_total/);
  assert.match(m.text, /auth_logins_total/);
});

test('status por perfil: operador resolve e reabre, só o admin fecha', async () => {
  const f = fakes();
  const app = createApp(f);
  const t = (await request(app).post('/tickets').set(f.as(f.users.ana)).send(valid)).body;
  const patch = (user, body) => request(app).patch(`/tickets/${t.id}`).set(f.as(user)).send(body);
  assert.strictEqual((await patch(f.users.op, { status: 'resolvido', justification: 'Cabo trocado' })).body.close_reason, 'Cabo trocado');
  assert.strictEqual((await patch(f.users.op, { status: 'fechado' })).status, 403);
  assert.strictEqual((await patch(f.users.admin, { status: 'fechado' })).status, 200);
  // depois de fechado, só o admin altera ou devolve o chamado
  assert.strictEqual((await patch(f.users.op, { status: 'aberto' })).status, 403);
  assert.strictEqual((await patch(f.users.op, { status: 'resolvido' })).status, 403);
  const returned = await patch(f.users.admin, { status: 'aberto' });
  assert.strictEqual(returned.status, 200);
  assert.strictEqual(returned.body.close_reason, null);
  // chamado resolvido (não fechado) o operador reabre
  await patch(f.users.op, { status: 'resolvido' });
  assert.strictEqual((await patch(f.users.op, { status: 'aberto' })).status, 200);
});

test('lote: operador resolve, só o admin fecha, e exige justificativa', async () => {
  const f = fakes();
  const app = createApp(f);
  const ids = [];
  for (let i = 0; i < 3; i++) ids.push((await request(app).post('/tickets').set(f.as(f.users.ana)).send(valid)).body.id);
  const bulk = (user, body) => request(app).post('/tickets/bulk-status').set(f.as(user)).send(body);
  assert.strictEqual((await bulk(f.users.ana, { ids, status: 'resolvido', justification: 'Encerrando' })).status, 403);
  assert.strictEqual((await bulk(f.users.op, { ids, status: 'fechado', justification: 'Encerrando' })).status, 403);
  assert.strictEqual((await bulk(f.users.op, { ids, status: 'resolvido', justification: 'x' })).status, 400);
  assert.strictEqual((await bulk(f.users.admin, { ids: ['nao-e-uuid'], status: 'fechado', justification: 'Encerrando' })).status, 400);
  assert.strictEqual((await bulk(f.users.op, { ids: ids.slice(0, 2), status: 'resolvido', justification: 'Rede normalizada' })).body.changed, 2);
  const before = f.published.length;
  const res = await bulk(f.users.admin, { ids, status: 'fechado', justification: 'Problema geral de rede resolvido' });
  assert.strictEqual(res.body.changed, 3);
  assert.strictEqual(f.published.length - before, 3);
  assert.strictEqual(f.published.at(-1).data.close_reason, 'Problema geral de rede resolvido');
  assert.strictEqual((await bulk(f.users.admin, { ids, status: 'fechado', justification: 'De novo, sem efeito' })).body.changed, 0);
});

test('reabertura: o solicitante pede com justificativa; o atendimento aceita ou recusa', async () => {
  const f = fakes();
  const app = createApp(f);
  const t = (await request(app).post('/tickets').set(f.as(f.users.ana)).send(valid)).body;
  const ask = (user, body = { justification: 'O problema voltou hoje' }) => request(app).post(`/tickets/${t.id}/reopen-request`).set(f.as(user)).send(body);
  assert.strictEqual((await ask(f.users.ana)).status, 409); // ainda aberto
  await request(app).patch(`/tickets/${t.id}`).set(f.as(f.users.op)).send({ status: 'resolvido' });
  assert.strictEqual((await ask(f.users.ana, { justification: 'x' })).status, 400);
  assert.strictEqual((await ask(f.users.bia)).status, 404); // chamado de outra pessoa
  assert.strictEqual((await ask(f.users.op)).status, 403); // só o solicitante pede
  const ok = await ask(f.users.ana);
  assert.strictEqual(ok.status, 201);
  assert.strictEqual(ok.body.reopen_reason, 'O problema voltou hoje');
  assert.strictEqual(f.published.at(-1).type, 'ticket.reopen_requested');
  assert.strictEqual((await ask(f.users.ana)).status, 409); // já há pedido pendente
  // recusa
  assert.strictEqual((await request(app).delete(`/tickets/${t.id}/reopen-request`).set(f.as(f.users.ana))).status, 403);
  assert.strictEqual((await request(app).delete(`/tickets/${t.id}/reopen-request`).set(f.as(f.users.op))).status, 200);
  assert.strictEqual(f.published.at(-1).type, 'ticket.reopen_dismissed');
  // novo pedido, agora aceito: reabrir limpa o pedido
  await ask(f.users.ana);
  const reopened = await request(app).patch(`/tickets/${t.id}`).set(f.as(f.users.op)).send({ status: 'aberto' });
  assert.strictEqual(reopened.body.status, 'aberto');
  assert.strictEqual(reopened.body.reopen_requested_at, null);
  // pedido sobre chamado fechado: só o admin decide
  await request(app).patch(`/tickets/${t.id}`).set(f.as(f.users.admin)).send({ status: 'fechado' });
  assert.strictEqual((await ask(f.users.ana)).status, 201);
  assert.strictEqual((await request(app).delete(`/tickets/${t.id}/reopen-request`).set(f.as(f.users.op))).status, 403);
  assert.strictEqual((await request(app).patch(`/tickets/${t.id}`).set(f.as(f.users.op)).send({ status: 'aberto' })).status, 403);
  assert.strictEqual((await request(app).patch(`/tickets/${t.id}`).set(f.as(f.users.admin)).send({ status: 'aberto' })).status, 200);
});
