import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import express from 'express';
import pino from 'pino';
import { createAssistantRouter, parseModelPlan } from './assistant';
import { AssistantFailure } from '../lib/assistant-errors';
import { normalizeAssistantPlan, type AssistantDatasets } from '../lib/assistant-data';
import type { AssistantConversationContext } from '../lib/assistant-conversation';
import type { AssistantChatError } from '@workspace/api-zod';

const directory = resolve(import.meta.dirname, '../../../airline-financial-research/public/data');
const data: AssistantDatasets = {
  financials: JSON.parse(readFileSync(resolve(directory, 'airline-financials.json'), 'utf8')),
  rankings: JSON.parse(readFileSync(resolve(directory, 'aviation-finance-rankings.json'), 'utf8')),
  analysis: JSON.parse(readFileSync(resolve(directory, 'aviation-finance-analysis.json'), 'utf8')),
};

async function server(t: TestContext, options: Parameters<typeof createAssistantRouter>[0] = {}) {
  const logs: string[] = [];
  const log = pino({}, { write: (text) => { logs.push(text); } });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.log = log; next(); });
  app.use('/api', createAssistantRouter({
    load: async () => data,
    apiKey: () => 'test-only-placeholder',
    classify: async () => { throw new Error('Unexpected model call for deterministic navigation'); },
    ...options,
  }));
  const listener = app.listen(0, '127.0.0.1');
  await new Promise<void>((done) => listener.once('listening', done));
  t.after(() => new Promise<void>((done) => { listener.close(() => done()); listener.closeAllConnections(); }));
  const address = listener.address();
  assert.ok(address && typeof address !== 'string');
  return {
    logs,
    async send(message: string, context?: AssistantConversationContext, extra: object = {}) {
      return fetch(`http://127.0.0.1:${address.port}/api/assistant/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history: [], ...(context ? { context } : {}), ...extra }),
      });
    },
  };
}

async function result(response: Response): Promise<{
  navigation: { href: string } | null;
  context: AssistantConversationContext;
  answer: string;
}> {
  assert.equal(response.status, 200);
  const text = await response.text();
  const events = text.split('\n\n').filter((line) => line.startsWith('data: ')).map((line) => JSON.parse(line.slice(6)));
  assert.equal(events.at(-1).type, 'done');
  const item = events.find((event) => event.type === 'result');
  assert.ok(item);
  return { ...item, answer: events.filter((event) => event.type === 'delta').map((event) => event.content).join('') };
}

test('HTTP screenshot flow remembers Emirates without another model call', async (t) => {
  const api = await server(t);
  const first = await result(await api.send('show me Emirates balance sheet for FY2025'));
  assert.match(first.navigation!.href, /airline=Emirates.*year=2025&period=YR/);
  const next = await result(await api.send('show me financial ratios and kpis now', first.context));
  assert.match(next.navigation!.href, /^\/ratios\?airline=Emirates/);
  assert.match(next.answer, /historical years, including FY2025/);
  const back = await result(await api.send('back to financial statements', next.context));
  assert.match(back.navigation!.href, /airline=Emirates.*year=2025&period=YR/);
});

test('HTTP clarification accepts the bare airline name and retains context beyond six messages', async (t) => {
  const api = await server(t);
  const ask = await result(await api.send('show me financial ratios and kpis'));
  assert.equal(ask.navigation, null);
  assert.match(ask.answer, /Which airline/);
  let reply = await result(await api.send('Emirates', ask.context));
  assert.match(reply.navigation!.href, /^\/ratios\?airline=Emirates/);
  for (let count = 0; count < 7; count++) {
    reply = await result(await api.send('show financial ratios now', reply.context));
    assert.match(reply.navigation!.href, /airline=Emirates/);
  }
});

test('HTTP failure preserves context for retry, diagnoses safely, and does not contaminate the answer', async (t) => {
  let attempts = 0;
  const api = await server(t, {
    classify: async () => {
      if (++attempts === 1) throw new AssistantFailure('invalid_model_json');
      return normalizeAssistantPlan({ intent: 'ratio_lookup', ratioId: 'ebitda-margin' });
    },
  });
  const first = await result(await api.send('show Emirates balance sheet FY2025'));
  const failed = await api.send('what is the EBITDA margin for that airline?', first.context);
  assert.equal(failed.status, 502);
  const failure = await failed.json() as AssistantChatError;
  assert.equal(failure.code, 'invalid_model_json');
  assert.ok(failure.context);
  assert.deepEqual(failure.context.selection, first.context.selection);
  const retry = await result(await api.send('what is the EBITDA margin for that airline?', failure.context));
  assert.deepEqual(retry.context.selection, first.context.selection);
  assert.match(retry.navigation!.href, /airline=Emirates/);
  const logs = api.logs.join('');
  assert.match(logs, /invalid_model_json/);
  assert.doesNotMatch(logs, /Emirates|EBITDA|placeholder|financialYear|2025/);
});

test('HTTP mixed known and unknown names never produce an Emirates-only link', async (t) => {
  const api = await server(t);
  const response = await result(await api.send('show financial ratios for Emirates and Unknown Airways'));
  assert.equal(response.navigation, null);
  assert.match(response.answer, /could not match/);
  assert.deepEqual(response.context.selection.airlines, []);
});

test('HTTP request validation rejects malformed conversation state without logging its contents', async (t) => {
  const api = await server(t);
  const response = await api.send('show ratios', undefined, { context: { selection: { airlines: 'not-an-array' } } });
  assert.equal(response.status, 400);
  assert.equal((await response.json() as AssistantChatError).code, 'request_validation');
  assert.doesNotMatch(api.logs.join(''), /not-an-array|show ratios/);
});

test('model parser categorizes malformed and incomplete plans without exposing provider contents', () => {
  for (const value of ['Emirates', '{"intent":', '[not-json]']) {
    assert.throws(() => parseModelPlan(value), (error: unknown) =>
      error instanceof AssistantFailure && error.category === 'invalid_model_json' && !error.message.includes('Emirates'));
  }
  assert.throws(() => parseModelPlan('{"intent":"navigation"}'), (error: unknown) =>
    error instanceof AssistantFailure && error.category === 'invalid_model_plan');
  const plan = normalizeAssistantPlan({ intent: 'navigation', navigateTo: 'ratios', airlines: ['Emirates'] });
  assert.deepEqual(parseModelPlan(JSON.stringify(plan)), plan);
});
