import { z } from 'zod';
import { env } from '../../config/env';
import { aiEngineUrl, AI_ENGINE_TIMEOUT_MS } from '../../shared/utils/aiEngine';

/**
 * Cross-week (placement) AI summary client. Runs ONCE at finalization over the
 * acknowledged corpus. Advisory only — the finalization service calls this
 * fail-open: any error here means the placement finalizes with no summary.
 */
export const placementSummarySchema = z.object({
  model_name: z.string().min(1),
  summary: z.object({
    headline: z.string(),
    themes: z.array(z.string()).default([]),
    week_count: z.number().int().nonnegative(),
    recommendations: z.array(z.string()).default([]),
  }),
});

export type PlacementSummaryResult = z.infer<typeof placementSummarySchema>;

export interface PlacementSummaryPayload {
  placement_id: string;
  entries: { week_number: number; activities: { description: string; competency_tags: string[] }[] }[];
}

export type SummarizeFn = (payload: PlacementSummaryPayload) => Promise<PlacementSummaryResult>;

export const summarizePlacementViaFastApi: SummarizeFn = async (payload) => {
  const res = await fetch(aiEngineUrl('/ai/enrich/placement'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': env.AI_ENGINE_API_KEY },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(AI_ENGINE_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`AI engine returned ${res.status}`);
  return placementSummarySchema.parse(await res.json());
};
