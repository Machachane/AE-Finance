import type { AssistantConversationContext } from '@workspace/api-client-react';

export type AssistantResult = {
  sources: Array<{ label: string; url?: string }>;
  navigation: { label: string; href: string } | null;
  context: AssistantConversationContext;
};

export class AssistantStreamError extends Error {
  constructor(message: string, public context?: AssistantConversationContext) {
    super(message);
  }
}

export function isAssistantContext(value: unknown): value is AssistantConversationContext {
  if (!value || typeof value !== 'object' || !('selection' in value)) return false;
  const selection = value.selection;
  return Boolean(selection && typeof selection === 'object' && 'airlines' in selection
    && Array.isArray(selection.airlines) && selection.airlines.every((name) => typeof name === 'string')
    && 'financialYear' in selection && (selection.financialYear === null || typeof selection.financialYear === 'string')
    && 'reportingPeriod' in selection && (selection.reportingPeriod === null || typeof selection.reportingPeriod === 'string'));
}

export function safeAssistantNavigation(value: unknown): AssistantResult['navigation'] {
  if (!value || typeof value !== 'object' || !('href' in value) || !('label' in value)
    || typeof value.href !== 'string' || typeof value.label !== 'string') return null;
  const target = new URL(value.href, 'https://platform.invalid');
  if (!value.href.startsWith('/') || target.origin !== 'https://platform.invalid'
    || !['/', '/statements', '/ratios', '/analytics', '/aviation-finance'].includes(target.pathname)) return null;
  return { href: `${target.pathname}${target.search}`, label: value.label };
}

export async function readAssistantStream(
  body: ReadableStream<Uint8Array>,
  onDelta: (content: string) => void,
): Promise<AssistantResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result: AssistantResult | undefined;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      let separator: RegExpExecArray | null;
      while ((separator = /\r?\n\r?\n/.exec(buffer))) {
        const block = buffer.slice(0, separator.index);
        buffer = buffer.slice(separator.index + separator[0].length);
        const data = block.split(/\r?\n/).filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trim()).join('\n');
        if (!data) continue;
        const event: unknown = JSON.parse(data);
        if (!event || typeof event !== 'object' || !('type' in event)) continue;
        if (event.type === 'delta' && 'content' in event && typeof event.content === 'string') onDelta(event.content);
        if (event.type === 'result' && 'sources' in event && Array.isArray(event.sources)
          && 'context' in event && isAssistantContext(event.context)) {
          result = {
            sources: event.sources.filter((source): source is AssistantResult['sources'][number] =>
              source && typeof source === 'object' && typeof source.label === 'string'
              && (source.url === undefined || (typeof source.url === 'string' && /^https:\/\//i.test(source.url)))),
            navigation: 'navigation' in event ? safeAssistantNavigation(event.navigation) : null,
            context: event.context,
          };
        }
        if (event.type === 'error') {
          throw new AssistantStreamError(
            'message' in event && typeof event.message === 'string' ? event.message : 'The answer was interrupted. Please retry.',
            'context' in event && isAssistantContext(event.context) ? event.context : result?.context,
          );
        }
        if (event.type === 'done') {
          if (!result) throw new AssistantStreamError('The answer was incomplete. Your selections are retained; please retry.');
          return result;
        }
      }
    }
    throw new AssistantStreamError('The answer was interrupted before completion. Your selections are retained; please retry.', result?.context);
  } catch (error) {
    if (error instanceof AssistantStreamError) throw error;
    throw new AssistantStreamError('The answer connection was interrupted. Your selections are retained; please retry.', result?.context);
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
