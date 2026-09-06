import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send, Loader2, Bot, User, Sparkles, Trash2, Zap, ShieldCheck, Target,
  Clock, FileCheck2, CalendarClock, Building2, GraduationCap, Lightbulb,
} from 'lucide-react';
import { getAccessToken, API_BASE } from '@/lib/api';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  streaming?: boolean;
}

const SUGGESTED_QUESTIONS: { q: string; icon: React.ElementType }[] = [
  { q: 'What is the minimum weekly hours for my placement?', icon: Clock },
  { q: 'When is the mid-term report due?',                   icon: CalendarClock },
  { q: 'What happens if I miss a logbook submission?',       icon: FileCheck2 },
  { q: 'How is my quality score calculated?',                icon: Target },
];

/**
 * The rail's topic list. Each row is a real question the assistant is asked on
 * click — the reference shows these as navigation into topic pages, but there
 * are no topic pages, and a link to nothing is worse than a link that works.
 */
const POPULAR_TOPICS: { label: string; q: string; icon: React.ElementType }[] = [
  { label: 'CS internship regulations', icon: ShieldCheck,   q: 'Summarise the CS internship regulations.' },
  { label: 'Logbook requirements',      icon: FileCheck2,    q: 'What are the logbook requirements?' },
  { label: 'Reporting & deadlines',     icon: CalendarClock, q: 'What reports are due, and when?' },
  { label: 'Placements & companies',    icon: Building2,     q: 'How are placements and host companies approved?' },
  { label: 'Grading & evaluation',      icon: GraduationCap, q: 'How is my final grade worked out?' },
];

const CAPABILITIES = [
  { icon: Zap,         title: 'Instant answers',       body: 'Accurate answers drawn from CS Department regulations.' },
  { icon: ShieldCheck, title: 'Up-to-date information', body: 'Grounded in the current policies and guidelines.' },
  { icon: Target,      title: 'Actionable guidance',    body: 'Step-by-step help for processes and requirements.' },
];

const GREETING = 'Hello! I\'m the AESIS Assistant. I can answer questions about CS internship '
  + 'regulations, logbook requirements, deadlines, and programme procedures. How can I help you today?';

