import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Router, type IRouter } from 'express';
import {
  answerAssistantPlan,
  getAssistantCatalog,
  normalizeAssistantPlan,
  type AssistantDatasets,
  type AssistantPlan,
} from '../lib/assistant-data';

const router: IRouter = Router();
const MODEL = 'google/gemini-2.5-flash';
const MAX_MESSAGE_LENGTH = 2000;
const MAX_HISTORY_MESSAGES = 6;
const rateWindows = new Map<string, { startedAt: number; count: number }>();
let datasetCache: Promise<AssistantDatasets> | null = null;

type ChatMessage = { role: 'user' | 'assistant'; content: string };

function objectValue(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateRequest(value: unknown): { message: string; history: ChatMessage[] } | null {
  if (!objectValue(value) || typeof value.message !== 'string') return null;
  const message = value.message.trim();
  if (!message || message.length > MAX_MESSAGE_LENGTH) return null;
  if (value.history !== undefined && !Array.isArray(value.history)) return null;
  const historyInput = (value.history ?? []) as unknown[];
  if (historyInput.length > MAX_HISTORY_MESSAGES) return null;
  const history: ChatMessage[] = [];
  for (const candidate of historyInput) {
    if (
      !objectValue(candidate)
      || (candidate.role !== 'user' && candidate.role !== 'assistant')
      || typeof candidate.content !== 'string'
      || candidate.content.length > MAX_MESSAGE_LENGTH
    ) return null;
    history.push({ role: candidate.role, content: candidate.content });
  }
  return { message, history };
}

function checkRateLimit(key: string) {
  const now = Date.now();
  const windowMs = 60_000;
  const limit = 12;
  const current = rateWindows.get(key);
  if (!current || now - current.startedAt >= windowMs) {
    rateWindows.set(key, { startedAt: now, count: 1 });
    if (rateWindows.size > 3000) {
      for (const [entryKey, value] of rateWindows) {
        if (now - value.startedAt >= windowMs) rateWindows.delete(entryKey);
      }
    }
    return { allowed: true, retryAfter: 0 };
  }
  if (current.count >= limit) {
    return { allowed: false, retryAfter: Math.ceil((windowMs - (now - current.startedAt)) / 1000) };
  }
  current.count += 1;
  return { allowed: true, retryAfter: 0 };
}

async function loadDatasets(): Promise<AssistantDatasets> {
  if (datasetCache) return datasetCache;
  datasetCache = (async () => {
    const candidates = [
      resolve(process.cwd(), 'dist/data'),
      resolve(process.cwd(), 'artifacts/api-server/dist/data'),
      resolve(process.cwd(), '../airline-financial-research/public/data'),
      resolve(process.cwd(), 'artifacts/airline-financial-research/public/data'),
    ];
    const directory = candidates.find((candidate) => existsSync(resolve(candidate, 'airline-financials.json')));
    if (!directory) throw new Error('Assistant data files are not included in the API build.');

    const [financialsText, rankingsText, analysisText] = await Promise.all([
      readFile(resolve(directory, 'airline-financials.json'), 'utf8'),
      readFile(resolve(directory, 'aviation-finance-rankings.json'), 'utf8'),
      readFile(resolve(directory, 'aviation-finance-analysis.json'), 'utf8'),
    ]);
    const financials: unknown = JSON.parse(financialsText);
    const rankings: unknown = JSON.parse(rankingsText);
    const analysis: unknown = JSON.parse(analysisText);
    if (
      !Array.isArray(financials)
      || financials.length === 0
      || !objectValue(rankings)
      || !Array.isArray(rankings.mlas)
      || !Array.isArray(rankings.borrowers)
      || !objectValue(analysis)
      || !Array.isArray(analysis.tables)
    ) {
      throw new Error('Assistant data files failed their structure checks.');
    }
    return {
      financials: financials as AssistantDatasets['financials'],
      rankings: rankings as AssistantDatasets['rankings'],
      analysis: analysis as AssistantDatasets['analysis'],
    };
  })().catch((error: unknown) => {
    datasetCache = null;
    throw error;
  });
  return datasetCache;
}

function parseModelPlan(rawContent: unknown): AssistantPlan {
  let content = '';
  if (typeof rawContent === 'string') content = rawContent;
  else if (Array.isArray(rawContent)) {
    content = rawContent
      .filter((part): part is { type?: string; text?: string } => objectValue(part))
      .map((part) => part.text ?? '')
      .join('');
  }
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Assistant intent response was not structured.');
  return normalizeAssistantPlan(JSON.parse(content.slice(start, end + 1)));
}

async function classifyQuestion(
  message: string,
  history: ChatMessage[],
  datasets: AssistantDatasets,
  apiKey: string,
): Promise<AssistantPlan> {
  const catalog = getAssistantCatalog(datasets);
  const systemPrompt = [
    'You are a strict query router for an airline-finance data assistant.',
    'Do not answer the user, calculate values, invent facts, or use outside knowledge.',
    'Return only one JSON object with keys: intent, airlines, metric, financialYear, reportingPeriod, ratioId, rankingType, tableId, rankLimit, trend, navigateTo.',
    'Valid intents: metric_lookup, ratio_lookup, aviation_ranking, aviation_analysis, navigation, help, unsupported.',
    'Use only exact airline and metric labels from the catalog. If you cannot identify one exactly, use an empty airlines list or null metric.',
    'For airline comparisons, identify at most three exact airlines. Do not silently omit any airline when the user names more than three.',
    'Use exact financialYear and reportingPeriod values from the catalog. A missing value is null; never convert a year or period.',
    'ratioId must be one of the catalog ratio IDs or summaries. Map requests about financial health to health_summary, profitability to profitability_summary, and liquidity to liquidity_summary.',
    'rankingType must be mlas, borrowers, capitalMarkets, or commercial. Use aviation_analysis for a named analysis table.',
    'Set trend true only when the user asks for a trend or history. For navigation-only requests, use intent navigation and set navigateTo.',
    'Valid navigateTo values: financials, statements, ratios, analytics, aviationFinance. Otherwise null.',
    'Use prior messages only to resolve references such as “that airline” or “the same period”; ignore previous numeric answers.',
    'If the question needs a web lookup, unsupported airline classification, raw cross-currency ranking, or a fact absent from this app, use unsupported.',
    `Dataset catalog: ${JSON.stringify(catalog)}`,
  ].join('\n');
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-MAX_HISTORY_MESSAGES),
    { role: 'user', content: message },
  ];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Title': 'Airline Financial Research Assistant',
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0,
        max_tokens: 8192,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`OpenRouter returned status ${response.status}.`);
    }
    const payload: unknown = await response.json();
    if (!objectValue(payload) || !Array.isArray(payload.choices) || !objectValue(payload.choices[0])) {
      throw new Error('OpenRouter response did not contain a chat completion.');
    }
    const choice = payload.choices[0];
    const assistantMessage = objectValue(choice.message) ? choice.message : null;
    if (!assistantMessage) throw new Error('OpenRouter response did not contain a message.');
    return parseModelPlan(assistantMessage.content);
  } finally {
    clearTimeout(timeout);
  }
}

