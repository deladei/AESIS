import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Clock, TrendingUp, CheckCircle2, AlertTriangle, BookOpen, ChevronRight, Loader2 } from 'lucide-react';
import { RiskBadge } from '@/components/shared/RiskBadge';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { useMyPlacements } from '@/hooks/usePlacements';
import { useSubmissions } from '@/hooks/useLogbook';

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs">
      <p className="text-slate-400 mb-0.5">{label}</p>
      <p className="text-blue-400 font-semibold font-mono">{payload[0].value}/100</p>
    </div>
  );
};

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function daysUntil(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  return Math.ceil(diff / 86_400_000);
}

export default function StudentDashboard() {
  const { data: placements, isLoading: placementsLoading } = useMyPlacements();
  const activePlacement = placements?.find((p) => p.placementStatus === 'active') ?? placements?.[0];
  const { data: submissions = [], isLoading: subsLoading } = useSubmissions(activePlacement?.id);

  if (placementsLoading || subsLoading) {
    return <div className="p-6 flex justify-center items-center h-64"><Loader2 className="w-6 h-6 animate-spin text-blue-400" /></div>;
  }

  const submitted  = submissions.filter((s) => s.submissionStatus !== 'not_submitted' && s.submissionStatus !== 'draft');
  const approved   = submissions.filter((s) => s.submissionStatus === 'approved');
  const onTime     = submitted.filter((s) => !s.isLate);
  const compliance = submitted.length > 0 ? Math.round((onTime.length / submitted.length) * 100) : 0;

  const withScores  = submissions.filter((s) => s.analysis?.qualityScore != null);
  const avgQuality  = withScores.length > 0
    ? (withScores.reduce((sum, s) => sum + (s.analysis!.qualityScore ?? 0), 0) / withScores.length).toFixed(1)
    : '—';

  const riskTier: 'low' | 'medium' | 'high' = 'low';

  const nextDue = submissions
    .filter((s) => s.submissionStatus === 'not_submitted' || s.submissionStatus === 'draft')
    .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())[0];

  const qualityTrend = [...submissions]
    .filter((s) => s.analysis?.qualityScore != null)
    .sort((a, b) => a.weekNumber - b.weekNumber)
    .map((s) => ({ week: `Wk ${s.weekNumber}`, score: s.analysis!.qualityScore! }));

  const recentSubmissions = [...submitted]
    .sort((a, b) => b.weekNumber - a.weekNumber)
    .slice(0, 4);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Dashboard</h1>
        <p className="text-slate-400 text-sm mt-0.5">
          {submitted.length} of {submissions.length} weeks submitted · Industrial Placement
        </p>
      </div>

      {nextDue && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
          <Clock className="w-4 h-4 text-amber-400 shrink-0" />
          <p className="text-amber-300 text-sm">
            <span className="font-semibold">Week {nextDue.weekNumber} logbook due in {daysUntil(nextDue.deadline)} days</span>
            {' '}— {formatDate(nextDue.deadline)}
          </p>
          <a href="/student/logbook" className="ml-auto flex items-center gap-1 text-amber-400 hover:text-amber-300 text-sm font-medium transition-colors cursor-pointer shrink-0">
            Submit now <ChevronRight className="w-3.5 h-3.5" />
          </a>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Current Risk"      value={<RiskBadge tier={riskTier} size="sm" />}                                              sub="Updated weekly"     icon={<AlertTriangle className="w-4 h-4 text-slate-400" />} />
        <StatCard label="Avg Quality Score" value={<span className="font-mono text-blue-400 text-2xl font-bold">{avgQuality}</span>}     sub="Out of 100"         icon={<TrendingUp className="w-4 h-4 text-slate-400" />} />
        <StatCard label="Compliance Rate"   value={<span className="font-mono text-emerald-400 text-2xl font-bold">{compliance}%</span>} sub={`${onTime.length} of ${submitted.length} on time`} icon={<CheckCircle2 className="w-4 h-4 text-slate-400" />} />
        <StatCard label="Submissions"       value={<span className="font-mono text-slate-200 text-2xl font-bold">{submitted.length} / {submissions.length}</span>} sub="Weeks complete" icon={<BookOpen className="w-4 h-4 text-slate-400" />} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-sm font-semibold text-white">Quality Score Trend</h2>
              <p className="text-slate-500 text-xs mt-0.5">NLP-scored logbook quality per week</p>
            </div>
            <span className="text-xs text-slate-500 font-mono">0 – 100</span>
          </div>
          {qualityTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={qualityTrend} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="week" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: '#3b82f6', strokeWidth: 0 }} activeDot={{ r: 5, fill: '#60a5fa', strokeWidth: 0 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-slate-600 text-sm">
              No scored submissions yet
            </div>
          )}
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-1">Submission Summary</h2>
          <p className="text-slate-500 text-xs mb-4">Your placement progress at a glance</p>
          <div className="space-y-3">
            {[
              { label: 'Approved',     count: approved.length,  color: 'bg-emerald-500' },
              { label: 'Submitted',    count: submitted.length - approved.length, color: 'bg-blue-500' },
              { label: 'Remaining',    count: submissions.length - submitted.length, color: 'bg-slate-600' },
            ].map((r) => (
              <div key={r.label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-slate-300 text-xs">{r.label}</span>
                  <span className="text-xs font-mono text-slate-400">{r.count}</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5">
                  <div className={`h-1.5 rounded-full ${r.color}`} style={{ width: submissions.length > 0 ? `${(r.count / submissions.length) * 100}%` : '0%' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h2 className="text-sm font-semibold text-white">Recent Submissions</h2>
          <a href="/student/submissions" className="text-xs text-blue-400 hover:text-blue-300 transition-colors cursor-pointer">View all</a>
        </div>
        {recentSubmissions.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">No submissions yet. Submit your first logbook entry to get started.</p>
        ) : (
          <div className="divide-y divide-slate-800">
            {recentSubmissions.map((s) => (
              <div key={s.id} className="flex items-center gap-4 px-5 py-3.5">
                <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                  <span className="text-slate-300 text-xs font-mono font-semibold">W{s.weekNumber}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-200 font-medium">Week {s.weekNumber}</span>
                    {s.isLate && <span className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded font-mono">LATE</span>}
                  </div>
                  <span className="text-xs text-slate-500">{s.submittedAt ? formatDate(s.submittedAt) : '—'}</span>
                </div>
                {s.analysis?.qualityScore != null && (
                  <span className="font-mono text-sm text-blue-400 font-semibold shrink-0">{s.analysis.qualityScore}/100</span>
                )}
                <StatusBadge type="submission" status={s.submissionStatus as any} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, icon }: { label: string; value: React.ReactNode; sub: string; icon: React.ReactNode }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-slate-500 font-medium uppercase tracking-wide">{label}</span>
        {icon}
      </div>
      <div className="mb-1">{value}</div>
      <p className="text-xs text-slate-500">{sub}</p>
    </div>
  );
}
