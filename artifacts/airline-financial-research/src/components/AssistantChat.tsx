import { Fragment, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Bot, ExternalLink, MessageCircle, Send, Sparkles, X } from 'lucide-react';
import { useLocation } from 'wouter';

type Source = { label: string; url?: string };
type Navigation = { label: string; href: string };
type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  navigation?: Navigation | null;
};
type ServerEvent =
  | { type: 'delta'; content: string }
  | { type: 'result'; sources: Source[]; navigation: Navigation | null }
  | { type: 'error'; message: string }
  | { type: 'done' };

const MAX_QUESTION_LENGTH = 2000;
let messageSequence = 0;

function newId() {
  messageSequence += 1;
  return `assistant-message-${Date.now()}-${messageSequence}`;
}

function parseServerEvent(data: string): ServerEvent | null {
  try {
    const parsed: unknown = JSON.parse(data);
    if (!parsed || typeof parsed !== 'object' || !('type' in parsed)) return null;
    return parsed as ServerEvent;
  } catch {
    return null;
  }
}

function renderAnswerLine(line: string) {
  return line.split(/(\*\*[^*]+\*\*)/g).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}

export default function AssistantChat() {
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const messageListRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messageIdRef = useRef('');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const list = messageListRef.current;
    if (list) list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
  }, [messages, open]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const updateAssistantMessage = (update: (message: ChatMessage) => ChatMessage) => {
    setMessages((current) => current.map((message) =>
      message.id === messageIdRef.current ? update(message) : message,
    ));
  };

  const submitQuestion = async (event?: FormEvent, quickQuestion?: string) => {
    event?.preventDefault();
    const question = (quickQuestion ?? input).trim();
    if (!question || loading) return;
    if (question.length > MAX_QUESTION_LENGTH) {
      setError('Please keep your question under 2,000 characters.');
      return;
    }

    setError('');
    setInput('');
    setLoading(true);
    const history = messages
      .filter((message) => message.content.trim())
      .slice(-6)
      .map(({ role, content }) => ({ role, content: content.slice(0, MAX_QUESTION_LENGTH) }));
    const assistantId = newId();
    messageIdRef.current = assistantId;
    setMessages((current) => [
      ...current,
      { id: newId(), role: 'user', content: question },
      { id: assistantId, role: 'assistant', content: '' },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ message: question, history }),
        signal: controller.signal,
      });

      if (!response.ok) {
        let message = 'The finance assistant is temporarily unavailable. Please try again.';
        try {
          const body = await response.json() as { error?: string };
          if (body.error) message = body.error;
        } catch {
          // Keep the concise fallback for non-JSON errors.
        }
        throw new Error(message);
      }
      if (!response.body) throw new Error('The assistant response stream was unavailable. Please try again.');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let completed = false;
      while (!completed) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
        let separator = buffer.indexOf('\n\n');
        while (separator >= 0) {
          const block = buffer.slice(0, separator);
          buffer = buffer.slice(separator + 2);
          const data = block.split('\n')
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trim())
            .join('\n');
          const serverEvent = parseServerEvent(data);
          if (serverEvent?.type === 'delta') {
            updateAssistantMessage((message) => ({ ...message, content: message.content + serverEvent.content }));
          } else if (serverEvent?.type === 'result') {
            updateAssistantMessage((message) => ({
              ...message,
              sources: serverEvent.sources,
              navigation: serverEvent.navigation,
            }));
          } else if (serverEvent?.type === 'error') {
            updateAssistantMessage((message) => ({ ...message, content: serverEvent.message }));
          } else if (serverEvent?.type === 'done') {
            completed = true;
          }
          separator = buffer.indexOf('\n\n');
        }
      }
      if (!completed && !controller.signal.aborted) {
        updateAssistantMessage((message) => message.content
          ? message
          : { ...message, content: 'The assistant response ended unexpectedly. Please try again.' });
      }
    } catch (requestError) {
      if (controller.signal.aborted) return;
      const message = requestError instanceof Error ? requestError.message : 'The finance assistant is temporarily unavailable.';
      updateAssistantMessage((assistantMessage) => ({ ...assistantMessage, content: message }));
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setLoading(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submitQuestion();
    }
  };

  return (
    <div className="finance-assistant">
      {open && (
        <section id="assistant-panel" className="assistant-panel" role="dialog" aria-label="Finance assistant chat" data-testid="assistant-panel">
          <header className="assistant-header">
            <span className="assistant-avatar"><Sparkles size={16} aria-hidden="true" /></span>
            <div className="assistant-heading">
              <strong>Finance Assistant</strong>
              <span>Source-linked answers from platform data</span>
            </div>
            <button className="assistant-close" type="button" onClick={() => setOpen(false)} aria-label="Close assistant">
              <X size={18} />
            </button>
          </header>

          <div className="assistant-messages" ref={messageListRef} aria-live="polite" aria-relevant="additions text">
            {messages.length === 0 ? (
              <div className="assistant-welcome">
                <span className="assistant-welcome-icon"><Bot size={22} /></span>
                <h2>Ask about airline finance</h2>
                <p>Look up reported figures, calculate ratios, explore trends, or find Aviation Finance rankings.</p>
                <button type="button" onClick={() => void submitQuestion(undefined, 'What can you answer using the platform data?')}>
                  What can I ask?
                </button>
              </div>
            ) : messages.map((message) => (
              <article className={`assistant-message assistant-message-${message.role}`} key={message.id}>
                <div className="assistant-message-content">
                  {message.content
                    ? <p>{message.content.split('\n').map((line, index) => (
                      <Fragment key={index}>{index > 0 && <br />}{renderAnswerLine(line)}</Fragment>
                    ))}</p>
                    : loading && message.id === messageIdRef.current
                      ? <span className="assistant-typing"><i /><i /><i /><span className="sr-only">Searching the loaded data</span></span>
                      : null}
                </div>
                {!!message.sources?.length && (
                  <div className="assistant-sources">
                    <span className="assistant-sources-title">Sources</span>
                    {message.sources.map((source, index) => source.url ? (
                      <a key={`${source.url}-${index}`} href={source.url} target="_blank" rel="noopener noreferrer">
                        <span>[{index + 1}] {source.label}</span><ExternalLink size={12} aria-hidden="true" />
                      </a>
                    ) : (
                      <span className="assistant-source-file" key={`${source.label}-${index}`}>[{index + 1}] {source.label}</span>
                    ))}
                  </div>
                )}
                {message.navigation && (
                  <button
                    className="assistant-open-page"
                    type="button"
                    onClick={() => {
                      // A fresh selection token also reapplies an identical link
                      // after the user has manually changed the page's filters.
                      const target = new URL(message.navigation!.href, window.location.origin);
                      target.searchParams.set('_selection', newId());
                      setLocation(`${target.pathname}${target.search}`);
                      setOpen(false);
                    }}
                  >
                    Open in {message.navigation.label}<ExternalLink size={13} aria-hidden="true" />
                  </button>
                )}
              </article>
            ))}
            {error && <p className="assistant-inline-error" role="alert">{error}</p>}
          </div>

          <form className="assistant-composer" onSubmit={(event) => void submitQuestion(event)}>
            <label className="sr-only" htmlFor="finance-assistant-input">Ask a question about the platform data</label>
            <textarea
              id="finance-assistant-input"
              ref={inputRef}
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                if (error) setError('');
              }}
              onKeyDown={handleKeyDown}
              placeholder="Ask about an airline, metric, or ratio…"
              maxLength={MAX_QUESTION_LENGTH}
              rows={2}
              disabled={loading}
              data-testid="assistant-input"
            />
            <button type="submit" aria-label="Send question" disabled={loading || !input.trim()} data-testid="assistant-send">
              <Send size={16} />
            </button>
          </form>
          <p className="assistant-privacy-note">Questions are sent to OpenRouter for interpretation; figures come from the loaded source data.</p>
        </section>
      )}

      <button
        className={`assistant-launcher ${open ? 'assistant-launcher-open' : ''}`}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls="assistant-panel"
        aria-label={open ? 'Close finance assistant' : 'Open finance assistant'}
        data-testid="assistant-launcher"
      >
        {open ? <X size={19} /> : messages.length ? <MessageCircle size={19} /> : <Sparkles size={19} />}
        <span>{open ? 'Close' : 'Ask AI'}</span>
      </button>
    </div>
  );
}
