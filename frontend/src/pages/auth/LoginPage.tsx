import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff, Loader2, Shield } from 'lucide-react';

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    // POST /api/v1/auth/login
    try {
      await new Promise((r) => setTimeout(r, 1200));
      // navigate by role after login
    } catch {
      setError('Invalid email or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex">
      {/* Left panel — branding */}
      <div className="hidden lg:flex flex-col w-[480px] bg-slate-900 border-r border-slate-800 p-12 relative overflow-hidden">
        {/* Background grid */}
        <div className="absolute inset-0 opacity-5" style={{
          backgroundImage: 'linear-gradient(#3b82f6 1px, transparent 1px), linear-gradient(90deg, #3b82f6 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }} />

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-16">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
              <span className="text-white font-bold text-lg font-mono">A</span>
            </div>
            <div>
              <p className="text-white font-bold text-xl tracking-wide">AESIS</p>
              <p className="text-slate-500 text-xs">CS Department — AY 2024/2025</p>
            </div>
          </div>

          <h1 className="text-3xl font-bold text-white mb-4 leading-tight">
            AI-Enhanced Internship<br />Supervision System
          </h1>
          <p className="text-slate-400 text-base leading-relaxed mb-12">
            Intelligent placement monitoring for the Department of Computer Science.
            Real-time risk detection, automated logbook analysis, and actionable insights.
          </p>

          <div className="space-y-4">
            {[
              { label: 'NLP Logbook Analysis', desc: 'Quality scoring with SHAP explanations' },
              { label: 'Risk Prediction Engine', desc: 'XGBoost weekly risk tier computation' },
              { label: 'Real-Time Alerts', desc: 'Instant push when students need intervention' },
            ].map((f) => (
              <div key={f.label} className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 shrink-0" />
                <div>
                  <p className="text-slate-200 text-sm font-medium">{f.label}</p>
                  <p className="text-slate-500 text-xs">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 mt-auto flex items-center gap-2 text-slate-600 text-xs">
          <Shield className="w-3.5 h-3.5" />
          <span>TLS 1.3 · AES-256-GCM · RBAC enforced</span>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-10 lg:hidden">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
              <span className="text-white font-bold font-mono">A</span>
            </div>
            <p className="text-white font-bold text-lg">AESIS</p>
          </div>

          <h2 className="text-2xl font-bold text-white mb-1">Sign in</h2>
          <p className="text-slate-400 text-sm mb-8">Use your institutional email address</p>

          {error && (
            <div className="mb-6 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1.5">
                Institutional Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="you@cs.edu.ng"
                className="w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors duration-150"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="••••••••"
                  className="w-full px-4 py-2.5 pr-11 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors duration-150"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors duration-150 cursor-pointer"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <div className="flex justify-end mt-1.5">
                <Link to="/auth/reset-password" className="text-xs text-blue-400 hover:text-blue-300 transition-colors duration-150">
                  Forgot password?
                </Link>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition-colors duration-150 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-950"
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

          <p className="mt-8 text-center text-sm text-slate-500">
            Don't have an account?{' '}
            <Link to="/auth/register" className="text-blue-400 hover:text-blue-300 font-medium transition-colors duration-150">
              Register
            </Link>
          </p>

          <div className="mt-8 pt-6 border-t border-slate-800">
            <p className="text-xs text-slate-600 text-center">
              AESIS is restricted to authorised CS Department personnel and students only.
              Unauthorised access is prohibited.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
