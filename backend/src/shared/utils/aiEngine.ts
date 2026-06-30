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
export const AI_ENGINE_TIMEOUT_MS = 45_000;
