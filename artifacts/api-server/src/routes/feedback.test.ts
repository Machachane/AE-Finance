import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import express from 'express';
import pino from 'pino';
import { createFeedbackRouter } from './feedback';

const receipt = { id: '07ffdf26-7949-4001-99dd-5342b9562fa2', createdAt: new Date('2026-11-11T12:00:00Z') };

async function server(t: TestContext, save: Parameters<typeof createFeedbackRouter>[0]) {
  const logs: string[] = [];
  const app = express();
  const log = pino({}, { write: (message) => { logs.push(message); } });
  app.use(express.json());
  app.use((req, _res, next) => { req.log = log; next(); });
  app.use('/api', createFeedbackRouter(save));
  const listener = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => listener.once('listening', resolve));
  t.after(() => new Promise<void>((resolve) => {
    listener.close(() => resolve());
    listener.closeAllConnections();
  }));
  const address = listener.address();
  assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}/api/feedback`;
  return {
    logs, url,
    send: (body: unknown) => fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }),
  };
}

test('all five sections save trimmed messages and return a receipt without feedback text', async (t) => {
  const saved: unknown[] = [];
  const api = await server(t, async (body) => { saved.push(body); return receipt; });
  for (const section of ['financials', 'statements', 'ratios', 'analytics', 'aviation-finance']) {
    const response = await api.send({ section, message: '  Please add more guidance.  ' });
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { id: receipt.id, createdAt: receipt.createdAt.toISOString() });
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  assert.deepEqual(saved[0], { section: 'financials', message: 'Please add more guidance.' });
  assert.equal(saved.length, 5);
  assert.equal(api.logs.join('').includes('Please add more guidance'), false);
});

test('invalid sections, blank messages and oversized messages are rejected before saving', async (t) => {
  const api = await server(t, async () => { assert.fail('Invalid feedback must not save'); });
  for (const body of [
    {}, { section: 'other', message: 'Hello' }, { section: 'ratios', message: '   ' },
    { section: 'ratios', message: '' }, { section: 'ratios', message: 'x'.repeat(5001) },
    { section: 'ratios', message: 42 },
  ]) {
    assert.equal((await api.send(body)).status, 400);
  }
});

test('failed database writes return a safe error rather than a success or private content', async (t) => {
  const api = await server(t, async () => { throw new Error('Private database details'); });
  const response = await api.send({ section: 'analytics', message: 'Private feedback text' });
  assert.equal(response.status, 503);
  const body = await response.json() as { error: string };
  assert.match(body.error, /could not be saved/);
  assert.doesNotMatch(api.logs.join(''), /Private feedback text|Private database details/);
});

test('feedback cannot be read publicly and excess submissions are limited', async (t) => {
  let count = 0;
  const api = await server(t, async () => { count++; return receipt; });
  assert.equal((await fetch(api.url)).status, 404);
  assert.equal((await fetch(`${api.url}/${receipt.id}`)).status, 404);
  for (let i = 0; i < 10; i++) {
    assert.equal((await api.send({ section: 'ratios', message: 'A suggestion' })).status, 201);
  }
  const limited = await api.send({ section: 'ratios', message: 'Another suggestion' });
  assert.equal(limited.status, 429);
  assert.ok(limited.headers.get('retry-after'));
  assert.equal(count, 10);
});
