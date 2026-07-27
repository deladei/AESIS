import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff, Loader2, CheckCircle2, GraduationCap, BookOpen, Briefcase, ChevronDown, Check } from 'lucide-react';
import { useAuth, type SelfRegisterRole } from '@/contexts/AuthContext';
import { REGION_VALUES, REGION_LABELS } from '@/lib/regions';
import { registerSchema } from '@/lib/validation';
import { extractFieldErrors, formLevelMessage } from '@/lib/validation';

const PROGRAMMES_URL = `${import.meta.env.VITE_API_BASE_URL ?? ''}/api/v1/auth/programmes`;

interface Programme { id: string; name: string; code: string; }

interface RoleChoice {
  value: SelfRegisterRole;
  label: string;
  description: string;
  icon: typeof GraduationCap;
}

const ROLE_CHOICES: RoleChoice[] = [
  { value: 'student',             label: 'Student',            description: 'I am completing an internship placement', icon: GraduationCap },
  { value: 'academic_supervisor', label: 'Academic Supervisor', description: 'I supervise students from the university', icon: BookOpen },
  { value: 'company_supervisor',  label: 'Company Supervisor',  description: 'I mentor a student at my company',         icon: Briefcase },
];

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: SelfRegisterRole;
  gender: '' | 'male' | 'female' | 'other';
  indexNumber: string;
  programmeId: string;
  // Academic supervisor identity
  staffId: string;
  title: string;
  // Student placement (created at registration)
  region: string;
  companyName: string;
  companyAddress: string;
  companySupervisorName: string;
  companySupervisorEmail: string;
  startDate: string;
  endDate: string;
}

// The exact body the API receives — built once so the client validates the
// same object it is about to send, rather than a lookalike.
function payloadFor(form: FormState) {
  return {
    firstName: form.firstName,
    lastName:  form.lastName,
    email:     form.email,
    password:  form.password,
    role:      form.role,
    gender:    form.gender as 'male' | 'female' | 'other',
    ...(form.role === 'student'
      ? {
          indexNumber:            form.indexNumber.trim(),
          programmeId:            form.programmeId,
          region:                 form.region,
          companyName:            form.companyName,
          companyAddress:         form.companyAddress,
          companySupervisorName:  form.companySupervisorName,
          companySupervisorEmail: form.companySupervisorEmail,
          startDate:              form.startDate,
          endDate:                form.endDate,
        }
      : {}),
    ...(form.role === 'academic_supervisor'
      ? { staffId: form.staffId.trim(), title: form.title }
      : {}),
  };
}

