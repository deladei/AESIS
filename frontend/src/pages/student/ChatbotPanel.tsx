import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, Bot, User, Sparkles } from 'lucide-react';
import { getAccessToken, API_BASE } from '@/lib/api';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  streaming?: boolean;
}

const SUGGESTED_QUESTIONS = [
  'What is the minimum weekly hours for my placement?',
  'When is the mid-term report due?',
  'What happens if I miss a logbook submission?',
  'How is my quality score calculated?',
];

export default function ChatbotPanel() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '0',
      role: 'assistant',
      content:
        'Hello! I\'m the AESIS Assistant. I can answer questions about CS internship regulations, logbook requirements, deadlines, and programme procedures. How can I help you today?',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    const assistantId = (Date.now() + 1).toString();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: 'assistant', content: '', timestamp: new Date(), streaming: true },
    ]);

    try {
      const token = getAccessToken();
      const resp = await fetch(`${API_BASE}/ai/chat`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: text.trim() }),
      });

      if (!resp.ok || !resp.body) throw new Error('Stream unavailable');

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';
      let buffer = '';
      let finished = false;

      // SSE events are "data: <payload>\n\n". Buffer across network reads so a
      // line split between chunks isn't dropped; each payload is a JSON-encoded
      // text chunk (falls back to raw for any non-JSON line).
      while (!finished) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6);
          if (payload === '[DONE]') { finished = true; break; }
          let text: string;
          try { text = JSON.parse(payload); } catch { text = payload; }
          accumulated += text;
          setMessages((prev) =>
            prev.map((m) => m.id === assistantId ? { ...m, content: accumulated } : m),
          );
        }
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: 'Sorry, the assistant is temporarily unavailable. Please try again.' }
            : m,
        ),
      );
    } finally {
      setMessages((prev) =>
        prev.map((m) => m.id === assistantId ? { ...m, streaming: false } : m),
      );
      setLoading(false);
    }
  }, [loading]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div className="flex h-[calc(100vh-0px)] flex-col bg-[var(--h-f7f8fb)]">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-[var(--h-e2e6ef)] bg-[var(--h-ffffff)] px-6 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--h-dcc9ff)] bg-[var(--h-f1ecff)]">
          <Sparkles className="h-[18px] w-[18px] text-[var(--h-712ae2)]" />
        </div>
        <div>
          <h1 className="text-sm font-semibold text-[var(--h-0b1c30)]">AESIS Assistant</h1>
          <p className="text-xs text-[var(--h-64748b)]">CS Internship Knowledge Base · regulation-grounded</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[var(--h-1b7a45)]" />
          <span className="text-xs text-[var(--h-64748b)]">Online</span>
        </div>
      </div>

      {/* Messages */}
      <div className="scrollbar-thin flex-1 space-y-5 overflow-y-auto px-6 py-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--h-dcc9ff)] bg-[var(--h-f1ecff)]">
                <Bot className="h-3.5 w-3.5 text-[var(--h-712ae2)]" />
              </div>
            )}
            <div className={`max-w-[75%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'rounded-tr-sm bg-[var(--h-15157d)] text-white'
                : 'rounded-tl-sm border border-[var(--h-e2e6ef)] bg-[var(--h-ffffff)] text-[var(--h-1f2a3a)]'
            }`}>
              {msg.content}
              {msg.streaming && (
                <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-[var(--h-712ae2)]" />
              )}
            </div>
            {msg.role === 'user' && (
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--h-d8dce6)] bg-[var(--h-eef0f5)]">
                <User className="h-3.5 w-3.5 text-[var(--h-64748b)]" />
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Suggested questions */}
      {messages.length === 1 && (
        <div className="shrink-0 px-6 pb-3">
          <p className="mb-2 text-xs text-[var(--h-64748b)]">Suggested questions</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_QUESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => sendMessage(q)}
                className="cursor-pointer rounded-full border border-[var(--h-d8dce6)] bg-[var(--h-ffffff)] px-3 py-1.5 text-xs text-[var(--h-464652)] transition-colors hover:border-[var(--h-8a4cfc)] hover:bg-[var(--h-f6f2ff)] hover:text-[var(--h-712ae2)]"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="shrink-0 border-t border-[var(--h-e2e6ef)] bg-[var(--h-ffffff)] px-6 pb-6 pt-3">
        <div className="flex items-end gap-3 rounded-xl border border-[var(--h-d8dce6)] bg-[var(--h-ffffff)] p-3 transition-colors focus-within:border-[var(--h-8a4cfc)] focus-within:ring-1 focus-within:ring-[var(--h-8a4cfc)]">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about regulations, deadlines, or procedures…"
            className="scrollbar-thin max-h-32 flex-1 resize-none bg-transparent text-sm text-[var(--h-0b1c30)] placeholder-[var(--h-94a3b8)] focus:outline-none"
            style={{ minHeight: '24px' }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-[var(--h-15157d)] transition-colors hover:bg-[var(--h-1f1fa0)] disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Send message"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />
            ) : (
              <Send className="h-3.5 w-3.5 text-white" />
            )}
          </button>
        </div>
        <p className="mt-2 text-center text-xs text-[var(--h-94a3b8)]">
          Answers are grounded in CS Department regulations only. Not general web knowledge.
        </p>
      </div>
    </div>
  );
}
