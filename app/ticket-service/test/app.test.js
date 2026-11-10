const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');

process.env.LOG_LEVEL = 'silent';
const { createApp } = require('../src/app');

// Dublês em memória: testam a API sem Postgres nem RabbitMQ.
function fakes() {
  const tickets = new Map();
  const published = [];
  return {
    published,
    repo: {
      ping: async () => {},
      list: async ({ status } = {}) => [...tickets.values()].filter((t) => !status || t.status === status),
      get: async (id) => tickets.get(id) || null,
      create: async (t) => {
        const row = { ...t, status: 'aberto' };
        tickets.set(t.id, row);
        return row;
      },
      updateStatus: async (id, status) => {
        const t = tickets.get(id);
        if (!t) return null;
        t.status = status;
        return t;
      },
    },
    publisher: {
      isReady: () => true,
      publish: async (type, data) => published.push({ type, data }),
    },
  };
}

const valid = { title: 'Impressora parada', description: 'Não imprime', requester: 'ana@empresa.com', priority: 'alta' };

test('cria chamado e publica evento ticket.created', async () => {
  const f = fakes();
  const res = await request(createApp(f)).post('/tickets').send(valid);
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.status, 'aberto');
  assert.strictEqual(f.published[0].type, 'ticket.created');
  assert.strictEqual(f.published[0].data.id, res.body.id);
});

test('rejeita chamado inválido', async () => {
  const f = fakes();
  const res = await request(createApp(f)).post('/tickets').send({ title: 'x', requester: 'nao-email' });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(f.published.length, 0);
});

test('altera status e publica ticket.status_changed', async () => {
  const f = fakes();
  const app = createApp(f);
  const created = await request(app).post('/tickets').send(valid);
  const res = await request(app).patch(`/tickets/${created.body.id}`).send({ status: 'resolvido' });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.status, 'resolvido');
  assert.strictEqual(f.published[1].type, 'ticket.status_changed');
});

test('404 para chamado inexistente e 400 para status inválido', async () => {
  const app = createApp(fakes());
  const id = '00000000-0000-4000-8000-000000000000';
  assert.strictEqual((await request(app).get(`/tickets/${id}`)).status, 404);
  assert.strictEqual((await request(app).patch(`/tickets/${id}`).send({ status: 'xyz' })).status, 400);
});

test('expõe health, readiness e métricas', async () => {
  const app = createApp(fakes());
  await request(app).post('/tickets').send(valid);
  assert.strictEqual((await request(app).get('/healthz')).status, 200);
  assert.strictEqual((await request(app).get('/readyz')).status, 200);
  const m = await request(app).get('/metrics');
  assert.match(m.text, /tickets_created_total\{priority="alta",service="ticket-service"\} \d+/);
  assert.match(m.text, /http_request_duration_seconds_count/);
});
