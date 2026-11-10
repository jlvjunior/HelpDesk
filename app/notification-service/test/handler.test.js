const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');

process.env.LOG_LEVEL = 'silent';
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
    list: async () => [...saved.values()],
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

test('API lista notificações e expõe métricas', async () => {
  const repo = fakeRepo();
  await createHandler({ repo })(buf(event()));
  const app = createApp({ repo, consumer: { isReady: () => true } });
  const res = await request(app).get('/notifications');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.length, 1);
  assert.match((await request(app).get('/metrics')).text, /events_consumed_total/);
});
