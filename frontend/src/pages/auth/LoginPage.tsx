import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, ShieldCheck, NotebookPen, MessageSquareText, LineChart } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { FieldError } from '@/components/shared/FieldError';
import { useFieldErrors, loginSchema } from '@/lib/validation';

const ROLE_POINTS = [
  { icon: NotebookPen,       label: 'Students log their week', desc: 'A simple weekly logbook that takes minutes to fill in.' },
  { icon: MessageSquareText,  label: 'Supervisors give feedback', desc: 'Read submissions and respond without chasing email threads.' },
  { icon: LineChart,          label: 'Coordinators stay ahead', desc: 'See every placement at a glance and step in early when needed.' },
];

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  // Same object the API parses this body with, so a malformed address reads
  // identically here and there.
  const { errors, check, validate, clear } = useFieldErrors(loginSchema);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!validate(form)) return;
    setLoading(true);
    try {
      const loggedInUser = await login(form.email, form.password);
      const redirects: Record<string, string> = {
        student:             '/student/dashboard',
        academic_supervisor: '/supervisor/dashboard',
        coordinator:         '/coordinator/dashboard',
        admin:               '/admin/dashboard',
      };
      navigate(redirects[loggedInUser.role] ?? '/student/dashboard', { replace: true });
    } catch (err: any) {
      const status     = err?.response?.status;
      const apiMessage = err?.response?.data?.message;
      if (status === 429) {
        setError('Too many login attempts. Please wait 15 minutes and try again.');
      } else if (status === 401) {
        setError('Invalid email or password.');
      } else if (status === 403) {
        setError(apiMessage ?? 'Your account is not allowed to sign in.');
      } else if (!err?.response) {
        setError('Server is starting up — please wait 30 seconds and try again.');
      } else {
        setError(apiMessage ?? 'Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex">
      {/* Left panel — brand */}
      <div className="hidden lg:flex flex-col w-[480px] bg-brand p-12 relative overflow-hidden">
        {/* Faint grid texture */}
        <div
          className="absolute inset-0 opacity-[0.06] pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(#ffffff 1px, transparent 1px), linear-gradient(90deg, #ffffff 1px, transparent 1px)',
            backgroundSize: '44px 44px',
          }}
        />

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-20">
            <div className="w-10 h-10 rounded-xl bg-surface flex items-center justify-center">
              <span className="text-brand-ink font-bold text-lg font-mono">A</span>
            </div>
            <div>
              <p className="text-white font-bold text-xl tracking-wide">AESIS</p>
              <p className="text-white/70 text-xs">Department of Computer Science</p>
            </div>
          </div>

          <h1 className="text-3xl font-bold text-white mb-4 leading-tight">
            Internship supervision,<br />kept on track.
          </h1>
          <p className="text-white/85 text-base leading-relaxed mb-12 max-w-sm">
            One place to follow every student through their placement — from the first
            logbook entry to the final sign-off.
          </p>

          <div className="space-y-5">
            {ROLE_POINTS.map(({ icon: Icon, label, desc }) => (
              <div key={label} className="flex items-start gap-3.5">
                <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                  <Icon className="w-[18px] h-[18px] text-white" strokeWidth={2} />
                </div>
                <div>
                  <p className="text-white text-sm font-medium">{label}</p>
                  <p className="text-white/70 text-xs leading-relaxed mt-0.5 max-w-[18rem]">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 mt-auto flex items-center gap-2 text-white/70 text-xs">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Encrypted in transit and at rest · role-based access</span>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-10 lg:hidden">
            <div className="w-9 h-9 rounded-xl bg-brand flex items-center justify-center">
              <span className="text-white font-bold font-mono">A</span>
            </div>
            <p className="text-ink font-bold text-lg">AESIS</p>
          </div>

          <h2 className="text-2xl font-bold text-ink mb-1">Sign in</h2>
          <p className="text-ink-muted text-sm mb-8">Use your institutional email address</p>

          {error && (
            <div className="mb-6 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-ink mb-1.5">
                Institutional email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                aria-invalid={!!errors.email}
                value={form.email}
                onChange={(e) => { setForm({ ...form, email: e.target.value }); clear('email'); }}
                onBlur={() => check('email', form.email)}
                placeholder="you@cs.edu.gh"
                className="w-full px-4 py-2.5 rounded-lg bg-surface border border-line text-ink placeholder:text-ink-muted text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors duration-150"
              />
              <FieldError message={errors.email} />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-ink mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  aria-invalid={!!errors.password}
                  value={form.password}
                  onChange={(e) => { setForm({ ...form, password: e.target.value }); clear('password'); }}
                  placeholder="••••••••"
                  className="w-full px-4 py-2.5 pr-11 rounded-lg bg-surface border border-line text-ink placeholder:text-ink-muted text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors duration-150"
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
              <FieldError message={errors.password} />
              <div className="flex justify-end mt-1.5">
                <Link to="/auth/reset-password" className="text-xs text-brand-ink hover:opacity-80 transition-opacity duration-150">
                  Forgot password?
                </Link>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-brand hover:opacity-90 text-white font-semibold text-sm transition-opacity duration-150 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-ink-muted">
            Don't have an account?{' '}
            <Link to="/auth/register" className="text-brand-ink hover:opacity-80 font-medium transition-opacity duration-150">
              Register
            </Link>
          </p>

          <div className="mt-8 pt-6 border-t border-line">
            <p className="text-xs text-ink-muted text-center leading-relaxed">
              Access is limited to authorised Computer Science Department staff and students.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