function streamEvent(res: import('express').Response, event: unknown) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

router.post('/assistant/chat', async (req, res) => {
  const clientKey = req.ip || 'unknown';
  const rate = checkRateLimit(clientKey);
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(rate.retryAfter));
    res.status(429).json({ error: 'You have sent several requests. Please wait a moment and try again.' });
    return;
  }

  const body = validateRequest(req.body);
  if (!body) {
    res.status(400).json({ error: 'Please send one question of up to 2,000 characters.' });
    return;
  }
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: 'The finance assistant is temporarily unavailable.' });
    return;
  }

  try {
    const datasets = await loadDatasets();
    const plan = await classifyQuestion(body.message, body.history, datasets, apiKey);
    const answer = answerAssistantPlan(plan, datasets);
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    for (let offset = 0; offset < answer.answer.length; offset += 72) {
      streamEvent(res, { type: 'delta', content: answer.answer.slice(offset, offset + 72) });
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 12));
      if (res.destroyed) return;
    }
    streamEvent(res, { type: 'result', sources: answer.sources, navigation: answer.navigation ?? null });
    streamEvent(res, { type: 'done' });
    res.end();
  } catch (error) {
    if (res.headersSent) {
      streamEvent(res, { type: 'error', message: 'I could not complete that answer. Please try again.' });
      res.end();
      return;
    }
    const statusCode = error instanceof Error && error.message.includes('OpenRouter returned status')
      ? Number(error.message.match(/\d+/)?.[0] ?? 502)
      : 502;
    req.log.error({ statusCode }, 'Finance assistant request failed.');
    res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 502)
      .json({ error: 'I could not complete that answer. Please try again.' });
  }
});

export default router;
