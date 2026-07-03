import { Request, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../../middleware/errorHandler';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { aiEngineUrl, AI_ENGINE_TIMEOUT_MS } from '../../shared/utils/aiEngine';

const chatSchema = z.object({ message: z.string().min(1).max(1000) });

// Contextual responses keyed by keyword match
const KB: { keywords: string[]; answer: string }[] = [
  {
    keywords: ['minimum', 'hours', 'weekly', 'per week'],
    answer: 'Students are required to complete a minimum of 40 hours of placement activity per week. This equates to a standard full-time working schedule aligned with the host company\'s working hours. Any deviation must be agreed in writing with the academic supervisor and reported to the coordinator.',
  },
  {
    keywords: ['logbook', 'submit', 'submission', 'deadline', 'due'],
    answer: 'Logbook entries must be submitted every Friday by 23:59 WAT for the preceding week. Late submissions are flagged in the system and affect your compliance score. If you anticipate a late submission, notify your academic supervisor before the deadline.',
  },
  {
    keywords: ['miss', 'missed', 'skip', 'skipped', 'not submit'],
    answer: 'Missing a logbook submission triggers an automatic risk flag. Your academic supervisor is notified immediately. Two consecutive missed submissions escalate your risk tier to High, which may result in a formal intervention meeting with the programme coordinator. Always communicate with your supervisor if you are unable to submit on time.',
  },
  {
    keywords: ['quality', 'score', 'calculated', 'scored', 'nlp', 'rubric'],
    answer: 'Quality scores are computed by our NLP analysis engine using four rubric dimensions: Task Description Depth (30 pts), Technical Vocabulary (25 pts), Reflection Quality (25 pts), and Temporal Consistency (20 pts). The engine also checks CS-domain relevance and plagiarism similarity against the cohort index. Scores above 75 are considered Good; 50–74 is Satisfactory; below 50 requires revision.',
  },
  {
    keywords: ['mid-term', 'midterm', 'report', 'mid term'],
    answer: 'The mid-term placement report is due at the end of Week 12. It must be submitted as a PDF through the AESIS portal and should cover your role, key responsibilities, technical contributions, and a self-assessment against your learning objectives. Your academic supervisor will review and grade it within 5 working days.',
  },
  {
    keywords: ['risk', 'tier', 'high risk', 'low risk', 'medium'],
    answer: 'Risk tiers are advisory signals computed from your logbook behaviour: missed weekly submissions, days without any logbook activity, late day logs, and returned weeks awaiting rework. Low (score < 0.3): on track. Medium (0.3–0.6): your supervisor keeps an eye on things. High (≥ 0.6): your supervisor is notified to check in with you. Tiers never affect your grade — they exist to start a conversation early, and they clear as soon as you catch up.',
  },
  {
    keywords: ['plagiarism', 'similarity', 'flagged', 'flag'],
    answer: 'Plagiarism is detected by comparing your submission against all prior submissions in the cohort index using cosine similarity on TF-IDF vectors. A similarity score above 0.35 triggers a plagiarism flag. Flagged submissions are reviewed by your supervisor and may result in a zero score for that entry. Always write your own original entries.',
  },
  {
    keywords: ['supervisor', 'feedback', 'feedback received'],
    answer: 'Your academic supervisor reviews each submitted logbook entry and provides written feedback within 3 working days. Feedback can result in an Approved or Flagged outcome. Flagged entries must be revised and resubmitted. You will receive a notification in AESIS as soon as feedback is posted.',
  },
  {
    keywords: ['extension', 'extend', 'extra time'],
    answer: 'Extensions for logbook submissions are granted only in documented exceptional circumstances such as medical emergencies or bereavement. Requests must be submitted to your academic supervisor at least 24 hours before the deadline where possible. The supervisor forwards approved extensions to the coordinator for recording in AESIS.',
  },
  {
    keywords: ['placement letter', 'approval', 'approve', 'pending'],
    answer: 'Your placement letter must be uploaded to AESIS for coordinator approval before you begin your internship. The coordinator typically reviews submissions within 3–5 working days. You will receive an email notification once your placement is approved. You cannot submit logbook entries until your placement is marked Active.',
  },
];

function findAnswer(message: string): string {
  const lower = message.toLowerCase();
  for (const entry of KB) {
    if (entry.keywords.some((kw) => lower.includes(kw))) {
      return entry.answer;
    }
  }
  return 'I can help with questions about CS internship regulations, logbook requirements, deadlines, quality scoring, risk tiers, and programme procedures. Could you rephrase your question or ask about one of those topics? For urgent matters not covered here, contact your academic supervisor directly.';
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
 * Reports whether the Groq-backed AI engine is reachable. The chat itself never
 * dies (KB fallback), so `engine:false` means degraded — KB-only answers.
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
  res.json({ engine });
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

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const upstream = await fetch(aiEngineUrl('/ai/chat'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': env.AI_ENGINE_API_KEY },
      body: JSON.stringify({ session_id: userId, student_id: userId, message }),
      signal: AbortSignal.timeout(AI_ENGINE_TIMEOUT_MS),
    });
    if (!upstream.ok || !upstream.body) throw new Error(`AI engine returned ${upstream.status}`);

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
    if (!streamed) sse(res, findAnswer(message));
  } catch (err) {
    logger.warn('Chat: AI engine unavailable, using local fallback', { err: err instanceof Error ? err.message : String(err) });
    sse(res, findAnswer(message));
  }

  res.write('data: [DONE]\n\n');
  res.end();
}
