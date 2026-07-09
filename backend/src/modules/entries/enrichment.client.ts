import { z } from 'zod';
import { env } from '../../config/env';
import { aiEngineUrl, AI_ENGINE_TIMEOUT_MS } from '../../shared/utils/aiEngine';

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
  model: z.string().min(1),
});

export const enrichmentResponseSchema = z.object({
  model_name: z.string().min(1),
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
    signal: AbortSignal.timeout(AI_ENGINE_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`AI engine returned ${res.status}`);
  }

  const json: unknown = await res.json();
  // Throws ZodError on shape mismatch → worker degrades to "no assessment".
  return enrichmentResponseSchema.parse(json);
};
