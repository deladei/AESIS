import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, MailCheck, ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { FieldError } from '@/components/shared/FieldError';
import { useFieldErrors, resetPasswordInitSchema } from '@/lib/validation';

const inputClass =
  'w-full px-4 py-2.5 rounded-lg bg-surface border border-line text-ink placeholder:text-ink-muted text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors duration-150';

export default function ResetPasswordPage() {
  const [email, setEmail]     = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent]       = useState(false);
  const [error, setError]     = useState('');
  const { errors, check, validate, clear } = useFieldErrors(resetPasswordInitSchema);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!validate({ email })) return;
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { email });
      setSent(true);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 429) {
        setError('Too many requests. Please wait a few minutes and try again.');
      } else if (!err?.response) {
        setError('Server is starting up — please wait 30 seconds and try again.');
      } else {
        setError(err?.response?.data?.message ?? 'Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-8">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-9 h-9 rounded-xl bg-brand flex items-center justify-center">
            <span className="text-white font-bold font-mono">A</span>
          </div>
          <p className="text-ink font-bold text-lg">AESIS</p>
        </div>

        {sent ? (
          <div>
            <div className="w-14 h-14 rounded-full bg-ok-soft border border-ok flex items-center justify-center mb-6">
              <MailCheck className="w-7 h-7 text-ok" />
            </div>
            <h2 className="text-2xl font-bold text-ink mb-2">Check your inbox</h2>
            <p className="text-ink-muted text-sm leading-relaxed mb-8">
              If <span className="text-ink font-medium">{email}</span> is registered,
              we've sent it a password-reset link. The link expires in 1 hour.
            </p>
            <Link
              to="/auth/login"
              className="inline-flex items-center gap-2 text-sm text-brand-ink hover:opacity-80 font-medium transition-opacity duration-150"
            >
              <ArrowLeft className="w-4 h-4" /> Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <h2 className="text-2xl font-bold text-ink mb-1">Reset your password</h2>
            <p className="text-ink-muted text-sm mb-8">
              Enter your account email and we'll send you a link to set a new password.
            </p>

            {error && (
              <div className="mb-6 px-4 py-3 rounded-lg bg-danger-soft border border-danger text-danger text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-ink mb-1.5">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  aria-invalid={!!errors.email}
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); clear('email'); }}
                  onBlur={() => check('email', email)}
                  placeholder="you@cs.edu.gh"
                  className={inputClass}
                />
                <FieldError message={errors.email} />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-brand hover:opacity-90 text-white font-semibold text-sm transition-opacity duration-150 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Sending link…</>
                ) : (
                  'Send reset link'
                )}
              </button>
            </form>

            <p className="mt-8 text-center text-sm text-ink-muted">
              Remembered it?{' '}
              <Link to="/auth/login" className="text-brand-ink hover:opacity-80 font-medium transition-opacity duration-150">
                Sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
