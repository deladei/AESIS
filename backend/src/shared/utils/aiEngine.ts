import { env } from '../../config/env';

/**
 * Build an AI-engine URL from a path, tolerating how `AI_ENGINE_URL` is set in
 * the environment. The engine mounts every route under `/ai` (e.g.
 * `/ai/enrich/entry`), and our call paths already include that prefix — so if the
 * env value itself ends in `/ai` (a common dashboard slip) the naive
 * `${AI_ENGINE_URL}${path}` doubles it to `/ai/ai/...` and the engine 404s,
 * silently killing all enrichment. Normalising the base (strip a trailing slash
 * and a trailing `/ai`) makes the call correct whether the env is
 * `https://host`, `https://host/`, or `https://host/ai`.
 */
export function buildAiUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, '').replace(/\/ai$/i, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

export function aiEngineUrl(path: string): string {
  return buildAiUrl(env.AI_ENGINE_URL, path);
}

// Render free/starter instances cold-sleep after ~15 min idle; the first call
// after a wake can take 30–60s. A short timeout aborts the wake and the job
// fails/abandons before the engine ever answers. Give cold starts room — the
// worker still retries with backoff, so a genuine outage isn't held hostage.
//
// This one is for the INTERACTIVE paths (chat, writing assist), where a person
// is watching a cursor blink. It stays short deliberately.
export const AI_ENGINE_TIMEOUT_MS = 45_000;

/**
 * Budget for one enrichment pass, which is a different problem to a chat turn.
 *
 * Enrichment runs three model calls concurrently (competency, summary, quality)
 * and then a fourth — the feedback draft — which cannot join them because it is
 * written FROM the other two's output. That is two sequential rounds of Groq
 * latency, roughly 25s + 20s at the per-call timeouts, on top of a possible
 * cold start. At 45s a slow-but-healthy engine reads as a failure and the job
 * burns a retry.
 *
 * Nobody waits on this: it is a background queue with backoff, and the entry is
 * reviewable by a human throughout. Latency here costs nothing but freshness.
 */
export const AI_ENRICHMENT_TIMEOUT_MS = 90_000;
