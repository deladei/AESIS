import axios, { type AxiosRequestConfig } from 'axios';

// Access token lives in memory only — never localStorage
let _accessToken: string | null = null;

export function setAccessToken(token: string | null) { _accessToken = token; }
export function getAccessToken() { return _accessToken; }

export const api = axios.create({
  baseURL: '/api/v1',
  withCredentials: true, // send HttpOnly refresh cookie
  headers: { 'Content-Type': 'application/json' },
});

// Attach access token to every request
api.interceptors.request.use((config) => {
  if (_accessToken) config.headers.Authorization = `Bearer ${_accessToken}`;
  return config;
});

// 401 → refresh → retry once
let refreshing: Promise<string> | null = null;

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config as AxiosRequestConfig & { _retry?: boolean };
    if (err.response?.status !== 401 || original._retry) return Promise.reject(err);

    original._retry = true;

    try {
      if (!refreshing) {
        refreshing = axios
          .post<{ data: { accessToken: string } }>('/api/v1/auth/refresh', {}, { withCredentials: true })
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
      // Refresh failed — force logout
      setAccessToken(null);
      window.location.href = '/auth/login';
      return Promise.reject(err);
    }
  },
);
