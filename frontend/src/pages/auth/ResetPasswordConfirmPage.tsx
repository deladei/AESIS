import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Loader2, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import { newPassword } from '@/lib/validation';

const inputClass = (hasError: boolean) =>
  `w-full px-4 py-2.5 pr-11 rounded-lg bg-surface border text-ink placeholder:text-ink-muted text-sm focus:outline-none focus:ring-1 transition-colors duration-150 ${
    hasError
      ? 'border-danger focus:border-danger focus:ring-danger'
      : 'border-line focus:border-brand focus:ring-brand'
  }`;

export default function ResetPasswordConfirmPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]     = useState(false);
  const [done, setDone]           = useState(false);
  const [error, setError]         = useState('');
  const [fieldError, setFieldError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldError('');
    setError('');
    // The shared rule, not a hand-copied "length < 8" — the message under the
    // field is then the one the API would have returned for the same value.
    const parsed = newPassword('New password').safeParse(password);
    if (!parsed.success) { setFieldError(parsed.error.issues[0]?.message ?? 'Invalid password'); return; }
    if (password !== confirm) { setFieldError('Passwords do not match'); return; }
    setLoading(true);
    try {
      await api.patch('/auth/reset-password/confirm', { token, password });
      setDone(true);
    } catch (err: any) {
      if (!err?.response) {
        setError('Server is starting up — please wait 30 seconds and try again.');
      } else {
        // 400 = invalid or expired token — the message from the API says which.
        setError(err?.response?.data?.message ?? 'Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // No token in the URL — this page only makes sense from the email link.
  if (!token) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <h2 className="text-2xl font-bold text-ink mb-3">Invalid reset link</h2>
          <p className="text-ink-muted text-sm mb-8">
            This link is missing its reset code. Request a new one and use the link from the email.
          </p>
          <Link
            to="/auth/reset-password"
            className="inline-flex px-6 py-2.5 rounded-lg bg-brand hover:opacity-90 text-white font-semibold text-sm transition-opacity duration-150"
          >
            Request a new link
          </Link>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-ok-soft border border-ok flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-8 h-8 text-ok" />
          </div>
          <h2 className="text-2xl font-bold text-ink mb-3">Password updated</h2>
          <p className="text-ink-muted text-sm mb-8">
            Your password has been reset and all other sessions were signed out.
            Sign in with your new password.
          </p>
          <button
            onClick={() => navigate('/auth/login')}
            className="inline-flex px-6 py-2.5 rounded-lg bg-brand hover:opacity-90 text-white font-semibold text-sm transition-opacity duration-150 cursor-pointer"
          >
            Go to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-8">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-9 h-9 rounded-xl bg-brand flex items-center justify-center">
            <span className="text-white font-bold font-mono">A</span>
          </div>
          <p className="text-ink font-bold text-lg">AESIS</p>
        </div>

        <h2 className="text-2xl font-bold text-ink mb-1">Set a new password</h2>
        <p className="text-ink-muted text-sm mb-8">Minimum 8 characters.</p>

        {error && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-danger-soft border border-danger text-danger text-sm">
            {error}{' '}
            <Link to="/auth/reset-password" className="font-medium underline underline-offset-2">
              Request a new link
            </Link>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-ink mb-1.5">
              New password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={inputClass(!!fieldError)}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-brand-ink transition-colors duration-150 cursor-pointer"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="confirm" className="block text-sm font-medium text-ink mb-1.5">
              Confirm new password
            </label>
            <input
              id="confirm"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
              className={inputClass(!!fieldError)}
            />
            {fieldError && <p className="mt-1 text-xs text-danger">{fieldError}</p>}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-brand hover:opacity-90 text-white font-semibold text-sm transition-opacity duration-150 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Updating password…</>
            ) : (
              'Reset password'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
