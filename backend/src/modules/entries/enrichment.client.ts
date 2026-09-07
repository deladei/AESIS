import { z } from 'zod';
import { env } from '../../config/env';
import { aiEngineUrl, AI_ENRICHMENT_TIMEOUT_MS } from '../../shared/utils/aiEngine';

/**
 * FastAPI client for Path 2 (AI enrichment). Deliberately thin and defensive:
 * the worker calls this; this calls the AI engine over HTTP and validates the
 * response against a strict schema. ANY failure — network, timeout, non-2xx, or
 * a response that doesn't match the schema — throws, and the worker treats a
 * throw as "no assessment this attempt". Human review never depends on it.
 */

// The validated contract. An LLM/heuristic that returns garbage must NOT be
// able to write a malformed ai_assessment row, so we parse before persisting.
const activityRelevanceSchema = z.object({
  description: z.string(),
  relevance: z.number().min(0).max(1),
  on_topic: z.boolean(),
  themes: z.array(z.string()).default([]),
  // Why the model judged it that way, in one clause. Empty when the keyword
  // fallback ran — it has no reasoning to offer, and says nothing rather than
  // inventing a justification. Optional so a v1 engine still parses.
  reason: z.string().default(''),
});

// 6-dimension rubric — every score hard-bounded to [0, 100] so an out-of-range
// AI value can never be persisted (hard rule).
const qualityBreakdownSchema = z.object({
  overall: z.number().min(0).max(100),
  task_depth: z.number().min(0).max(100),
  tech_vocab: z.number().min(0).max(100),
  reflection: z.number().min(0).max(100),
  temporal_consistency: z.number().min(0).max(100),
  relevance: z.number().min(0).max(100),
  flags: z.array(z.string()).default([]),
  feedback: z.string().default(''),
  // One clause per dimension saying what in the entry drove the score, so a
  // supervisor can disagree with a number instead of only being handed it.
  // Empty on the rubric floor, which has no evidence beyond word counts.
  evidence: z.record(z.string()).default({}),
});

const plagiarismMatchSchema = z.object({
  entry_id: z.string().min(1),
  similarity: z.number().min(0).max(1),
  tfidf_similarity: z.number().min(0).max(1),
  semantic_similarity: z.number().min(0).max(1).nullable().default(null),
  same_student: z.boolean(),
});

const plagiarismReportSchema = z.object({
  checked: z.boolean(),
  corpus_size: z.number().int().min(0),
  max_similarity: z.number().min(0).max(1),
  flagged: z.boolean(),
  matches: z.array(plagiarismMatchSchema).default([]),
});

// Draft for the SUPERVISOR to edit (human-in-loop) — null when Groq is
// unconfigured/down. Never sent to a student as-is.
const feedbackDraftSchema = z.object({
  text: z.string().min(1),
  // Further drafts to choose between. Optional so a v1 engine, which returns
  // only `text`, still parses.
  alternatives: z.array(z.string().min(1)).max(20).default([]),
  model: z.string().min(1),
});

export const enrichmentResponseSchema = z.object({
  model_name: z.string().min(1),
  /**
   * Which classifier produced the activity relevance: `model` when Groq
   * answered, `keywords` when it fell back to the word list.
   *
   * Persisted so a supervisor is never shown a degraded signal as if it were
   * the model's judgement, and so "how often is the engine actually up?" is
   * answerable from the data rather than from logs.
   */
  classifier: z.enum(['model', 'keywords']).default('keywords'),
  /**
   * Which path wrote `summary.headline`: `model` when the week was narrated,
   * `template` when it fell back to the count-based sentence ("5 activities
   * logged; 4 clearly CS-relevant").
   *
   * Defaulted rather than required so an older AI-engine deploy still parses.
   */
  summarizer: z.enum(['model', 'template']).default('template'),
  /**
   * Which path produced the quality breakdown: `model` when the entry was read
   * and assessed, `rubric` when it fell back to the length-and-keyword
   * heuristic that scores padding above precision.
   */
  scorer: z.enum(['model', 'rubric']).default('rubric'),
  relevance: z.number().min(0).max(1),
  summary: z.object({
    headline: z.string(),
    themes: z.array(z.string()).default([]),
    activity_relevance: z.array(activityRelevanceSchema).default([]),
    concerns: z.array(z.string()).default([]),
  }),
  // Optional so an older AI-engine deploy (v1 response) still parses — those
  // assessments simply carry no report fields.
  quality: qualityBreakdownSchema.optional(),
  plagiarism: plagiarismReportSchema.optional(),
  feedback_draft: feedbackDraftSchema.nullable().optional(),
});

export type EnrichmentResult = z.infer<typeof enrichmentResponseSchema>;

export interface EnrichmentPayload {
  entry_id: string;
  week_number: number;
  activities: { description: string; competency_tags: string[]; activity_date: string }[];
  reflection: { learning: string; challenges: string } | null;
  // Plagiarism corpus: other submitted/acknowledged entries' text, rebuilt from
  // Postgres per check (the AI engine keeps no index). Empty ⇒ stage reports
  // unchecked. Text composition must mirror the AI side's _entry_text().
  corpus: { entry_id: string; text: string; same_student: boolean }[];
}

/** How the worker calls the model. Injectable so tests need no live FastAPI. */
export type EnrichFn = (payload: EnrichmentPayload) => Promise<EnrichmentResult>;

export const enrichEntryViaFastApi: EnrichFn = async (payload) => {
  const res = await fetch(aiEngineUrl('/ai/enrich/entry'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.AI_ENGINE_API_KEY,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(AI_ENRICHMENT_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`AI engine returned ${res.status}`);
  }

  const json: unknown = await res.json();
  // Throws ZodError on shape mismatch → worker degrades to "no assessment".
  return enrichmentResponseSchema.parse(json);
};