export default function ChatbotPanel() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '0',
      role: 'assistant',
      content: GREETING,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  // 'checking' until the health probe answers. 'limited' = engine down but the
  // assistant still answers from the local knowledge base.
  const [engineStatus, setEngineStatus] = useState<'checking' | 'online' | 'limited'>('checking');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/ai/health`, {
      headers: { Authorization: `Bearer ${getAccessToken()}` },
    })
      .then((r) => (r.ok ? r.json() : { engine: false }))
      .then((d: { engine?: boolean }) => {
        if (!cancelled) setEngineStatus(d.engine ? 'online' : 'limited');
      })
      .catch(() => {
        if (!cancelled) setEngineStatus('limited');
      });
    return () => { cancelled = true; };
  }, []);

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

  const cleared = messages.length === 1;

  return (
    <div className="mx-auto grid max-w-[1500px] gap-5 p-4 sm:p-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-5">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-card bg-brand-soft text-brand-ink">
              <Sparkles className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-ink">
                AESIS Assistant <Badge tone="brand">AI</Badge>
              </h1>
              <p className="mt-1 text-sm text-ink-secondary">
                Your assistant for CS internship management
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setMessages([{ id: '0', role: 'assistant', content: GREETING, timestamp: new Date() }])}
            disabled={cleared}
            className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink-secondary transition-colors enabled:hover:border-brand enabled:hover:text-brand-ink disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" /> Clear chat
          </button>
        </header>

        {/* ── Conversation ─────────────────────────────────── */}
        <Card className="flex min-h-[26rem] flex-col p-0" padded={false}>
          <div className="scrollbar-thin flex-1 space-y-5 overflow-y-auto p-5">
            {cleared && (
              <div className="mb-2">
                <p className="text-lg font-bold text-ink">Hello! I&rsquo;m the AESIS Assistant.</p>
                <p className="mt-1 max-w-xl text-sm leading-relaxed text-ink-secondary">
                  I can help with CS internship regulations, logbook requirements, deadlines,
                  programme procedures and more.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {CAPABILITIES.map(({ icon: Icon, title, body }) => (
                    <div key={title} className="rounded-card border border-line bg-surface-sunken p-3">
                      <span className="mb-2 grid h-7 w-7 place-items-center rounded-lg bg-brand-soft text-brand-ink">
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <p className="text-sm font-semibold text-ink">{title}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{body}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-brand bg-brand-soft">
                    <Bot className="h-3.5 w-3.5 text-brand-ink" />
                  </span>
                )}
                <div className={`max-w-[75%] whitespace-pre-wrap rounded-xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'rounded-tr-sm bg-brand text-ink-inverse'
                    : 'rounded-tl-sm border border-line bg-surface-sunken text-ink'
                }`}>
                  {msg.content}
                  {msg.streaming && <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-brand" />}
                </div>
                {msg.role === 'user' && (
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-line bg-surface-sunken">
                    <User className="h-3.5 w-3.5 text-ink-secondary" />
                  </span>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* ── Composer ───────────────────────────────────── */}
          <div className="border-t border-line p-5">
            <div className="flex items-end gap-3 rounded-card border border-line bg-surface p-3 transition-colors focus-within:border-brand">
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about regulations, deadlines, or procedures…"
                className="scrollbar-thin max-h-32 min-h-[24px] flex-1 resize-none bg-transparent text-sm text-ink placeholder:text-ink-muted focus:outline-none"
              />
              <button
                type="button"
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || loading}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand text-ink-inverse transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Send message"
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </button>
            </div>
            {/*
              The reference puts "Attach file", "Search documents" and a
              grounding toggle along this bar. None of the three has an
              endpoint, and grounding is not optional — every answer is
              regulation-only — so the line below states that rather than
              offering a switch that changes nothing.
            */}
            <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-ink-muted">
              <ShieldCheck className="h-3.5 w-3.5" />
              Answers are grounded in CS Department regulations only. Not general web knowledge.
            </p>
          </div>
        </Card>

        {/* ── Suggested questions ──────────────────────────── */}
        {cleared && (
          <section>
            <h2 className="mb-3 text-[15px] font-semibold text-ink">Suggested questions</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {SUGGESTED_QUESTIONS.map(({ q, icon: Icon }) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => sendMessage(q)}
                  className="flex items-center gap-3 rounded-card border border-line bg-surface p-4 text-left shadow-card transition-colors hover:border-brand"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand-ink">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-sm font-medium text-ink">{q}</span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* ── Right rail ─────────────────────────────────────── */}
      <aside className="space-y-5">
        <Card>
          <CardHeader title="Popular topics" subtitle="Asks the assistant on your behalf" />
          <ul className="space-y-1">
            {POPULAR_TOPICS.map(({ label, q, icon: Icon }) => (
              <li key={label}>
                <button
                  type="button"
                  onClick={() => sendMessage(q)}
                  disabled={loading}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors enabled:hover:bg-surface-sunken disabled:opacity-50"
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-surface-sunken text-ink-secondary">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{label}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Assistant status" />
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${
              engineStatus === 'online' ? 'bg-ok'
              : engineStatus === 'limited' ? 'bg-warn'
              : 'animate-pulse bg-ink-muted'
            }`} />
            <span className="text-sm font-semibold text-ink">
              {engineStatus === 'online' ? 'Online'
                : engineStatus === 'limited' ? 'Limited'
                : 'Checking…'}
            </span>
          </div>
          {/*
            The reference shows an "AI confidence: High" badge. Nothing here
            measures confidence, so this reports the one thing that IS known —
            whether the engine answered the health probe.
          */}
          <p className="mt-2 text-xs leading-relaxed text-ink-muted">
            {engineStatus === 'limited'
              ? 'The AI engine is unreachable, so answers come from the built-in regulation knowledge base only.'
              : 'Answers are drawn from CS Department regulations and verified documents.'}
          </p>
        </Card>

        <Card>
          <CardHeader title="Tips" />
          <ul className="space-y-2.5">
            {[
              'Be specific — name the week, report or rule you mean.',
              'Include dates, your company, or the context.',
              'Follow-up questions keep the thread.',
            ].map((t) => (
              <li key={t} className="flex items-start gap-2.5">
                <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-ink" />
                <span className="text-xs leading-relaxed text-ink-secondary">{t}</span>
              </li>
            ))}
          </ul>
        </Card>
      </aside>
    </div>
  );
}
