const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');

process.env.LOG_LEVEL = 'silent';
process.env.JWT_SECRET = 'segredo-de-teste';
const jwt = require('jsonwebtoken');
const token = (email, role) => `Bearer ${jwt.sign({ sub: 'u1', name: 'Teste', email, role }, 'segredo-de-teste')}`;
const { createHandler } = require('../src/handler');
const { createApp } = require('../src/app');

function fakeRepo() {
  const saved = new Map();
  return {
    saved,
    ping: async () => {},
    save: async (n) => {
      if (saved.has(n.eventId)) return false;
      saved.set(n.eventId, n);
      return true;
    },
    list: async ({ recipient } = {}) => [...saved.values()].filter((n) => !recipient || n.recipient === recipient),
  };
}

const event = (over = {}) => ({
  id: '11111111-1111-4111-8111-111111111111',
  type: 'ticket.created',
  occurredAt: new Date().toISOString(),
  data: { id: '22222222-2222-4222-8222-222222222222', title: 'VPN caiu', priority: 'alta', status: 'aberto', requester: 'ana@empresa.com' },
  ...over,
});
const buf = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o));

test('gera notificação para ticket.created', async () => {
  const repo = fakeRepo();
  assert.strictEqual(await createHandler({ repo })(buf(event())), 'ok');
  const n = [...repo.saved.values()][0];
  assert.strictEqual(n.recipient, 'ana@empresa.com');
  assert.match(n.subject, /VPN caiu/);
});

test('é idempotente: evento repetido não duplica', async () => {
  const repo = fakeRepo();
  const handle = createHandler({ repo });
  await handle(buf(event()));
  assert.strictEqual(await handle(buf(event())), 'duplicado');
  assert.strictEqual(repo.saved.size, 1);
});

test('descarta JSON inválido e tipo desconhecido sem lançar erro', async () => {
  const handle = createHandler({ repo: fakeRepo() });
  assert.strictEqual(await handle(buf('{nao-json')), 'descartado');
  assert.strictEqual(await handle(buf(event({ type: 'outro.evento' }))), 'descartado');
});

test('propaga erro transitório do banco (mensagem será reenfileirada)', async () => {
  const repo = { save: async () => { throw new Error('db fora'); } };
  await assert.rejects(createHandler({ repo })(buf(event())), /db fora/);
});

test('API exige login, filtra por perfil e expõe métricas', async () => {
  const repo = fakeRepo();
  await createHandler({ repo })(buf(event()));
  const app = createApp({ repo, consumer: { isReady: () => true } });
  assert.strictEqual((await request(app).get('/notifications')).status, 401);
  const res = await request(app).get('/notifications').set('Authorization', token('op@x.com', 'operador'));
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.length, 1);
  // usuario só vê as notificações do próprio e-mail
  assert.strictEqual((await request(app).get('/notifications').set('Authorization', token('ana@empresa.com', 'usuario'))).body.length, 1);
  assert.strictEqual((await request(app).get('/notifications').set('Authorization', token('outro@x.com', 'usuario'))).body.length, 0);
  assert.match((await request(app).get('/metrics')).text, /events_consumed_total/);
});

test('conversa: resposta do atendente notifica o solicitante; mensagem do solicitante é ignorada', async () => {
  const repo = fakeRepo();
  const handle = createHandler({ repo });
  const msg = (role, id) => event({
    id,
    type: 'ticket.message_added',
    data: { ...event().data, message: { author_role: role, author_name: 'Suporte', body: 'Pode reiniciar o roteador?' } },
  });
  assert.strictEqual(await handle(buf(msg('atendente', '33333333-3333-4333-8333-333333333333'))), 'ok');
  assert.strictEqual(await handle(buf(msg('solicitante', '44444444-4444-4444-8444-444444444444'))), 'ignorado');
  assert.strictEqual(repo.saved.size, 1);
  assert.match([...repo.saved.values()][0].subject, /Nova resposta/);
});

test('fechamento com justificativa aparece na notificação', async () => {
  const repo = fakeRepo();
  const ev = event({ id: '55555555-5555-4555-8555-555555555555', type: 'ticket.status_changed' });
  ev.data = { ...ev.data, status: 'fechado', close_reason: 'Problema geral resolvido' };
  assert.strictEqual(await createHandler({ repo })(buf(ev)), 'ok');
  assert.match([...repo.saved.values()][0].body, /Justificativa: Problema geral resolvido/);
});

test('pedido de reabertura e recusa geram notificações', async () => {
  const repo = fakeRepo();
  const handle = createHandler({ repo });
  const ev = (id, type) => {
    const e = event({ id, type });
    e.data = { ...e.data, status: 'resolvido', reopen_reason: 'O problema voltou' };
    return buf(e);
  };
  assert.strictEqual(await handle(ev('66666666-6666-4666-8666-666666666666', 'ticket.reopen_requested')), 'ok');
  assert.strictEqual(await handle(ev('77777777-7777-4777-8777-777777777777', 'ticket.reopen_dismissed')), 'ok');
  const subjects = [...repo.saved.values()].map((n) => n.subject).join(' | ');
  assert.match(subjects, /Pedido de reabertura recebido/);
  assert.match(subjects, /não aceito/);
});
