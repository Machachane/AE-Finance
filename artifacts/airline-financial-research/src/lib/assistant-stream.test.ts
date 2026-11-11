import assert from 'node:assert/strict';
import test from 'node:test';
import { AssistantStreamError, readAssistantStream, safeAssistantNavigation } from './assistant-stream';

const context = { selection: { airlines: ['Emirates'], financialYear: '2025', reportingPeriod: 'YR' } };
const result = { type: 'result', sources: [], navigation: { href: '/ratios?airline=Emirates', label: 'Ratios' }, context };
const encode = (event: object) => `data: ${JSON.stringify(event)}\r\n\r\n`;
function stream(text: string, step = 3) {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += step) controller.enqueue(bytes.slice(i, i + step));
      controller.close();
    },
  });
}

test('chunked SSE commits navigation and context only after done', async () => {
  let content = '';
  const response = await readAssistantStream(stream([
    { type: 'delta', content: 'Emirates · FY2025' }, result, { type: 'done' },
  ].map(encode).join('')), (text) => { content += text; });
  assert.equal(content, 'Emirates · FY2025');
  assert.deepEqual(response.context, context);
  assert.equal(response.navigation?.href, '/ratios?airline=Emirates');
});

test('a truncated answer fails even when some answer text and navigation arrived', async () => {
  await assert.rejects(readAssistantStream(stream(encode({ type: 'delta', content: 'Partial' }) + encode(result)), () => {}),
    (error: unknown) => error instanceof AssistantStreamError
      && /interrupted/.test(error.message) && error.context?.selection.airlines[0] === 'Emirates');
});

test('a server error invalidates partial output while retaining context for retry', async () => {
  await assert.rejects(readAssistantStream(stream(encode(result) + encode({
    type: 'error', message: 'Please retry.', context,
  })), () => {}), (error: unknown) =>
    error instanceof AssistantStreamError && error.message === 'Please retry.' && !!error.context);
});

test('invalid stream data or done without a result cannot produce a completed answer', async () => {
  for (const text of [encode({ type: 'done' }), 'data: invalid\n\n', encode({ type: 'delta', content: 'Only text' })]) {
    await assert.rejects(readAssistantStream(stream(text), () => {}), AssistantStreamError);
  }
});

test('navigation accepts only internal supported destinations', () => {
  for (const href of ['https://evil.test/ratios', '//evil.test/ratios', '/unknown', 'javascript:alert(1)']) {
    assert.equal(safeAssistantNavigation({ href, label: 'Open' }), null);
  }
});
