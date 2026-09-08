import { Request, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../../middleware/errorHandler';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { aiEngineUrl, AI_ENGINE_TIMEOUT_MS } from '../../shared/utils/aiEngine';
import { buildStudentContext } from './chat.context';

const chatSchema = z.object({ message: z.string().min(1).max(1000) });

/**
 * What the student is told when the AI engine cannot be reached.
 *
 * This used to be a keyword→answer lookup table of ten "regulation" answers.
 * They were hardcoded, they duplicated the real corpus, and by this point
 * several were simply WRONG about the system they described: a 40-hour weekly
 * minimum that is actually coordinator-configured and defaults to none, a
 * Friday 23:59 deadline the scheduler does not use, a mid-term report due in
 * "week 12" of a six-week programme, and an "Approved" status the state machine
 * does not have.
 *
 * An assistant that answers confidently from stale rules is worse than one that
 * says it is unavailable, so it says that. The regulations now live in one
 * place — `docs/knowledge/` — and are retrieved by the engine.
 */
function unavailableMessage(): string {
  return (
    'The assistant is temporarily unavailable, so I can\'t answer from the '
    + 'regulations right now. Please try again in a moment. For anything urgent — '
    + 'a deadline, a placement problem, or a question about your marks — contact '
    + 'your academic supervisor, or the programme coordinator if it is unresolved.'
  );
}

// Each SSE event carries a JSON-encoded chunk so any content — spaces, newlines,
// punctuation — survives the framing intact. The client JSON-parses each `data:`.
function sse(res: Response, chunk: string): void {
  res.write(`data: ${JSON.stringify(chunk)}\n\n`);
}

// Short timeout on purpose: this feeds a status dot, not a job. A cold-sleeping
// engine (30–60s wake) reads as "limited" until it's actually answering fast.
const HEALTH_TIMEOUT_MS = 8_000;

/**
 * Reports whether the Groq-backed AI engine is reachable. `engine:false` means
 * the assistant cannot answer at all — it no longer has a local fallback corpus
 * to pretend with.
 */
export async function healthHandler(_req: Request, res: Response) {
  let engine = false;
  try {
    const upstream = await fetch(aiEngineUrl('/health'), {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    engine = upstream.ok;
  } catch {
    engine = false;
  }

  // How many regulation passages the assistant can actually retrieve from.
  //
  // "Grounded in CS Department regulations" was a claim with nothing behind it
  // for months — the retrieval index was built from a dozen hardcoded strings
  // in a `/tmp` file that Render wiped on every restart. Reporting the corpus
  // size here makes the claim checkable by anyone who can read this endpoint,
  // instead of something we simply assert in the UI.
  let knowledge: { passages: number; sources: number } | null = null;
  if (engine) {
    try {
      const r = await fetch(aiEngineUrl('/ai/knowledge/status'), {
        headers: { 'x-api-key': env.AI_ENGINE_API_KEY },
        signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      });
      if (r.ok) {
        const body = (await r.json()) as { passages?: number; sources?: unknown[] };
        knowledge = {
          passages: body.passages ?? 0,
          sources:  Array.isArray(body.sources) ? body.sources.length : 0,
        };
      }
    } catch {
      // A corpus that cannot be counted is not an engine that is down.
      knowledge = null;
    }
  }

  res.json({ engine, knowledge });
}

/**
 * Student assistant. Proxies the message to the AI engine's Groq-backed chat
 * (`/ai/chat`), streaming its tokens back as SSE. If the engine is unreachable
 * (cold-sleep/outage/timeout) or returns nothing, it falls back to the local
 * regulations knowledge base so the assistant always answers — never a dead box.
 * Session = the student's user id, so the engine keeps per-student history.
 */
export async function chatHandler(req: Request, res: Response) {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, 'Message is required');
  const userId = req.user!.sub;
  const message = parsed.data.message;

  // Facts about the asker, so "how many days have I logged?" has an answer.
  // Built from the authenticated id and only for students: a supervisor asking
  // the assistant a question is not asking about a logbook of their own, and
  // sending someone else's figures would be both wrong and a disclosure.
  const context = req.user!.role === 'student' ? await buildStudentContext(userId) : '';

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const askEngine = () => fetch(aiEngineUrl('/ai/chat'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': env.AI_ENGINE_API_KEY },
    body: JSON.stringify({ session_id: userId, student_id: userId, message, context }),
    signal: AbortSignal.timeout(AI_ENGINE_TIMEOUT_MS),
  });

  try {
    // Inferred, not `Response`: this file imports Express's Response and the
    // two names collide.
    let upstream: Awaited<ReturnType<typeof askEngine>>;
    try {
      upstream = await askEngine();
      if (!upstream.ok || !upstream.body) throw new Error(`AI engine returned ${upstream.status}`);
    } catch (first) {
      // One retry, because the most common failure here is not a broken engine
      // but a suspended one: the hosting plan stops the service after a quiet
      // spell and waking it takes longer than a person will wait. The attempt
      // that fails is also the attempt that wakes it, so the second almost
      // always succeeds. A keep-warm job should make this rare; this is what
      // catches the times it is not.
      //
      // Safe to retry: nothing has been streamed to the client yet, and the
      // engine writes the transcript only after it has answered, so a failed
      // first attempt leaves nothing behind to duplicate.
      logger.info('Chat: first attempt failed, retrying once in case the engine was asleep', {
        err: first instanceof Error ? first.message : String(first),
      });
      upstream = await askEngine();
      if (!upstream.ok || !upstream.body) throw new Error(`AI engine returned ${upstream.status}`);
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let streamed = false;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      if (chunk) { sse(res, chunk); streamed = true; }
    }
    // Engine answered empty → use the KB so the user still gets a reply.
    if (!streamed) sse(res, unavailableMessage());
  } catch (err) {
    logger.warn('Chat: AI engine unavailable, using local fallback', { err: err instanceof Error ? err.message : String(err) });
    sse(res, unavailableMessage());
  }

  res.write('data: [DONE]\n\n');
  res.end();
}

// ── Student writing assistance ────────────────────────────────

const assistSchema = z.object({
  notes:      z.string().max(8_000).default(''),
  skills:     z.string().max(8_000).default(''),
  weekNumber: z.coerce.number().int().min(1).max(52).optional(),
});

/**
 * Expand a student's OWN rough notes into a logbook entry.
 *
 * Not a generator: the log is evidence a supervisor reads and the quality score
 * is derived from, so the engine is instructed to add nothing the notes do not
 * already contain, and to answer with prompting questions rather than prose
 * when there is too little to expand.
 *
 * Fail-open. If the engine is unreachable the response is
 * `{ available: false }` and the UI simply offers nothing — the student can
 * always write the entry themselves, which is the point.
 */
export async function assistDayEntryHandler(req: Request, res: Response) {
  const input = assistSchema.parse(req.body);

  try {
    const r = await fetch(aiEngineUrl('/ai/assist/day-entry'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.AI_ENGINE_API_KEY,
      },
      body: JSON.stringify({
        notes: input.notes,
        skills: input.skills,
        week_number: input.weekNumber ?? null,
      }),
      signal: AbortSignal.timeout(AI_ENGINE_TIMEOUT_MS),
    });

    if (!r.ok) {
      logger.warn('AI assist: engine returned a non-2xx', { status: r.status });
      return res.json({ status: 'success', data: { available: false } });
    }

    const body = (await r.json()) as {
      available: boolean; text?: string | null; questions?: string[]; model?: string | null;
    };
    return res.json({
      status: 'success',
      data: {
        available: !!body.available,
        text:      body.text ?? null,
        questions: body.questions ?? [],
      },
    });
  } catch (err) {
    logger.warn('AI assist: engine unreachable', { err: (err as Error).message });
    return res.json({ status: 'success', data: { available: false } });
  }
}
