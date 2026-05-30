import axios, { type AxiosRequestConfig } from 'axios';

// Access token lives in memory only — never localStorage
let _accessToken: string | null = null;

export function setAccessToken(token: string | null) { _accessToken = token; }
export function getAccessToken() { return _accessToken; }

const API_BASE = import.meta.env.VITE_API_BASE_URL
  ? `${import.meta.env.VITE_API_BASE_URL}/api/v1`
  : '/api/v1';

export const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true, // send HttpOnly refresh cookie
  headers: { 'Content-Type': 'application/json' },
  // The backend runs on a free dyno that sleeps after ~15 min idle and takes
  // ~50s to cold-start. Allow the first request to wait that out instead of
  // failing; genuinely-dead requests still abort here rather than hang forever.
  timeout: 65_000,
});

// ── Cold-start ("backend waking") signal ──────────────────────
// Render returns 502/503/504 from its edge while a slept service spins up.
// We retry those (and network errors / timeouts on safe GETs) with backoff,
// and broadcast a "waking" flag so the UI can show a friendly banner.
// NOTE: a *suspended* service returns 404 (`x-render-routing: no-server`) —
// that is NOT retried, so a truly-down backend fails fast.
const COLD_STATUSES = [502, 503, 504];
const COLD_BACKOFFS = [1_000, 2_000, 3_000, 5_000]; // ms; length = max retries

// Ref-count of requests currently mid-cold-retry; waking = count > 0. A counter
// (not a bool) keeps the banner up correctly while several requests retry and
// some succeed before others.
let _wakingCount = 0;
const wakingListeners = new Set<(waking: boolean) => void>();

export function onBackendWaking(cb: (waking: boolean) => void) {
  wakingListeners.add(cb);
  cb(_wakingCount > 0);
  return () => { wakingListeners.delete(cb); };
}
function bumpWaking(delta: number) {
  const was = _wakingCount > 0;
  _wakingCount = Math.max(0, _wakingCount + delta);
  const now = _wakingCount > 0;
  if (was !== now) wakingListeners.forEach((cb) => cb(now));
}

function isColdStart(err: { code?: string; response?: { status: number }; config?: { method?: string } }) {
  // Explicit gateway "still starting" — safe to retry on any method.
  if (err.response && COLD_STATUSES.includes(err.response.status)) return true;
  // Timeout or no response (network) — only retry idempotent GETs to avoid
  // double-submitting POST/PATCH/DELETE the server may have already processed.
  const isGet = (err.config?.method ?? 'get').toLowerCase() === 'get';
  if (!err.response && isGet) return true;
  return false;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Attach access token to every request
api.interceptors.request.use((config) => {
  if (_accessToken) config.headers.Authorization = `Bearer ${_accessToken}`;
  return config;
});

// 401 → refresh → retry once
let refreshing: Promise<string> | null = null;

type RetryConfig = AxiosRequestConfig & { _retry?: boolean; _coldRetries?: number; _wasCold?: boolean };

api.interceptors.response.use(
  (res) => {
    // A request that was retrying finally succeeded → release its waking count.
    if ((res.config as RetryConfig)._wasCold) {
      (res.config as RetryConfig)._wasCold = false;
      bumpWaking(-1);
    }
    return res;
  },
  async (err) => {
    const original = err.config as RetryConfig;

    // ── Cold-start: backend is spinning up → retry with backoff ──
    if (original && isColdStart(err)) {
      const attempt = original._coldRetries ?? 0;
      if (attempt < COLD_BACKOFFS.length) {
        if (!original._wasCold) { original._wasCold = true; bumpWaking(+1); } // count once per request
        original._coldRetries = attempt + 1;
        await sleep(COLD_BACKOFFS[attempt]);
        return api(original); // success path / further retries handle the counter
      }
      // Exhausted — give up and release this request's waking count.
      if (original._wasCold) { original._wasCold = false; bumpWaking(-1); }
      return Promise.reject(err);
    }

    // Was retrying for cold-start but now hit a different (non-cold) error —
    // release the waking count so the banner doesn't get stuck.
    if (original?._wasCold) { original._wasCold = false; bumpWaking(-1); }

    // A 401 from /auth/refresh just means "no valid session" (e.g. fresh visitor on
    // /auth/register, or expired refresh cookie). Don't try to refresh-the-refresh
    // and don't redirect — let the caller handle it.
    if (typeof original.url === 'string' && original.url.includes('/auth/refresh')) {
      return Promise.reject(err);
    }

    if (err.response?.status !== 401 || original._retry) return Promise.reject(err);

    original._retry = true;

    try {
      if (!refreshing) {
        refreshing = axios
          .post<{ data: { accessToken: string } }>(`${API_BASE}/auth/refresh`, {}, { withCredentials: true })
          .then((r) => {
            const token = r.data.data.accessToken;
            setAccessToken(token);
            return token;
          })
          .finally(() => { refreshing = null; });
      }

      const token = await refreshing;
      if (original.headers) original.headers.Authorization = `Bearer ${token}`;
      return api(original);
    } catch {
      setAccessToken(null);
      // Already on a public auth page (login/register/forgot)? Don't yank the user away.
      if (!window.location.pathname.startsWith('/auth/')) {
        window.location.href = '/auth/login';
      }
      return Promise.reject(err);
    }
  },
);
