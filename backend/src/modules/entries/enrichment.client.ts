import { z } from 'zod';
import { env } from '../../config/env';

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

export const enrichmentResponseSchema = z.object({
  model_name: z.string().min(1),
  relevance: z.number().min(0).max(1),
  summary: z.object({
    headline: z.string(),
    themes: z.array(z.string()).default([]),
    activity_relevance: z.array(activityRelevanceSchema).default([]),
    concerns: z.array(z.string()).default([]),
  }),
});

export type EnrichmentResult = z.infer<typeof enrichmentResponseSchema>;

export interface EnrichmentPayload {
  entry_id: string;
  week_number: number;
  activities: { description: string; competency_tags: string[]; activity_date: string }[];
  reflection: { learning: string; challenges: string } | null;
}

/** How the worker calls the model. Injectable so tests need no live FastAPI. */
export type EnrichFn = (payload: EnrichmentPayload) => Promise<EnrichmentResult>;

const REQUEST_TIMEOUT_MS = 8_000;

export const enrichEntryViaFastApi: EnrichFn = async (payload) => {
  const res = await fetch(`${env.AI_ENGINE_URL}/ai/enrich/entry`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.AI_ENGINE_API_KEY,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`AI engine returned ${res.status}`);
  }

  const json: unknown = await res.json();
  // Throws ZodError on shape mismatch → worker degrades to "no assessment".
  return enrichmentResponseSchema.parse(json);
};
