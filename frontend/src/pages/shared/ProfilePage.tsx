import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Loader2, BadgeCheck, ShieldAlert, Mail, Phone, Hash, MapPin, Building2,
  CalendarDays, GraduationCap, UserRound, Pencil, X, Camera, Trash2,
  Users, ClipboardCheck, ShieldCheck, Activity, BookOpen, Eye, Lock,
} from 'lucide-react';
import { useProfile, useUpdateProfile, useUploadAvatar, useRemoveAvatar, type Profile, type UpdateProfileInput } from '@/hooks/useProfile';
import { useAuth } from '@/contexts/AuthContext';
import { useCoordinatorActivity } from '@/hooks/useDashboard';
import { usePlacementStats, useCompaniesOverview } from '@/hooks/usePlacements';
import { regionLabel } from '@/lib/regions';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { ProgressBar } from '@/components/ui/Bits';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/Feedback';
import { FieldError } from '@/components/shared/FieldError';
import { useFieldErrors, updateProfileSchema, extractFieldErrors } from '@/lib/validation';

const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const AVATAR_MIME = ['image/png', 'image/jpeg', 'image/webp'];

// Round avatar that doubles as the upload control: click to pick a new image,
// remove to clear it. Syncs the new URL into the auth context so the sidebar
// avatar updates without a reload.
function AvatarUploader({ profile, initials }: { profile: Profile; initials: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const { updateUser } = useAuth();
  const upload = useUploadAvatar();
  const remove = useRemoveAvatar();
  const [error, setError] = useState<string | null>(null);

  const busy = upload.isPending || remove.isPending;

  function pick() {
    setError(null);
    fileRef.current?.click();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    if (!AVATAR_MIME.includes(file.type)) { setError('Use a PNG, JPG, or WebP image.'); return; }
    if (file.size > AVATAR_MAX_BYTES)     { setError('Image must be under 5 MB.'); return; }
    try {
      const avatarUrl = await upload.mutateAsync(file);
      updateUser({ avatarUrl });
    } catch {
      setError('Upload failed. Please try again.');
    }
  }

  async function onRemove() {
    setError(null);
    try {
      await remove.mutateAsync();
      updateUser({ avatarUrl: null });
    } catch {
      setError('Could not remove the picture. Please try again.');
    }
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={pick}
        disabled={busy}
        className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-full disabled:opacity-60"
        aria-label="Change profile picture"
      >
        {profile.avatarUrl ? (
          <img src={profile.avatarUrl} alt={`${profile.firstName} ${profile.lastName}`} className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-soft text-xl font-bold text-brand-ink">
            {initials}
          </span>
        )}
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
          {busy ? <Loader2 className="h-5 w-5 animate-spin text-white" /> : <Camera className="h-5 w-5 text-white" />}
        </span>
        {/* Always-visible badge so it's obvious the avatar is clickable to add/change a picture */}
        <span className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-surface bg-brand text-ink-inverse shadow-card">
          <Camera className="h-3 w-3" />
        </span>
      </button>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onFile} />
      {profile.avatarUrl && !busy && (
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-muted hover:text-danger"
        >
          <Trash2 className="h-3 w-3" /> Remove
        </button>
      )}
      {error && <p className="max-w-[8rem] text-center text-[11px] text-danger">{error}</p>}
    </div>
  );
}

const ROLE_LABELS: Record<Profile['role'], string> = {
  student:             'Student',
  academic_supervisor: 'Academic Supervisor',
  coordinator:         'Coordinator',
  admin:               'Administrator',
};

const GENDER_LABELS: Record<NonNullable<Profile['gender']>, string> = {
  male:   'Male',
  female: 'Female',
  other:  'Other',
};

const PLACEMENT_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  pending:   { label: 'Pending approval', tone: 'warn' },
  active:    { label: 'Active',           tone: 'ok' },
  completed: { label: 'Completed',        tone: 'done' },
  withdrawn: { label: 'Withdrawn',        tone: 'neutral' },
  failed:    { label: 'Failed',           tone: 'danger' },
};