export default function RegisterPage() {
  const { register } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [requiresVerification, setRequiresVerification] = useState(false);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [programmeOpen, setProgrammeOpen] = useState(false);
  const [programmeLoadError, setProgrammeLoadError] = useState(false);
  const [programmesLoading, setProgrammesLoading] = useState(true);
  const [programmePlacement, setProgrammePlacement] = useState<'below' | 'above'>('below');
  const programmeRef = useRef<HTMLDivElement>(null);
  const programmeButtonRef = useRef<HTMLButtonElement>(null);
  const [form, setForm] = useState<FormState>({
    firstName:              '',
    lastName:               '',
    email:                  '',
    password:               '',
    role:                   'student',
    gender:                 '',
    indexNumber:            '',
    programmeId:            '',
    staffId:                '',
    title:                  '',
    region:                 '',
    companyName:            '',
    companyAddress:         '',
    companySupervisorName:  '',
    companySupervisorEmail: '',
    startDate:              '',
    endDate:                '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  const loadProgrammes = () => {
    setProgrammesLoading(true);
    setProgrammeLoadError(false);
    // Public endpoint — plain fetch, no credentials, no cache. Cache-busting
    // param defeats any stale cached response from before the backend CORP fix.
    fetch(`${PROGRAMMES_URL}?_=${Date.now()}`, {
      credentials: 'omit',
      cache: 'no-store',
      mode: 'cors',
      headers: { Accept: 'application/json' },
    })
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then((body: { data: { programmes: Programme[] } }) => setProgrammes(body.data.programmes))
      .catch(() => setProgrammeLoadError(true))
      .finally(() => setProgrammesLoading(false));
  };

  useEffect(() => { loadProgrammes(); }, []);

  const computeProgrammePlacement = useCallback(() => {
    const btn = programmeButtonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const DROPDOWN_MAX_H = 240; // matches Tailwind max-h-60 (15rem)
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    setProgrammePlacement(spaceBelow < DROPDOWN_MAX_H && spaceAbove > spaceBelow ? 'above' : 'below');
  }, []);

  useEffect(() => {
    if (!programmeOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (programmeRef.current && !programmeRef.current.contains(e.target as Node)) {
        setProgrammeOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setProgrammeOpen(false); };
    const onReposition = () => computeProgrammePlacement();
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onReposition, true);
    window.addEventListener('resize', onReposition);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onReposition, true);
      window.removeEventListener('resize', onReposition);
    };
  }, [programmeOpen, computeProgrammePlacement]);

  // One definition, both sides: this is the same object the API parses the
  // request body with (backend/src/shared/validation/auth.ts). Client-side
  // parsing exists to put the message next to the field — the server re-parses
  // and remains the guarantee.
  const validate = () => {
    const result = registerSchema.safeParse(payloadFor(form));
    if (result.success) {
      setErrors({});
      return true;
    }
    const e: Partial<Record<keyof FormState, string>> = {};
    for (const issue of result.error.issues) {
      const key = issue.path[0] as keyof FormState | undefined;
      if (key && !e[key]) e[key] = issue.message;
    }
    setErrors(e);
    return false;
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const result = await register(payloadFor(form));
      setRequiresVerification(result.requiresVerification);
      setSuccess(true);
    } catch (err: unknown) {
      // A 400 from Zod carries per-field messages: land them next to their own
      // input. Anything else (duplicate email, server fault) is form-level.
      const fieldErrors = extractFieldErrors(err);
      if (Object.keys(fieldErrors).length > 0) {
        setErrors(fieldErrors as Partial<Record<keyof FormState, string>>);
      } else {
        setErrors({ email: formLevelMessage(err, 'Registration failed. Please try again.') });
      }
    } finally {
      setLoading(false);
    }
  };

  const fieldClass = (hasError: boolean) =>
    `w-full px-4 py-2.5 rounded-lg bg-slate-800 border text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-1 transition-colors duration-150 ${
      hasError
        ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
        : 'border-slate-700 focus:border-blue-500 focus:ring-blue-500'
    }`;

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  if (success) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-8 h-8 text-emerald-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">Account created!</h2>
          <p className="text-slate-400 text-sm mb-8">
            {requiresVerification ? (
              <>We sent a verification link to <span className="text-slate-200 font-medium">{form.email}</span>.
              Check your inbox to activate your account before signing in.</>
            ) : (
              <>Your account for <span className="text-slate-200 font-medium">{form.email}</span> is ready.
              You can now sign in.</>
            )}
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
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-lg">
        <div className="flex items-center gap-3 mb-8 sm:mb-10">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
            <span className="text-white font-bold font-mono">A</span>
          </div>
          <p className="text-white font-bold text-lg">AESIS</p>
        </div>

        <h2 className="text-2xl font-bold text-white mb-1">Create account</h2>
        <p className="text-slate-400 text-sm mb-6 sm:mb-8">Create your AESIS account to participate in the internship programme.</p>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Role selector */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">I am a…</label>
            <div className="grid gap-2">
              {ROLE_CHOICES.map(({ value, label, description, icon: Icon }) => {
                const selected = form.role === value;
                return (
                  <label
                    key={value}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors duration-150 ${
                      selected
                        ? 'bg-blue-600/10 border-blue-500'
                        : 'bg-slate-800 border-slate-700 hover:border-slate-600'
                    }`}
                  >
                    <input
                      type="radio"
                      name="role"
                      value={value}
                      checked={selected}
                      onChange={() => setField('role', value)}
                      className="sr-only"
                    />
                    <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${selected ? 'text-blue-400' : 'text-slate-400'}`} />
                    <div className="min-w-0">
                      <p className={`text-sm font-medium ${selected ? 'text-white' : 'text-slate-200'}`}>{label}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{description}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="firstName" className="block text-sm font-medium text-slate-300 mb-1.5">First name</label>
              <input
                id="firstName"
                type="text"
                placeholder="Ada"
                autoComplete="given-name"
                value={form.firstName}
                onChange={(e) => setField('firstName', e.target.value)}
                className={fieldClass(!!errors.firstName)}
              />
              {errors.firstName && <p className="mt-1 text-xs text-red-400">{errors.firstName}</p>}
            </div>
            <div>
              <label htmlFor="lastName" className="block text-sm font-medium text-slate-300 mb-1.5">Last name</label>
              <input
                id="lastName"
                type="text"
                placeholder="Okonkwo"
                autoComplete="family-name"
                value={form.lastName}
                onChange={(e) => setField('lastName', e.target.value)}
                className={fieldClass(!!errors.lastName)}
              />
              {errors.lastName && <p className="mt-1 text-xs text-red-400">{errors.lastName}</p>}
            </div>
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1.5">Email address</label>
            <input
              id="email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              value={form.email}
              onChange={(e) => setField('email', e.target.value)}
              className={fieldClass(!!errors.email)}
            />
            {errors.email && <p className="mt-1 text-xs text-red-400">{errors.email}</p>}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-1.5">Password</label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Min. 8 characters"
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => setField('password', e.target.value)}
                className={`${fieldClass(!!errors.password)} pr-11`}
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

          <div>
            <label htmlFor="gender" className="block text-sm font-medium text-slate-300 mb-1.5">Gender</label>
            <select
              id="gender"
              value={form.gender}
              onChange={(e) => setField('gender', e.target.value as FormState['gender'])}
              className={`${fieldClass(!!errors.gender)} cursor-pointer ${form.gender ? 'text-slate-100' : 'text-slate-500'}`}
            >
              <option value="" disabled>Select gender</option>
              <option value="female" className="text-slate-100">Female</option>
              <option value="male" className="text-slate-100">Male</option>
              <option value="other" className="text-slate-100">Other</option>
            </select>
            {errors.gender && <p className="mt-1 text-xs text-red-400">{errors.gender}</p>}
          </div>

          {form.role === 'academic_supervisor' && (
            <div className="grid grid-cols-1 sm:grid-cols-[8rem_1fr] gap-4">
              <div>
                <label htmlFor="title" className="block text-sm font-medium text-slate-300 mb-1.5">Title</label>
                <select
                  id="title"
                  value={form.title}
                  onChange={(e) => setField('title', e.target.value)}
                  className={`${fieldClass(!!errors.title)} cursor-pointer ${form.title ? 'text-slate-100' : 'text-slate-500'}`}
                >
                  <option value="" disabled>Select</option>
                  {['Prof.', 'Dr.', 'Mr.', 'Mrs.', 'Ms.'].map((t) => (
                    <option key={t} value={t} className="text-slate-100">{t}</option>
                  ))}
                </select>
                {errors.title && <p className="mt-1 text-xs text-red-400">{errors.title}</p>}
              </div>
              <div>
                <label htmlFor="staffId" className="block text-sm font-medium text-slate-300 mb-1.5">Staff ID</label>
                <input
                  id="staffId"
                  type="text"
                  placeholder="e.g. STF-2041"
                  value={form.staffId}
                  onChange={(e) => setField('staffId', e.target.value)}
                  className={fieldClass(!!errors.staffId)}
                />
                {errors.staffId && <p className="mt-1 text-xs text-red-400">{errors.staffId}</p>}
              </div>
            </div>
          )}

          {form.role === 'student' && (
            <div>
              <label htmlFor="indexNumber" className="block text-sm font-medium text-slate-300 mb-1.5">Index number</label>
              <input
                id="indexNumber"
                type="text"
                placeholder="e.g. 10543210"
                value={form.indexNumber}
                onChange={(e) => setField('indexNumber', e.target.value)}
                className={fieldClass(!!errors.indexNumber)}
              />
              {errors.indexNumber && <p className="mt-1 text-xs text-red-400">{errors.indexNumber}</p>}
            </div>
          )}

          {form.role === 'student' && (
            <div ref={programmeRef}>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Programme</label>
              <div className="relative">
                <button
                  ref={programmeButtonRef}
                  type="button"
                  onClick={() => {
                    if (!programmeOpen) computeProgrammePlacement();
                    setProgrammeOpen((o) => !o);
                  }}
                  aria-haspopup="listbox"
                  aria-expanded={programmeOpen}
                  className={`${fieldClass(!!errors.programmeId)} flex items-center justify-between text-left cursor-pointer`}
                >
                  <span className={form.programmeId ? 'text-slate-100' : 'text-slate-500'}>
                    {programmes.find((p) => p.id === form.programmeId)?.name ?? 'Select programme'}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-150 ${programmeOpen ? 'rotate-180' : ''}`} />
                </button>
                {programmeOpen && (
                  <ul
                    role="listbox"
                    className={`absolute z-20 w-full max-h-60 overflow-auto rounded-lg bg-slate-800 border border-slate-700 shadow-xl scrollbar-thin py-1 ${
                      programmePlacement === 'above' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
                    }`}
                  >
                    {programmesLoading ? (
                      <li className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-400">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading programmes…
                      </li>
                    ) : programmeLoadError ? (
                      <li className="px-4 py-2.5 text-sm">
                        <p className="text-red-400 mb-1.5">Couldn't load programmes.</p>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); loadProgrammes(); }}
                          className="text-blue-400 hover:text-blue-300 underline underline-offset-2 cursor-pointer"
                        >
                          Try again
                        </button>
                      </li>
                    ) : programmes.length === 0 ? (
                      <li className="px-4 py-2.5 text-sm text-slate-500">No programmes available</li>
                    ) : (
                      programmes.map((p) => {
                        const selected = p.id === form.programmeId;
                        return (
                          <li key={p.id}>
                            <button
                              type="button"
                              onClick={() => { setField('programmeId', p.id); setProgrammeOpen(false); }}
                              className={`w-full flex items-center justify-between gap-2 text-left px-4 py-2.5 text-sm cursor-pointer transition-colors duration-100 ${
                                selected ? 'bg-blue-600/15 text-blue-300' : 'text-slate-200 hover:bg-slate-700/60'
                              }`}
                            >
                              <span className="truncate">{p.name}</span>
                              {selected && <Check className="w-4 h-4 shrink-0" />}
                            </button>
                          </li>
                        );
                      })
                    )}
                  </ul>
                )}
              </div>
              {errors.programmeId && <p className="mt-1 text-xs text-red-400">{errors.programmeId}</p>}
            </div>
          )}

          {form.role === 'student' && (
            <div className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
              <p className="text-sm font-medium text-slate-200">Your placement</p>

              <div>
                <label htmlFor="region" className="block text-sm font-medium text-slate-300 mb-1.5">Region</label>
                <select
                  id="region"
                  value={form.region}
                  onChange={(e) => setField('region', e.target.value)}
                  className={`${fieldClass(!!errors.region)} cursor-pointer ${form.region ? 'text-slate-100' : 'text-slate-500'}`}
                >
                  <option value="" disabled>Select region</option>
                  {REGION_VALUES.map((r) => (
                    <option key={r} value={r} className="text-slate-100">{REGION_LABELS[r]}</option>
                  ))}
                </select>
                {errors.region && <p className="mt-1 text-xs text-red-400">{errors.region}</p>}
              </div>

              <div>
                <label htmlFor="companyName" className="block text-sm font-medium text-slate-300 mb-1.5">Company name</label>
                <input
                  id="companyName"
                  type="text"
                  placeholder="Kofi Analytics Ltd"
                  value={form.companyName}
                  onChange={(e) => setField('companyName', e.target.value)}
                  className={fieldClass(!!errors.companyName)}
                />
                {errors.companyName && <p className="mt-1 text-xs text-red-400">{errors.companyName}</p>}
              </div>

              <div>
                <label htmlFor="companyAddress" className="block text-sm font-medium text-slate-300 mb-1.5">Company address</label>
                <input
                  id="companyAddress"
                  type="text"
                  placeholder="12 Independence Avenue, Accra"
                  value={form.companyAddress}
                  onChange={(e) => setField('companyAddress', e.target.value)}
                  className={fieldClass(!!errors.companyAddress)}
                />
                {errors.companyAddress && <p className="mt-1 text-xs text-red-400">{errors.companyAddress}</p>}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="companySupervisorName" className="block text-sm font-medium text-slate-300 mb-1.5">Company supervisor</label>
                  <input
                    id="companySupervisorName"
                    type="text"
                    placeholder="Yaw Mensah"
                    value={form.companySupervisorName}
                    onChange={(e) => setField('companySupervisorName', e.target.value)}
                    className={fieldClass(!!errors.companySupervisorName)}
                  />
                  {errors.companySupervisorName && <p className="mt-1 text-xs text-red-400">{errors.companySupervisorName}</p>}
                </div>
                <div>
                  <label htmlFor="companySupervisorEmail" className="block text-sm font-medium text-slate-300 mb-1.5">Supervisor email</label>
                  <input
                    id="companySupervisorEmail"
                    type="email"
                    placeholder="supervisor@company.com"
                    value={form.companySupervisorEmail}
                    onChange={(e) => setField('companySupervisorEmail', e.target.value)}
                    className={fieldClass(!!errors.companySupervisorEmail)}
                  />
                  {errors.companySupervisorEmail && <p className="mt-1 text-xs text-red-400">{errors.companySupervisorEmail}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="startDate" className="block text-sm font-medium text-slate-300 mb-1.5">Start date</label>
                  <input
                    id="startDate"
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setField('startDate', e.target.value)}
                    className={`${fieldClass(!!errors.startDate)} cursor-pointer [color-scheme:dark]`}
                  />
                  {errors.startDate && <p className="mt-1 text-xs text-red-400">{errors.startDate}</p>}
                </div>
                <div>
                  <label htmlFor="endDate" className="block text-sm font-medium text-slate-300 mb-1.5">End date</label>
                  <input
                    id="endDate"
                    type="date"
                    value={form.endDate}
                    onChange={(e) => setField('endDate', e.target.value)}
                    className={`${fieldClass(!!errors.endDate)} cursor-pointer [color-scheme:dark]`}
                  />
                  {errors.endDate && <p className="mt-1 text-xs text-red-400">{errors.endDate}</p>}
                </div>
              </div>
            </div>
          )}

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
