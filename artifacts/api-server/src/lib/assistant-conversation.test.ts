import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeAssistantPlan, answerAssistantPlan, type AssistantDatasets } from './assistant-data';
import {
  conversationContextAfterPlan, deterministicConversationPlan,
  resolveConversationPlan, validateConversationContext, type AssistantConversationContext,
} from './assistant-conversation';

const dataDir = resolve(import.meta.dirname, '../../../airline-financial-research/public/data');
export const data: AssistantDatasets = {
  financials: JSON.parse(readFileSync(resolve(dataDir, 'airline-financials.json'), 'utf8')),
  rankings: JSON.parse(readFileSync(resolve(dataDir, 'aviation-finance-rankings.json'), 'utf8')),
  analysis: JSON.parse(readFileSync(resolve(dataDir, 'aviation-finance-analysis.json'), 'utf8')),
};

const empty = () => validateConversationContext(undefined, data);
function turn(message: string, context = empty(), model = normalizeAssistantPlan({ intent: 'help' })) {
  const plan = resolveConversationPlan(deterministicConversationPlan(message, context, data) ?? model, message, context, data);
  return { answer: answerAssistantPlan(plan, data), context: conversationContextAfterPlan(plan, context, data), plan };
}

test('the screenshot sequence retains Emirates and FY2025 when opening ratios and statements', () => {
  const first = turn('show me emirates balance sheet for fy2025');
  assert.match(first.answer.navigation!.href, /airline=Emirates.*year=2025&period=YR/);
  const second = turn('show me financial ratios and kpis now', first.context);
  assert.match(second.answer.navigation!.href, /^\/ratios\?airline=Emirates/);
  assert.match(second.answer.answer, /historical years, including FY2025/);
  const third = turn('back to financial statements', second.context);
  assert.match(third.answer.navigation!.href, /airline=Emirates.*year=2025&period=YR/);
});

test('connecting words before filters do not erase a validated airline selection', () => {
  let context = turn('show me Emirates balance sheet for FY2025').context;
  for (const message of [
    'show ratios for Emirates in FY2025',
    'show financial ratios for Emirates during financial year 2025',
    'show ratios for the airline Emirates in the year 2025',
    'show ratios for Emirates as of FY2025',
  ]) {
    const reply = turn(message, context);
    assert.ok(reply.answer.navigation, `${message}: ${reply.answer.answer}`);
    assert.match(reply.answer.navigation!.href, /^\/ratios\?airline=Emirates/, message);
    assert.deepEqual(reply.context.selection, { airlines: ['Emirates'], financialYear: '2025', reportingPeriod: 'YR' });
    context = reply.context;
  }
  const unknown = turn('show ratios for Emirates and Unknown Airways in FY2025', context);
  assert.equal(unknown.answer.navigation, undefined);
  assert.match(unknown.answer.answer, /could not match/);
  const comparison = turn('show ratios for Emirates with Air Busan in FY2025', context);
  assert.match(comparison.answer.navigation!.href, /airline=.*compare=/);
});

test('an airline-only reply completes the pending ratios request', () => {
  const first = turn('show me financial ratios and kpis');
  assert.match(first.answer.answer, /Which airline/);
  const reply = turn('emirates', first.context);
  assert.match(reply.answer.navigation!.href, /^\/ratios\?airline=Emirates/);
  assert.equal(reply.plan.intent, 'navigation');
});

test('structured context survives many exchanges without any raw history', () => {
  let context = turn('show me Emirates balance sheet for FY2025').context;
  for (let i = 0; i < 8; i++) {
    context = turn(i % 2 ? 'show financial statements' : 'show financial ratios and KPIs now', context).context;
  }
  assert.deepEqual(context.selection, { airlines: ['Emirates'], financialYear: '2025', reportingPeriod: 'YR' });
});

test('explicit airline changes override old selections and revalidate inherited years', () => {
  const first = turn('show Emirates balance sheet FY2025');
  const changed = turn('show Air Busan balance sheet', first.context);
  assert.match(changed.answer.navigation!.href, /airline=Air\+Busan/);
  assert.doesNotMatch(changed.answer.navigation!.href, /Emirates/);
  const changedYear = turn('FY2026', first.context);
  assert.match(changedYear.answer.navigation!.href, /year=2026/);
  assert.match(changedYear.answer.navigation!.href, /airline=Emirates/);
});

test('unresolved additional names block partial navigation even when the model omitted them', () => {
  const first = turn('show Emirates balance sheet FY2025');
  for (const message of [
    'show Emirates and Unknown Airways balance sheets for FY2025',
    'show financial ratios for Unknown Airways',
    'show financial ratios for Emirates, Mystery Jet',
    'show financial ratios for Emirates and Go',
  ]) {
    const result = turn(message, first.context, normalizeAssistantPlan({
      intent: 'navigation', navigateTo: 'ratios', airlines: ['Emirates'],
    }));
    assert.equal(result.answer.navigation, undefined, message);
    assert.match(result.answer.answer, /could not match/);
    assert.deepEqual(result.context.selection.airlines, []);
  }
});

test('an explicit correction replaces a previously unresolved airline', () => {
  const unknown = turn('show financial ratios for Unknown Airways');
  const corrected = turn('Emirates', unknown.context);
  assert.match(corrected.answer.navigation!.href, /^\/ratios\?airline=Emirates/);
});

test('omitted unknown entities also block partial financial answers, not only page links', () => {
  const result = turn('What is Total Revenue for Emirates and Unknown Airways for FY2025 YR?', empty(),
    normalizeAssistantPlan({ intent: 'metric_lookup', metric: 'Total Revenue', airlines: ['Emirates'] }));
  assert.equal(result.answer.navigation, undefined);
  assert.match(result.answer.answer, /could not match/);
  assert.equal(result.answer.sources.length, 0);
});

test('conflicting years and explicit invalid periods clarify instead of inheriting older filters', () => {
  const context = turn('show Emirates balance sheet FY2025').context;
  for (const message of [
    'show Emirates balance sheet for FY2025 and FY2026',
    'show Emirates balance sheet for FY2025 Q9',
  ]) {
    const result = turn(message, context);
    assert.equal(result.answer.navigation, undefined);
  }
});

test('client selections are revalidated against the loaded airline-year-period combinations', () => {
  const context = validateConversationContext({
    selection: { airlines: ['Invented Air'], financialYear: '2025', reportingPeriod: 'YR' },
  }, data);
  assert.deepEqual(context, empty());
  const year = validateConversationContext({
    selection: { airlines: ['Emirates'], financialYear: '1900', reportingPeriod: 'Q9' },
  }, data);
  assert.deepEqual(year.selection, { airlines: ['Emirates'], financialYear: null, reportingPeriod: null });
});

test('help does not erase validated selections or the pending request', () => {
  const context = turn('show Emirates balance sheet FY2025').context;
  const next = turn('what can you answer?', context);
  assert.deepEqual(next.context, context);
});