function fmtDate(d: string | null): string {
  if (!d) return '—';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function Field({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  const empty = value == null || (typeof value === 'string' && !value.trim());
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand-ink">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-ink-muted">{label}</p>
        <div className="truncate text-sm font-medium text-ink">{empty ? '—' : value}</div>
      </div>
    </div>
  );
}

function EditProfileForm({ profile, onDone }: { profile: Profile; onDone: () => void }) {
  const isStudent = profile.role === 'student';
  const update = useUpdateProfile();
  // Same schema the API parses this PATCH with.
  const { errors, check, validate, clear, setServerErrors } = useFieldErrors(updateProfileSchema);
  const [firstName, setFirstName]   = useState(profile.firstName);
  const [lastName, setLastName]     = useState(profile.lastName);
  const [gender, setGender]         = useState<Profile['gender']>(profile.gender);
  const [phone, setPhone]           = useState(profile.phone ?? '');
  const [indexNumber, setIndexNumber] = useState(profile.indexNumber ?? '');

  const inputCls = 'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none';
  const labelCls = 'mb-1 block text-xs font-medium text-ink-muted';

  // Send only changed fields. Empty phone is meaningful (clears it), so always
  // send it when it differs; index number is student-only.
  function buildPatch(): UpdateProfileInput {
    const patch: UpdateProfileInput = {};
    if (firstName.trim() !== profile.firstName) patch.firstName = firstName.trim();
    if (lastName.trim()  !== profile.lastName)  patch.lastName  = lastName.trim();
    if (gender && gender !== profile.gender)     patch.gender    = gender;
    if (phone !== (profile.phone ?? ''))         patch.phone     = phone.trim();
    if (isStudent && indexNumber.trim() !== (profile.indexNumber ?? '')) {
      patch.indexNumber = indexNumber.trim();
    }
    return patch;
  }

  async function handleSave() {
    const patch = buildPatch();
    if (Object.keys(patch).length === 0) { onDone(); return; }
    if (!validate(patch)) return;
    try {
      await update.mutateAsync(patch);
      onDone();
    } catch (err) {
      // Field-level messages land under their own input; anything else falls
      // through to the form-level notice below.
      setServerErrors(extractFieldErrors(err));
    }
  }

  const errMsg = update.isError
    ? ((update.error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
        ?? 'Could not save changes. Please try again.')
    : null;

  return (
    <Card>
      <CardHeader
        title="Edit profile"
        control={
          <button onClick={onDone} className="text-ink-muted hover:text-ink" aria-label="Cancel">
            <X className="h-4 w-4" />
          </button>
        }
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor="pf-first">First name</label>
          <input id="pf-first" className={inputCls} value={firstName} onChange={(e) => { setFirstName(e.target.value); clear('firstName'); }} onBlur={() => check('firstName', firstName.trim() || undefined)} aria-invalid={!!errors.firstName} />
          <FieldError message={errors.firstName} />
        </div>
        <div>
          <label className={labelCls} htmlFor="pf-last">Last name</label>
          <input id="pf-last" className={inputCls} value={lastName} onChange={(e) => { setLastName(e.target.value); clear('lastName'); }} onBlur={() => check('lastName', lastName.trim() || undefined)} aria-invalid={!!errors.lastName} />
          <FieldError message={errors.lastName} />
        </div>
        <div>
          <label className={labelCls} htmlFor="pf-gender">Gender</label>
          <select id="pf-gender" className={inputCls} value={gender ?? ''} onChange={(e) => setGender((e.target.value || null) as Profile['gender'])}>
            <option value="">—</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="pf-phone">Phone</label>
          <input id="pf-phone" className={inputCls} value={phone} onChange={(e) => { setPhone(e.target.value); clear('phone'); }} onBlur={() => check('phone', phone.trim())} aria-invalid={!!errors.phone} placeholder="0XXXXXXXXX or +233XXXXXXXXX" />
          <FieldError message={errors.phone} />
        </div>
        {isStudent && (
          <div>
            <label className={labelCls} htmlFor="pf-index">Index number</label>
            <input id="pf-index" className={inputCls} value={indexNumber} onChange={(e) => { setIndexNumber(e.target.value); clear('indexNumber'); }} onBlur={() => check('indexNumber', indexNumber.trim() || undefined)} aria-invalid={!!errors.indexNumber} />
            <FieldError message={errors.indexNumber} />
          </div>
        )}
      </div>

      {errMsg && <p className="mt-4 text-sm text-danger">{errMsg}</p>}

      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={update.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-ink-inverse transition-colors hover:bg-brand-hover disabled:bg-line-strong disabled:text-ink-muted"
        >
          {update.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Save changes
        </button>
        <button onClick={onDone} className="rounded-lg px-4 py-2 text-sm font-semibold text-ink-secondary hover:bg-surface-sunken">
          Cancel
        </button>
      </div>
    </Card>
  );
}

/* ── Right rail ──────────────────────────────────────────────── */

/**
 * Profile completeness, derived at read time from the fields this role can
 * actually fill in. A stored percentage goes stale the moment somebody edits
 * their profile, and a student is not asked for a supervised region.
 */
function completionOf(profile: Profile): { pct: number; missing: string[] } {
  const fields: { label: string; filled: boolean }[] = [
    { label: 'Profile picture', filled: !!profile.avatarUrl },
    { label: 'Phone number',    filled: !!profile.phone },
    { label: 'Gender',          filled: !!profile.gender },
  ];
  if (profile.role === 'student') {
    fields.push(
      { label: 'Index number', filled: !!profile.indexNumber },
      { label: 'Programme',    filled: !!profile.programme },
    );
  }
  if (profile.role === 'academic_supervisor') {
    fields.push({ label: 'Supervised region', filled: !!profile.supervisedRegion });
  }

  const filled = fields.filter(f => f.filled).length;
  return {
    pct: Math.round((filled / fields.length) * 100),
    missing: fields.filter(f => !f.filled).map(f => f.label),
  };
}

/**
 * What this role may actually do, stated from the authorization rules rather
 * than decorated: a coordinator really is read-only on the logbook pipeline,
 * and saying otherwise on their own profile would be a lie about the system.
 */
const ROLE_PERMISSIONS: Record<Profile['role'], { label: string; detail: string; icon: React.ElementType }[]> = {
  student: [
    { label: 'Your logbook',   detail: 'Write, submit and revise your own weeks.', icon: BookOpen },
    { label: 'Your placement', detail: 'See your own placement, supervisors and grade once released.', icon: Eye },
  ],
  academic_supervisor: [
    { label: 'Review weeks',       detail: 'Acknowledge or return the weeks of interns assigned to you.', icon: ClipboardCheck },
    { label: 'Your interns only',  detail: 'Every list and count is scoped to your own assignments.', icon: Users },
    { label: 'Final evaluation',   detail: 'Sign off the assessment that closes a placement.', icon: ShieldCheck },
  ],
  coordinator: [
    { label: 'Cohort oversight',   detail: 'Read every placement, intern and company across the cohort.', icon: Eye },
    { label: 'Configuration',      detail: 'Set cohort rules, grade weights, holidays and assignments.', icon: ShieldCheck },
    { label: 'Read-only logbooks', detail: 'You never acknowledge or return a week — that is the supervisor\'s decision.', icon: Lock },
  ],
  admin: [
    { label: 'Full access', detail: 'Every module and setting in the system.', icon: ShieldCheck },
    { label: 'Break-glass', detail: 'You can act on any placement; every action is written to the audit log.', icon: Lock },
  ],
};

/** Cohort-wide figures, for the roles whose work is measured in them. */
function ActivitySummary() {
  const statsQuery   = usePlacementStats();
  const companyQuery = useCompaniesOverview();
  const stats   = statsQuery.data;
  const company = companyQuery.data;

  const loading = statsQuery.isLoading || companyQuery.isLoading;
  const failed  = statsQuery.isError && companyQuery.isError;

  const figures = [
    { label: 'Interns placed',      value: company?.placedInterns },
    { label: 'Placements approved', value: stats?.approved },
    { label: 'Companies onboarded', value: company?.totalCompanies },
    { label: 'Awaiting approval',   value: stats?.pending },
  ];

  return (
    <Card>
      <CardHeader title="Activity summary" subtitle="Across the whole cohort" />
      {loading ? (
        <SkeletonRows rows={2} />
      ) : failed ? (
        <ErrorState
          message="Couldn't load cohort figures."
          onRetry={() => { void statsQuery.refetch(); void companyQuery.refetch(); }}
          className="py-6"
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            {figures.map(f => (
              <div key={f.label} className="rounded-lg bg-surface-sunken px-3 py-3">
                {/* A figure whose endpoint failed is left blank rather than
                    shown as a zero that would read as a real count. */}
                <p className="text-xl font-bold text-ink">{f.value ?? '—'}</p>
                <p className="mt-0.5 text-[11px] text-ink-muted">{f.label}</p>
              </div>
            ))}
          </div>
          {/* The design shows "+18% this month" under each figure. A pilot has
              one month of history, so there is no prior period to compare
              against and no chip is drawn rather than one being invented. */}
          <p className="mt-3 text-[11px] text-ink-muted">
            Totals to date. Month-on-month movement appears once there is a prior
            period to compare against.
          </p>
        </>
      )}
    </Card>
  );
}

/** The real audit trail, most recent first. */
function RecentActivity() {
  const { data: rows = [], isLoading, isError, refetch } = useCoordinatorActivity(6);

  return (
    <Card>
      <CardHeader title="Recent activity" subtitle="From the audit log" />
      {isLoading ? (
        <SkeletonRows rows={3} />
      ) : isError ? (
        <ErrorState message="Couldn't load the audit feed." onRetry={() => void refetch()} className="py-6" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="No recorded activity yet"
          hint="Approvals, assignments and configuration changes appear here."
          className="py-6"
        />
      ) : (
        <ul className="space-y-3">
          {rows.map(r => (
            <li key={r.id} className="flex items-start gap-2.5">
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand-ink">
                <Activity className="h-3 w-3" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm text-ink">{r.summary}</span>
                <span className="block text-xs text-ink-muted">
                  {r.actor} · {fmtDate(r.createdAt)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// Every destination here is a route this role is actually authorized for —
// `/feedback` is closed to the coordinator, so theirs does not offer it.
const QUICK_ACTIONS: Record<Profile['role'], { label: string; to: string }[]> = {
  student: [
    { label: 'Open my logbook',   to: '/student/logbook' },
    { label: 'My submissions',    to: '/student/submissions' },
    { label: 'Final assessment',  to: '/student/final-assessment' },
    { label: 'Ask the assistant', to: '/student/chatbot' },
  ],
  academic_supervisor: [
    { label: 'Review logbooks',      to: '/supervisor/review' },
    { label: 'My dashboard',         to: '/supervisor/dashboard' },
    { label: 'Feedback centre',      to: '/feedback' },
    { label: 'Finalize a placement', to: '/supervisor/finalize' },
  ],
  coordinator: [
    { label: 'Manage interns',  to: '/coordinator/interns' },
    { label: 'Host companies',  to: '/coordinator/companies' },
    { label: 'Assignments',     to: '/coordinator/assignments' },
    { label: 'Cohort settings', to: '/coordinator/settings' },
  ],
  admin: [
    { label: 'All interns',     to: '/admin/interns' },
    { label: 'Review logbooks', to: '/admin/review' },
    { label: 'AI insights',     to: '/ai-insights' },
    { label: 'Feedback centre', to: '/feedback' },
  ],
};

export default function ProfilePage() {
  const { data: profile, isLoading, isError, refetch } = useProfile();
  const [editing, setEditing] = useState(false);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1500px] p-4 sm:p-6">
        <Card><SkeletonRows rows={6} /></Card>
      </div>
    );
  }

  if (isError || !profile) {
    return (
      <div className="mx-auto max-w-[1500px] p-4 sm:p-6">
        <Card><ErrorState message="Couldn't load your profile." onRetry={() => void refetch()} /></Card>
      </div>
    );
  }

  const fullName = `${profile.firstName} ${profile.lastName}`.trim();
  const initials = `${profile.firstName[0] ?? ''}${profile.lastName[0] ?? ''}`.toUpperCase();
  const isStudent = profile.role === 'student';

  const completion = completionOf(profile);
  // Cohort-wide figures and the audit feed are coordinator/admin surfaces —
  // both endpoints are authorized for those roles only.
  const seesCohort = profile.role === 'coordinator' || profile.role === 'admin';

  const placementStatus = profile.placement
    ? PLACEMENT_STATUS[profile.placement.status]
    : undefined;

  return (
    <div className="mx-auto grid max-w-[1500px] gap-5 p-4 sm:p-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-5">
        {/* Header card */}
        <Card>
          <div className="flex items-center gap-4">
            <AvatarUploader profile={profile} initials={initials} />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-xl font-bold tracking-tight text-ink">{fullName}</h1>
              <p className="truncate text-sm text-ink-secondary">{profile.email}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge tone="brand">{ROLE_LABELS[profile.role]}</Badge>
                {profile.isVerified ? (
                  <Badge tone="ok" icon={BadgeCheck}>Verified</Badge>
                ) : (
                  <Badge tone="warn" icon={ShieldAlert}>Unverified</Badge>
                )}
              </div>
            </div>
            {!editing && (
              <button
                onClick={() => setEditing(true)}
                className="inline-flex shrink-0 items-center gap-2 self-start rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink-secondary transition-colors hover:border-brand hover:text-brand-ink"
              >
                <Pencil className="h-4 w-4" /> Edit profile
              </button>
            )}
          </div>
        </Card>

        {editing && <EditProfileForm profile={profile} onDone={() => setEditing(false)} />}

        {/* Account details */}
        {!editing && (
          <Card>
            <CardHeader title="Account details" />
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field icon={Mail} label="Email" value={profile.email} />
              <Field icon={UserRound} label="Gender" value={profile.gender ? GENDER_LABELS[profile.gender] : null} />
              <Field icon={Phone} label="Phone" value={profile.phone} />
              {isStudent && <Field icon={Hash} label="Index number" value={profile.indexNumber} />}
              {isStudent && <Field icon={GraduationCap} label="Programme" value={profile.programme} />}
              <Field icon={Building2} label="Department" value={profile.department} />
              {profile.role === 'academic_supervisor' && (
                <Field icon={MapPin} label="Supervised region" value={regionLabel(profile.supervisedRegion)} />
              )}
              <Field icon={CalendarDays} label="Member since" value={fmtDate(profile.createdAt)} />
              <Field icon={CalendarDays} label="Last sign-in" value={fmtDate(profile.lastLoginAt)} />
            </div>
          </Card>
        )}

        {/* Placement (students only) */}
        {isStudent && (
          <Card>
            <CardHeader title="Placement" />
            {profile.placement ? (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <Field icon={Building2} label="Company" value={profile.placement.companyName} />
                <Field
                  icon={BadgeCheck}
                  label="Status"
                  value={
                    <Badge tone={placementStatus?.tone ?? 'neutral'}>
                      {placementStatus?.label ?? profile.placement.status}
                    </Badge>
                  }
                />
                <Field icon={MapPin} label="Region" value={regionLabel(profile.placement.region)} />
                <Field icon={MapPin} label="Company address" value={profile.placement.companyAddress} />
                <Field icon={CalendarDays} label="Start date" value={fmtDate(profile.placement.startDate)} />
                <Field icon={CalendarDays} label="End date" value={fmtDate(profile.placement.endDate)} />
                <Field icon={UserRound} label="Company supervisor" value={profile.placement.companySupervisor} />
                <Field icon={GraduationCap} label="Academic supervisor" value={profile.placement.academicSupervisor} />
              </div>
            ) : (
              <EmptyState
                icon={Building2}
                title="No placement on record yet"
                hint="Your placement appears here once the coordinator approves it."
                className="py-6"
              />
            )}
          </Card>
        )}
      </div>

      {/* ── Right rail ─────────────────────────────────────── */}
      <aside className="space-y-5">
        <Card>
          <CardHeader title="Profile completion" />
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-ink-secondary">Complete</span>
            <span className="font-bold text-ink">{completion.pct}%</span>
          </div>
          <ProgressBar
            value={completion.pct}
            tone={completion.pct === 100 ? 'ok' : 'brand'}
            label={`Profile ${completion.pct}% complete`}
          />
          {completion.missing.length === 0 ? (
            <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-ok">
              <BadgeCheck className="h-3.5 w-3.5" /> Your profile is complete.
            </p>
          ) : (
            <>
              <p className="mt-3 text-xs text-ink-muted">Still to add:</p>
              <ul className="mt-1 space-y-1">
                {completion.missing.map(m => (
                  <li key={m} className="text-xs text-ink-secondary">· {m}</li>
                ))}
              </ul>
              {/* Programme and supervised region are set by the coordinator, so
                  the edit form cannot always clear the list on its own. */}
              <button
                type="button" onClick={() => setEditing(true)}
                className="mt-3 text-xs font-semibold text-brand-ink hover:underline"
              >
                Complete your profile →
              </button>
            </>
          )}
        </Card>

        {seesCohort && <ActivitySummary />}
        {seesCohort && <RecentActivity />}

        <Card>
          <CardHeader title="My roles &amp; permissions" subtitle={ROLE_LABELS[profile.role]} />
          <ul className="space-y-3">
            {ROLE_PERMISSIONS[profile.role].map(({ label, detail, icon: Icon }) => (
              <li key={label} className="flex items-start gap-2.5">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-surface-sunken text-ink-secondary">
                  <Icon className="h-3 w-3" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">{label}</span>
                  <span className="block text-xs leading-relaxed text-ink-muted">{detail}</span>
                </span>
              </li>
            ))}
          </ul>
          {!profile.isVerified && (
            <p className="mt-4 flex items-start gap-2 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">
              <ShieldAlert className="mt-px h-3.5 w-3.5 shrink-0" />
              Your account is not verified yet, so some actions stay closed until it is.
            </p>
          )}
        </Card>

        <Card>
          <CardHeader title="Quick actions" />
          <div className="grid grid-cols-2 gap-2">
            {QUICK_ACTIONS[profile.role].map(a => (
              <Link
                key={a.to} to={a.to}
                className="rounded-lg border border-line px-3 py-2.5 text-center text-xs font-semibold text-ink-secondary transition-colors hover:border-brand hover:text-brand-ink"
              >
                {a.label}
              </Link>
            ))}
          </div>
        </Card>
      </aside>
    </div>
  );
}
