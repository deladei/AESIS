import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2, Globe, Users, Briefcase, MapPin, Search, Plus, X,
  LayoutGrid, List, Loader2, Trophy, ChevronRight, GraduationCap,
} from 'lucide-react';
import {
  useCompanies, useCompaniesOverview, useCreateCompany, type Company,
} from '@/hooks/usePlacements';
import { Card, CardHeader } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { Badge } from '@/components/ui/Badge';
import { InitialsAvatar } from '@/components/ui/Bits';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/Feedback';
import { FieldError } from '@/components/shared/FieldError';
import { regionLabel } from '@/lib/regions';
import { cn } from '@/lib/utils';

type SortKey = 'recent' | 'name' | 'interns';

/**
 * Host Companies — the coordinator's partner board.
 *
 * Every figure on this page is counted off real rows: interns are distinct
 * students, "active" means a placement is live today, open roles are published
 * opportunities, and the leaderboard is ordered by placement count. The
 * reference design also carries star ratings, an average-satisfaction tile, a
 * retention rate, a partnership health score and AI match percentages — nothing
 * in this system rates or scores a company, so those are absent rather than
 * invented.
 */
export default function CompaniesList() {
  const companiesQuery = useCompanies();
  const overviewQuery  = useCompaniesOverview();

  const [search, setSearch]     = useState('');
  const [status, setStatus]     = useState<'all' | 'active' | 'pending'>('all');
  const [industry, setIndustry] = useState('all');
  const [region, setRegion]     = useState('all');
  const [sort, setSort]         = useState<SortKey>('recent');
  const [view, setView]         = useState<'grid' | 'list'>('grid');
  const [adding, setAdding]     = useState(false);

  const companies = companiesQuery.data?.companies ?? [];
  const overview  = overviewQuery.data;

  // Filter options come from the roster itself — a filter that lists an
  // industry nobody is in would return an empty board every time.
  const industries = useMemo(
    () => [...new Set(companies.map(c => c.industry).filter((i): i is string => !!i))].sort(),
    [companies],
  );
  const regions = useMemo(
    () => [...new Set(companies.map(c => c.region).filter((r): r is NonNullable<Company['region']> => !!r))].sort(),
    [companies],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = companies.filter((c) => {
      if (q && !`${c.name} ${c.industry ?? ''}`.toLowerCase().includes(q)) return false;
      if (status !== 'all' && c.status !== status) return false;
      if (industry !== 'all' && c.industry !== industry) return false;
      if (region !== 'all' && c.region !== region) return false;
      return true;
    });

    return rows.sort((a, b) => {
      if (sort === 'name')    return a.name.localeCompare(b.name);
      if (sort === 'interns') return b.internCount - a.internCount;
      return b.activePlacements - a.activePlacements || a.name.localeCompare(b.name);
    });
  }, [companies, search, status, industry, region, sort]);

  const filtered = visible.length !== companies.length;

  return (
    <div className="mx-auto max-w-[1500px] p-4 sm:p-6">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          {/* ── Header ─────────────────────────────────────────── */}
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="mb-1 text-xs font-semibold text-brand-ink">Coordinator</p>
              <h1 className="text-2xl font-bold tracking-tight text-ink">Host Companies</h1>
              <p className="mt-1 text-sm text-ink-secondary">
                Manage partner organisations and track placement opportunities.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-ink-inverse transition-colors hover:bg-brand-hover"
            >
              <Plus className="h-4 w-4" /> Add Company
            </button>
          </header>

          {/* ── Headline figures ───────────────────────────────── */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Total companies" value={overview?.totalCompanies ?? 0}
              icon={Building2} tone="brand" loading={overviewQuery.isLoading}
              footnote="Partner organisations on the books"
            />
            <StatCard
              label="Active placements" value={overview?.activePlacements ?? 0}
              icon={Briefcase} tone="ok" loading={overviewQuery.isLoading}
              footnote="Interns on placement today"
            />
            <StatCard
              label="Placed interns" value={overview?.placedInterns ?? 0}
              icon={GraduationCap} tone="info" loading={overviewQuery.isLoading}
              footnote="Distinct students ever hosted"
            />
            <StatCard
              label="Open opportunities" value={overview?.openOpportunities ?? 0}
              icon={Users} tone="warn" loading={overviewQuery.isLoading}
              footnote="Published roles accepting applications"
            />
          </div>

          {/* ── Filter bar ─────────────────────────────────────── */}
          <Card className="flex flex-wrap items-center gap-2 p-3">
            <label className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search companies…"
                aria-label="Search companies"
                className="w-full rounded-lg border border-line bg-surface py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none"
              />
            </label>

            <Select value={status} onChange={(v) => setStatus(v as typeof status)} label="Status">
              <option value="all">Status: All</option>
              <option value="active">Active</option>
              <option value="pending">Pending</option>
            </Select>

            {industries.length > 0 && (
              <Select value={industry} onChange={setIndustry} label="Industry">
                <option value="all">Industry: All</option>
                {industries.map(i => <option key={i} value={i}>{i}</option>)}
              </Select>
            )}

            {regions.length > 0 && (
              <Select value={region} onChange={setRegion} label="Location">
                <option value="all">Location: All</option>
                {regions.map(r => <option key={r} value={r}>{regionLabel(r)}</option>)}
              </Select>
            )}

            <Select value={sort} onChange={(v) => setSort(v as SortKey)} label="Sort">
              <option value="recent">Sort: Most active</option>
              <option value="name">Sort: Name</option>
              <option value="interns">Sort: Most interns</option>
            </Select>

            <div className="flex items-center gap-1 rounded-lg border border-line p-0.5">
              <ViewToggle active={view === 'list'} onClick={() => setView('list')} icon={List} label="List view" />
              <ViewToggle active={view === 'grid'} onClick={() => setView('grid')} icon={LayoutGrid} label="Grid view" />
            </div>
          </Card>

          {/* ── The board ──────────────────────────────────────── */}
          {companiesQuery.isLoading ? (
            <SkeletonRows rows={4} />
          ) : companiesQuery.isError ? (
            <Card><ErrorState onRetry={() => void companiesQuery.refetch()} /></Card>
          ) : companies.length === 0 ? (
            <Card>
              <EmptyState
                icon={Building2}
                title="No host companies yet"
                hint="Add the organisations hosting your students and their placements will roll up here."
                action={
                  <button
                    type="button"
                    onClick={() => setAdding(true)}
                    className="inline-flex items-center gap-2 rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-ink-inverse hover:bg-brand-hover"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Company
                  </button>
                }
              />
            </Card>
          ) : visible.length === 0 ? (
            <Card>
              <EmptyState
                icon={Search}
                title="No companies match these filters"
                hint="Clear the search or widen the filters to see the full roster."
              />
            </Card>
          ) : (
            <div className={cn(
              'grid gap-4',
              view === 'grid' ? 'sm:grid-cols-2 2xl:grid-cols-3' : 'grid-cols-1',
            )}>
              {visible.map(c => <CompanyCard key={c.id} company={c} dense={view === 'list'} />)}

              {/* The "add" tile belongs with the cards, not off in a toolbar —
                  but only on the unfiltered board, where it reads as the next
                  slot rather than as a company the filter matched. */}
              {view === 'grid' && !filtered && (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="flex min-h-[190px] flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line-strong bg-surface p-5 text-center transition-colors hover:border-brand hover:bg-brand-soft/30"
                >
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-brand-soft text-brand-ink">
                    <Plus className="h-5 w-5" />
                  </span>
                  <span className="text-sm font-semibold text-ink">Add new company</span>
                  <span className="max-w-[15rem] text-xs text-ink-muted">
                    Register a host company to create placement opportunities.
                  </span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Right rail ───────────────────────────────────────── */}
        <aside className="space-y-5">
          <Card>
            <CardHeader title="Top performing companies" subtitle="Ranked by placements hosted" />
            {overviewQuery.isLoading ? (
              <SkeletonRows rows={3} />
            ) : !overview?.topCompanies.length ? (
              <EmptyState
                icon={Trophy}
                title="No placements yet"
                hint="The leaderboard fills in once companies start hosting interns."
                className="py-6"
              />
            ) : (
              <ol className="space-y-2">
                {overview.topCompanies.map((c, i) => (
                  <li key={c.id}>
                    <Link
                      to={`/coordinator/companies/${c.id}`}
                      className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-surface-sunken"
                    >
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-surface-sunken text-xs font-bold text-ink-secondary">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink">{c.name}</span>
                        {c.industry && <span className="block truncate text-xs text-ink-muted">{c.industry}</span>}
                      </span>
                      <span className="shrink-0 text-xs font-semibold text-ink-secondary">
                        {c.placements} placement{c.placements === 1 ? '' : 's'}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card>
            <CardHeader title="How this board is counted" />
            <ul className="space-y-2 text-xs leading-relaxed text-ink-secondary">
              <li><strong className="font-semibold text-ink">Interns</strong> — distinct students ever placed here, so a returning student counts once.</li>
              <li><strong className="font-semibold text-ink">Active</strong> — placements that are live today.</li>
              <li><strong className="font-semibold text-ink">Location</strong> — the region most of the company's placements sit in.</li>
              <li><strong className="font-semibold text-ink">Open roles</strong> — published opportunities accepting applications.</li>
            </ul>
          </Card>
        </aside>
      </div>

      {adding && <AddCompanyDialog onClose={() => setAdding(false)} />}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────── */

function CompanyCard({ company, dense }: { company: Company; dense: boolean }) {
  const c = company;
  return (
    <Link
      to={`/coordinator/companies/${c.id}`}
      className="group flex flex-col rounded-card border border-line bg-surface p-5 shadow-card transition-colors hover:border-brand"
    >
      <div className="flex items-start gap-3">
        {/* A monogram is not fake data; an unlicensed logo is a legal problem. */}
        {c.logoUrl
          ? <img src={c.logoUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg object-contain" />
          : <InitialsAvatar name={c.name} size={40} className="rounded-lg" />}

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-ink">{c.name}</p>
          <p className="truncate text-xs text-ink-muted">{c.industry ?? 'Host company'}</p>
        </div>

        <Badge tone={c.status === 'active' ? 'ok' : 'warn'}>
          {c.status === 'active' ? 'Active' : 'Pending'}
        </Badge>
      </div>

      {c.description && !dense && (
        <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-ink-secondary">{c.description}</p>
      )}

      <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg bg-surface-sunken px-3 py-2.5 text-center">
        <Metric value={c.internCount}       label={c.internCount === 1 ? 'Intern' : 'Interns'} />
        <Metric value={c.activePlacements}  label="Active" />
        <Metric value={c.openOpportunities} label="Open roles" />
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 text-xs text-ink-muted">
        <span className="inline-flex min-w-0 items-center gap-1">
          {c.region
            ? <><MapPin className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{regionLabel(c.region)}</span></>
            : <span className="truncate">No placements located yet</span>}
        </span>
        <span className="inline-flex shrink-0 items-center gap-2">
          {c.website && (
            <a
              href={c.website} target="_blank" rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 font-semibold text-brand-ink hover:underline"
            >
              <Globe className="h-3.5 w-3.5" /> Website
            </a>
          )}
          <ChevronRight className="h-4 w-4 text-ink-muted transition-colors group-hover:text-brand" />
        </span>
      </div>
    </Link>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <span className="block">
      <span className="block text-sm font-bold text-ink">{value}</span>
      <span className="block text-[11px] text-ink-muted">{label}</span>
    </span>
  );
}

function Select({
  value, onChange, label, children,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-ink-secondary focus:border-brand focus:outline-none"
    >
      {children}
    </select>
  );
}

function ViewToggle({
  active, onClick, icon: Icon, label,
}: { active: boolean; onClick: () => void; icon: React.ElementType; label: string }) {
  return (
    <button
      type="button" onClick={onClick} aria-label={label} aria-pressed={active}
      className={cn(
        'grid h-8 w-8 place-items-center rounded-md transition-colors',
        active ? 'bg-brand-soft text-brand-ink' : 'text-ink-muted hover:text-ink',
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

/** Register a host company. Only the name is required by the API. */
function AddCompanyDialog({ onClose }: { onClose: () => void }) {
  const create = useCreateCompany();
  const [form, setForm] = useState({ name: '', industry: '', website: '', address: '' });
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) { setError('A company name is required.'); return; }
    try {
      await create.mutateAsync({
        name:     form.name.trim(),
        industry: form.industry.trim() || undefined,
        website:  form.website.trim() || undefined,
        address:  form.address.trim() || undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add this company.');
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      role="dialog" aria-modal="true" aria-label="Add company"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <Card className="w-full max-w-md">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">Add host company</h2>
            <p className="mt-0.5 text-xs text-ink-muted">Only the name is required — the rest can follow.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-ink-muted hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <Field label="Company name" value={form.name} onChange={set('name')} placeholder="Ananse Technologies Ltd." autoFocus />
          <Field label="Industry"     value={form.industry} onChange={set('industry')} placeholder="Software" />
          <Field label="Website"      value={form.website} onChange={set('website')} placeholder="https://…" type="url" />
          <Field label="Address"      value={form.address} onChange={set('address')} placeholder="Accra" />

          <FieldError message={error ?? undefined} />

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button" onClick={onClose}
              className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink-secondary hover:bg-surface-sunken"
            >
              Cancel
            </button>
            <button
              type="submit" disabled={create.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-ink-inverse hover:bg-brand-hover disabled:opacity-60"
            >
              {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Add company
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function Field({
  label, ...rest
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-ink-secondary">{label}</span>
      <input
        {...rest}
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none"
      />
    </label>
  );
}
