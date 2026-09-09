import { useState } from 'react';
import { Loader2, Send, Briefcase } from 'lucide-react';
import { useCreatePlacement, type NewPlacement } from '@/hooks/usePlacements';
import { Card, CardHeader } from '@/components/ui/Card';
import { REGION_VALUES, REGION_LABELS } from '@/lib/regions';
import { FieldError } from '@/components/shared/FieldError';

/**
 * Submit a placement for approval, from inside the app.
 *
 * Password registration collects these fields and creates the placement in the
 * same step, so this used not to exist. A Google sign-up off the class roster
 * creates the account and NOTHING else: that student saw "waiting for
 * approval" on an empty dashboard while no coordinator queue held a row for
 * them, because there was nothing to hold. The same gap catches anyone whose
 * placement was rejected and who needs to submit a different company.
 *
 * The fields, and the rules under them, are the ones `createPlacementSchema`
 * already enforces — this asks for exactly what the API requires and no more.
 */
export default function PlacementApplicationForm() {
  const create = useCreatePlacement();
  const [form, setForm] = useState<NewPlacement>({
    companyName: '', companyAddress: '', companySupervisorName: '',
    companySupervisorEmail: '', region: '', startDate: '', endDate: '',
  });
  const [touched, setTouched] = useState(false);
  const [done, setDone] = useState(false);

  const set = <K extends keyof NewPlacement>(k: K, v: NewPlacement[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const errors: Partial<Record<keyof NewPlacement, string>> = {};
  if (form.companyName.trim().length < 2) errors.companyName = 'Company name is required';
  if (form.companyAddress.trim().length < 5) errors.companyAddress = 'Give the full address, not a P.O. box';
  if (form.companySupervisorName.trim().length < 2) errors.companySupervisorName = 'Company supervisor name is required';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.companySupervisorEmail.trim())) {
    errors.companySupervisorEmail = 'A valid supervisor email is required';
  }
  if (!form.region) errors.region = 'Select the region you are working in';
  if (!form.startDate) errors.startDate = 'Start date is required';
  if (!form.endDate) errors.endDate = 'End date is required';
  if (form.startDate && form.endDate && new Date(form.endDate) <= new Date(form.startDate)) {
    errors.endDate = 'End date must be after start date';
  }
  const valid = Object.keys(errors).length === 0;
  const show = (k: keyof NewPlacement) => (touched ? errors[k] : undefined);

  const apiError = create.isError
    ? ((create.error as { response?: { data?: { message?: string } } })?.response?.data?.message
      ?? 'Could not submit your placement. Please try again.')
    : null;

  async function submit() {
    setTouched(true);
    if (!valid) return;
    try {
      await create.mutateAsync({
        ...form,
        companyName: form.companyName.trim(),
        companyAddress: form.companyAddress.trim(),
        companySupervisorName: form.companySupervisorName.trim(),
        companySupervisorEmail: form.companySupervisorEmail.trim().toLowerCase(),
      });
      setDone(true);
    } catch { /* surfaced above */ }
  }

  if (done) {
    return (
      <Card className="mt-6">
        <CardHeader
          title="Placement submitted"
          subtitle="Your coordinator has it now. Your logbook opens as soon as it is approved."
        />
        <p className="text-sm text-ink-secondary">
          You will be notified here when it is decided. Nothing else is needed from you.
        </p>
      </Card>
    );
  }

  const field = 'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none';

  return (
    <Card className="mt-6">
      <CardHeader
        title={<span className="flex items-center gap-2"><Briefcase className="h-4 w-4 text-brand-ink" /> Tell us where you are attached</span>}
        subtitle="Your coordinator approves this before your logbook opens."
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className="mb-1 block text-xs font-semibold text-ink-secondary">Company name</span>
          <input
            className={field} value={form.companyName} placeholder="Kofi Analytics Ltd"
            onChange={(e) => set('companyName', e.target.value)}
          />
          <FieldError message={show('companyName')} />
        </label>

        <label className="sm:col-span-2">
          <span className="mb-1 block text-xs font-semibold text-ink-secondary">Company address</span>
          <input
            className={field} value={form.companyAddress} placeholder="12 Independence Avenue, Accra"
            onChange={(e) => set('companyAddress', e.target.value)}
          />
          <FieldError message={show('companyAddress')} />
        </label>

        <label>
          <span className="mb-1 block text-xs font-semibold text-ink-secondary">Company supervisor</span>
          <input
            className={field} value={form.companySupervisorName} placeholder="Yaw Mensah"
            onChange={(e) => set('companySupervisorName', e.target.value)}
          />
          <FieldError message={show('companySupervisorName')} />
        </label>

        <label>
          <span className="mb-1 block text-xs font-semibold text-ink-secondary">Supervisor email</span>
          <input
            className={field} type="email" value={form.companySupervisorEmail}
            placeholder="yaw.mensah@company.com.gh"
            onChange={(e) => set('companySupervisorEmail', e.target.value)}
          />
          <FieldError message={show('companySupervisorEmail')} />
        </label>

        <label>
          <span className="mb-1 block text-xs font-semibold text-ink-secondary">Region</span>
          <select
            className={`${field} cursor-pointer`} value={form.region}
            onChange={(e) => set('region', e.target.value)}
          >
            <option value="">Select region</option>
            {REGION_VALUES.map((r) => <option key={r} value={r}>{REGION_LABELS[r]}</option>)}
          </select>
          <FieldError message={show('region')} />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="mb-1 block text-xs font-semibold text-ink-secondary">Start date</span>
            <input
              className={field} type="date" value={form.startDate}
              onChange={(e) => set('startDate', e.target.value)}
            />
            <FieldError message={show('startDate')} />
          </label>
          <label>
            <span className="mb-1 block text-xs font-semibold text-ink-secondary">End date</span>
            <input
              className={field} type="date" value={form.endDate}
              onChange={(e) => set('endDate', e.target.value)}
            />
            <FieldError message={show('endDate')} />
          </label>
        </div>
      </div>

      {apiError && <p className="mt-3 text-sm text-danger">{apiError}</p>}

      <button
        type="button" onClick={submit} disabled={create.isPending}
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-ink-inverse disabled:opacity-50"
      >
        {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        Submit for approval
      </button>
    </Card>
  );
}
