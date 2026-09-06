import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { api } from '@/lib/api';

type Status = 'verifying' | 'success' | 'error';

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [status, setStatus] = useState<Status>(token ? 'verifying' : 'error');
  const [message, setMessage] = useState(
    token ? '' : 'This link is missing its verification code. Use the link from your email.',
  );
  // Verification consumes the token server-side, so the request must fire exactly
  // once — StrictMode double-mounts effects in dev and a second call would 400.
  const fired = useRef(false);

  useEffect(() => {
    if (!token || fired.current) return;
    fired.current = true;
    api
      .get('/auth/verify-email', { params: { token } })
      .then(() => setStatus('success'))
      .catch((err) => {
        setStatus('error');
        setMessage(
          err?.response?.data?.message ??
            (err?.response
              ? 'Something went wrong. Please try again.'
              : 'Server is starting up — please refresh in 30 seconds.'),
        );
      });
  }, [token]);

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        <div className="flex items-center justify-center gap-3 mb-10">
          <div className="w-9 h-9 rounded-xl bg-brand flex items-center justify-center">
            <span className="text-white font-bold font-mono">A</span>
          </div>
          <p className="text-ink font-bold text-lg">AESIS</p>
        </div>

        {status === 'verifying' && (
          <>
            <Loader2 className="w-8 h-8 text-brand-ink animate-spin mx-auto mb-6" />
            <h2 className="text-2xl font-bold text-ink mb-3">Verifying your email…</h2>
            <p className="text-ink-muted text-sm">This only takes a moment.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold text-ink mb-3">Email verified</h2>
            <p className="text-ink-muted text-sm mb-8">
              Your account is active. You can now sign in.
            </p>
            <Link
              to="/auth/login"
              className="inline-flex px-6 py-2.5 rounded-lg bg-brand hover:opacity-90 text-white font-semibold text-sm transition-opacity duration-150"
            >
              Go to sign in
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-16 h-16 rounded-full bg-red-50 border border-red-200 flex items-center justify-center mx-auto mb-6">
              <XCircle className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-2xl font-bold text-ink mb-3">Verification failed</h2>
            <p className="text-ink-muted text-sm mb-8">{message}</p>
            <Link
              to="/auth/login"
              className="inline-flex px-6 py-2.5 rounded-lg bg-brand hover:opacity-90 text-white font-semibold text-sm transition-opacity duration-150"
            >
              Back to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
