import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff, Loader2, CheckCircle2 } from 'lucide-react';

const PROGRAMMES = [
  'B.Sc. Computer Science',
  'B.Sc. Software Engineering',
  'B.Sc. Information Technology',
  'B.Sc. Cybersecurity',
];

const LEVELS = ['100', '200', '300', '400', '500'];

export default function RegisterPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    programme: '',
    level: '',
  });
  const [errors, setErrors] = useState<Partial<typeof form>>({});

  const validate = () => {
    const e: Partial<typeof form> = {};
    if (!form.firstName.trim()) e.firstName = 'Required';
    if (!form.lastName.trim()) e.lastName = 'Required';
    if (!form.email.includes('@')) e.email = 'Enter a valid institutional email';
    if (form.password.length < 8) e.password = 'Minimum 8 characters';
    if (!form.programme) e.programme = 'Select a programme';
    if (!form.level) e.level = 'Select your level';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      await new Promise((r) => setTimeout(r, 1500));
      setSuccess(true);
    } finally {
      setLoading(false);
    }
  };

  const field = (id: keyof typeof form) => ({
    value: form[id],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm({ ...form, [id]: e.target.value }),
    className: `w-full px-4 py-2.5 rounded-lg bg-slate-800 border text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-1 transition-colors duration-150 ${
      errors[id]
        ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
        : 'border-slate-700 focus:border-blue-500 focus:ring-blue-500'
    }`,
  });

  if (success) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-8 h-8 text-emerald-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">Check your email</h2>
          <p className="text-slate-400 text-sm mb-8">
            A verification link has been sent to <span className="text-slate-200 font-medium">{form.email}</span>.
            Click the link to activate your AESIS account.
          </p>
          <Link
            to="/auth/login"
            className="inline-flex px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition-colors duration-150 cursor-pointer"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-8">
      <div className="w-full max-w-lg">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
            <span className="text-white font-bold font-mono">A</span>
          </div>
          <p className="text-white font-bold text-lg">AESIS</p>
        </div>

        <h2 className="text-2xl font-bold text-white mb-1">Create account</h2>
        <p className="text-slate-400 text-sm mb-8">CS Department students only. Use your institutional email.</p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="firstName" className="block text-sm font-medium text-slate-300 mb-1.5">
                First name
              </label>
              <input id="firstName" type="text" placeholder="Ada" autoComplete="given-name" {...field('firstName')} />
              {errors.firstName && <p className="mt-1 text-xs text-red-400">{errors.firstName}</p>}
            </div>
            <div>
              <label htmlFor="lastName" className="block text-sm font-medium text-slate-300 mb-1.5">
                Last name
              </label>
              <input id="lastName" type="text" placeholder="Okonkwo" autoComplete="family-name" {...field('lastName')} />
              {errors.lastName && <p className="mt-1 text-xs text-red-400">{errors.lastName}</p>}
            </div>
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1.5">
              Institutional email
            </label>
            <input id="email" type="email" placeholder="you@cs.edu.ng" autoComplete="email" {...field('email')} />
            {errors.email && <p className="mt-1 text-xs text-red-400">{errors.email}</p>}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-1.5">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Min. 8 characters"
                autoComplete="new-password"
                {...field('password')}
                className={field('password').className + ' pr-11'}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                aria-label="Toggle password visibility"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.password && <p className="mt-1 text-xs text-red-400">{errors.password}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="programme" className="block text-sm font-medium text-slate-300 mb-1.5">
                Programme
              </label>
              <select id="programme" {...field('programme')} className={field('programme').className}>
                <option value="">Select programme</option>
                {PROGRAMMES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              {errors.programme && <p className="mt-1 text-xs text-red-400">{errors.programme}</p>}
            </div>
            <div>
              <label htmlFor="level" className="block text-sm font-medium text-slate-300 mb-1.5">
                Level
              </label>
              <select id="level" {...field('level')} className={field('level').className}>
                <option value="">Select level</option>
                {LEVELS.map((l) => <option key={l} value={l}>{l} Level</option>)}
              </select>
              {errors.level && <p className="mt-1 text-xs text-red-400">{errors.level}</p>}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition-colors duration-150 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-950"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Creating account…</>
            ) : (
              'Create account'
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{' '}
          <Link to="/auth/login" className="text-blue-400 hover:text-blue-300 font-medium transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
