import { useState } from 'react';
import { Loader2, BadgeCheck, ShieldAlert, Mail, Phone, Hash, MapPin, Building2, CalendarDays, GraduationCap, UserRound, Pencil, X } from 'lucide-react';
import { useProfile, useUpdateProfile, type Profile, type UpdateProfileInput } from '@/hooks/useProfile';
import { regionLabel } from '@/lib/regions';

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

const PLACEMENT_STATUS_LABELS: Record<string, string> = {
  pending:   'Pending approval',
  active:    'Active',
  completed: 'Completed',
  withdrawn: 'Withdrawn',
  failed:    'Failed',
};

function fmtDate(d: string | null): string {
  if (!d) return '—';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function Field({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | null }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#eff4ff] text-[#15157d]">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#757684]">{label}</p>
        <p className="truncate text-sm font-medium text-[#0b1c30]">{value && value.trim() ? value : '—'}</p>
      </div>
    </div>
  );
}

function EditProfileForm({ profile, onDone }: { profile: Profile; onDone: () => void }) {
  const isStudent = profile.role === 'student';
  const update = useUpdateProfile();
  const [firstName, setFirstName]   = useState(profile.firstName);
  const [lastName, setLastName]     = useState(profile.lastName);
  const [gender, setGender]         = useState<Profile['gender']>(profile.gender);
  const [phone, setPhone]           = useState(profile.phone ?? '');
  const [indexNumber, setIndexNumber] = useState(profile.indexNumber ?? '');

  const inputCls = 'w-full rounded-lg border border-[#c7c5d4] bg-white px-3 py-2 text-sm text-[#0b1c30] focus:border-[#15157d] focus:outline-none focus:ring-1 focus:ring-[#15157d]';
  const labelCls = 'mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#757684]';

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
    try {
      await update.mutateAsync(patch);
      onDone();
    } catch { /* error surfaced below */ }
  }

  const errMsg = update.isError
    ? ((update.error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
        ?? 'Could not save changes. Please try again.')
    : null;

  return (
    <section className="mt-6 rounded-2xl border border-[#c7c5d4]/40 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-bold text-[#15157d]">Edit profile</h2>
        <button onClick={onDone} className="text-[#757684] hover:text-[#0b1c30]" aria-label="Cancel">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor="pf-first">First name</label>
          <input id="pf-first" className={inputCls} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </div>
        <div>
          <label className={labelCls} htmlFor="pf-last">Last name</label>
          <input id="pf-last" className={inputCls} value={lastName} onChange={(e) => setLastName(e.target.value)} />
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
          <input id="pf-phone" className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. +233 20 123 4567" />
        </div>
        {isStudent && (
          <div>
            <label className={labelCls} htmlFor="pf-index">Index number</label>
            <input id="pf-index" className={inputCls} value={indexNumber} onChange={(e) => setIndexNumber(e.target.value)} />
          </div>
        )}
      </div>

      {errMsg && <p className="mt-4 text-sm text-[#ba1a1a]">{errMsg}</p>}

      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={update.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-[#15157d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1e1ea0] disabled:opacity-60"
        >
          {update.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Save changes
        </button>
        <button onClick={onDone} className="rounded-lg px-4 py-2 text-sm font-semibold text-[#464652] hover:bg-[#f1f1f5]">
          Cancel
        </button>
      </div>
    </section>
  );
}

export default function ProfilePage() {
  const { data: profile, isLoading, isError, refetch } = useProfile();
  const [editing, setEditing] = useState(false);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-[#15157d]" />
      </div>
    );
  }

  if (isError || !profile) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12 text-center">
        <p className="text-sm text-[#ba1a1a]">Couldn't load your profile.</p>
        <button
          onClick={() => refetch()}
          className="mt-3 rounded-lg bg-[#15157d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1e1ea0]"
        >
          Try again
        </button>
      </div>
    );
  }

  const fullName = `${profile.firstName} ${profile.lastName}`.trim();
  const initials = `${profile.firstName[0] ?? ''}${profile.lastName[0] ?? ''}`.toUpperCase();
  const isStudent = profile.role === 'student';

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      {/* Header card */}
      <div className="rounded-2xl border border-[#c7c5d4]/40 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#e1e0ff] text-xl font-bold text-[#15157d]">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold text-[#0b1c30]">{fullName}</h1>
            <p className="truncate text-sm text-[#464652]">{profile.email}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-[#eff4ff] px-2.5 py-0.5 text-[11px] font-semibold text-[#15157d]">
                {ROLE_LABELS[profile.role]}
              </span>
              {profile.isVerified ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#e6f6ec] px-2.5 py-0.5 text-[11px] font-semibold text-[#1a7f43]">
                  <BadgeCheck className="h-3 w-3" /> Verified
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#fff4e0] px-2.5 py-0.5 text-[11px] font-semibold text-[#9a6700]">
                  <ShieldAlert className="h-3 w-3" /> Unverified
                </span>
              )}
            </div>
          </div>
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="inline-flex shrink-0 items-center gap-2 self-start rounded-lg border border-[#c7c5d4] px-3 py-2 text-sm font-semibold text-[#15157d] hover:bg-[#eff4ff]"
            >
              <Pencil className="h-4 w-4" /> Edit profile
            </button>
          )}
        </div>
      </div>

      {editing && <EditProfileForm profile={profile} onDone={() => setEditing(false)} />}

      {/* Account details */}
      {!editing && (
      <section className="mt-6 rounded-2xl border border-[#c7c5d4]/40 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-bold text-[#15157d]">Account details</h2>
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
      </section>
      )}

      {/* Placement (students only) */}
      {isStudent && (
        <section className="mt-6 rounded-2xl border border-[#c7c5d4]/40 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-bold text-[#15157d]">Placement</h2>
          {profile.placement ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field icon={Building2} label="Company" value={profile.placement.companyName} />
              <Field
                icon={BadgeCheck}
                label="Status"
                value={PLACEMENT_STATUS_LABELS[profile.placement.status] ?? profile.placement.status}
              />
              <Field icon={MapPin} label="Region" value={regionLabel(profile.placement.region)} />
              <Field icon={MapPin} label="Company address" value={profile.placement.companyAddress} />
              <Field icon={CalendarDays} label="Start date" value={fmtDate(profile.placement.startDate)} />
              <Field icon={CalendarDays} label="End date" value={fmtDate(profile.placement.endDate)} />
              <Field icon={UserRound} label="Company supervisor" value={profile.placement.companySupervisor} />
              <Field icon={GraduationCap} label="Academic supervisor" value={profile.placement.academicSupervisor} />
            </div>
          ) : (
            <p className="text-sm text-[#464652]">No placement on record yet.</p>
          )}
        </section>
      )}
    </div>
  );
}
