import {
  Sparkles, TrendingUp, AlertTriangle, ChevronRight,
} from 'lucide-react';

/**
 * AI Insights & Analytics — built from the Stitch "AI Insights & Analytics" design.
 * Shared across supervisor / coordinator / admin (each renders it inside its own shell).
 *
 * NOTE: static demo data for now (Ghanaian names) — to be wired to live AI-engine
 * analytics later. Chrome (sidebar + topbar) comes from the per-role shell.
 */

const successBars = [
  { label: 'Week 1', track: 'h-32', fill: 'h-24' },
  { label: 'Week 2', track: 'h-40', fill: 'h-32' },
  { label: 'Week 3', track: 'h-48', fill: 'h-36' },
  { label: 'Week 4', track: 'h-56', fill: 'h-44' },
  { label: 'Current', track: 'h-60', fill: 'h-52', projected: '87% Projected' },
];

// 14-cell sentiment heatmap (opacity values mirror the design)
const sentiment = [40, 60, 20, 80, 30, 50, -1, 70, 40, 60, 20, 80, 30, 50];

const skills = [
  { name: 'Cloud Architecture', note: 'Gap: -15%', noteTone: '#464652', fill: 65, gap: 15,
    detail: 'Required: Advanced proficiency in AWS/Azure. Current: Intermediate.' },
  { name: 'Data Literacy', note: 'Surplus: +10%', noteTone: '#22c087', fill: 90, surplus: true },
  { name: 'Agile Collaboration', note: 'Gap: -5%', noteTone: '#464652', fill: 75, gap: 5 },
];

const recommendations = [
  { title: 'Targeted Mentorship', body: <>Schedule a 1-on-1 with <span className="font-semibold">Akosua Mensah</span>. Sentiment analysis indicates frustration with technical blockers in Sprint 3.</> },
  { title: 'Resource Assignment', body: <>Deploy "Cloud Networking 101" module to the entire Software Engineering cohort to address the Cloud Architecture skill gap.</> },
  { title: 'Success Signal', body: <>Intern <span className="font-semibold">Kwabena Boateng</span> has exceeded performance modeling by 24%. Recommended for early full-time offer track.</> },
];

const monitor = [
  { initials: 'AM', name: 'Akosua Mensah', dept: 'Software Engineering', engagement: 85, engLabel: 'High',     velocity: '1.2x Baseline', score: 92, tone: '#15157d', status: 'Active',  flagged: false },
  { initials: 'KB', name: 'Kwabena Boateng', dept: 'Product',          engagement: 95, engLabel: 'Excelling', velocity: '1.5x Baseline', score: 98, tone: '#15157d', status: 'Active',  flagged: false },
  { initials: 'YF', name: 'Yaa Frimpong',   dept: 'UX Design',          engagement: 40, engLabel: 'At Risk',  velocity: '0.6x Baseline', score: 54, tone: '#ba1a1a', status: 'Flagged', flagged: true },
];

export default function AIInsights() {
  return (
    <div className="mx-auto max-w-[1440px] p-6 md:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-[#15157d]">AI Insights &amp; Analytics</h1>
        <p className="text-sm text-[#464652]">Deep-dive into internship performance data and predictive modeling.</p>
      </header>

      <div className="grid grid-cols-12 gap-6">
        {/* Hiring Success Probability */}
        <section className="col-span-12 overflow-hidden rounded-xl border border-[#712ae2]/10 bg-white/70 p-6 shadow-[0_4px_20px_-2px_rgba(113,42,226,0.15)] backdrop-blur lg:col-span-8">
          <div className="mb-6 flex items-start justify-between">
            <div>
              <div className="mb-1 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-[#712ae2]" fill="currentColor" />
                <span className="text-xs font-semibold uppercase tracking-wider text-[#712ae2]">Predictive Modeling</span>
              </div>
              <h3 className="text-xl font-semibold text-[#0b1c30]">Hiring Success Probability</h3>
            </div>
            <span className="flex items-center gap-1 rounded-full bg-[#22c087]/10 px-3 py-1 text-xs font-semibold text-[#22c087]">
              <TrendingUp className="h-4 w-4" /> 12% vs last cohort
            </span>
          </div>
          <div className="flex h-64 items-end justify-between gap-4 px-4">
            {successBars.map((b) => (
              <div key={b.label} className="group flex flex-1 flex-col items-center gap-2">
                <div className={`relative w-full rounded-t-lg bg-[#d3e4fe] transition-all group-hover:bg-[#2e3192] ${b.track}`}>
                  <div className={`absolute bottom-0 w-full rounded-t-lg bg-[#712ae2] opacity-80 ${b.fill}`} />
                  {b.projected && (
                    <div className="absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-[#0b1c30] px-2 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                      {b.projected}
                    </div>
                  )}
                </div>
                <span className="text-xs text-[#777683]">{b.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Weekly Sentiment */}
        <section className="col-span-12 flex flex-col rounded-xl border border-[#712ae2]/10 bg-white/70 p-6 backdrop-blur lg:col-span-4">
          <h3 className="mb-6 text-xl font-semibold text-[#0b1c30]">Weekly Sentiment</h3>
          <div className="grid flex-grow grid-cols-7 gap-2">
            {sentiment.map((v, i) => (
              <div
                key={i}
                className="aspect-square rounded-sm"
                style={{ backgroundColor: v < 0 ? 'rgba(255,218,214,0.4)' : `rgba(78,222,163,${Math.abs(v) / 100})` }}
                title={v < 0 ? 'Anomalous Drop' : undefined}
              />
            ))}
          </div>
          <div className="mt-4 border-t border-[#c7c5d4]/20 pt-4">
            <div className="flex items-center gap-2 text-xs text-[#464652]">
              <AlertTriangle className="h-4 w-4 shrink-0 text-[#ba1a1a]" />
              <span>Anomaly detected in "Week 4 Reflection" for 3 interns.</span>
            </div>
          </div>
        </section>

        {/* Skill Gap Analysis */}
        <section className="col-span-12 rounded-xl border border-[#712ae2]/10 bg-white/70 p-6 backdrop-blur lg:col-span-7">
          <div className="mb-6 flex items-center justify-between">
            <h3 className="text-xl font-semibold text-[#0b1c30]">Skill Gap Analysis</h3>
            <button className="flex items-center gap-1 text-sm font-medium text-[#15157d] hover:underline">
              View Details <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-6">
            {skills.map((s) => (
              <div key={s.name}>
                <div className="mb-2 flex justify-between">
                  <span className="text-sm font-medium text-[#0b1c30]">{s.name}</span>
                  <span className="text-xs" style={{ color: s.noteTone }}>{s.note}</span>
                </div>
                <div className="flex h-2 w-full overflow-hidden rounded-full bg-[#e5eeff]">
                  <div
                    className="h-full"
                    style={{ width: `${s.fill}%`, backgroundColor: s.surplus ? '#4edea3' : '#712ae2' }}
                  />
                  {s.gap && <div className="h-full bg-[#c7c5d4]/30" style={{ width: `${s.gap}%` }} />}
                </div>
                {s.detail && <p className="mt-2 text-xs italic text-[#464652]">{s.detail}</p>}
              </div>
            ))}
          </div>
        </section>

        {/* Actionable Summaries */}
        <section className="col-span-12 rounded-xl border-l-4 border-[#712ae2] bg-white/70 p-6 shadow-[0_4px_20px_-2px_rgba(113,42,226,0.15)] backdrop-blur lg:col-span-5">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[#712ae2]" fill="currentColor" />
            <h3 className="text-xl font-semibold text-[#0b1c30]">Actionable Summaries</h3>
          </div>
          <div className="space-y-4">
            {recommendations.map((r) => (
              <div key={r.title} className="rounded-lg border border-[#712ae2]/10 bg-[#e5eeff] p-3">
                <h4 className="mb-1 text-sm font-medium text-[#15157d]">{r.title}</h4>
                <p className="text-sm text-[#464652]">{r.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Real-time Performance Monitoring */}
        <section className="col-span-12 overflow-hidden rounded-xl border border-[#712ae2]/10 bg-white/70 backdrop-blur">
          <div className="flex items-center justify-between border-b border-[#c7c5d4]/20 p-6">
            <h3 className="text-xl font-semibold text-[#0b1c30]">Real-time Performance Monitoring</h3>
            <select className="rounded-lg border border-[#c7c5d4] bg-[#eff4ff] px-3 py-1 text-xs text-[#0b1c30] outline-none">
              <option>Sort by: Retention Risk</option>
              <option>Sort by: Progress</option>
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-[#eff4ff]/50">
                <tr>
                  {['Intern', 'Department', 'Engagement', 'Project Velocity', 'Success Score', 'Status'].map((h) => (
                    <th key={h} className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-[#777683]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#c7c5d4]/10">
                {monitor.map((m) => (
                  <tr key={m.name} className="transition-colors hover:bg-[#dce9ff]/30">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#712ae2]/20 text-xs font-bold text-[#712ae2]">{m.initials}</div>
                        <span className="text-sm font-medium text-[#0b1c30]">{m.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-[#464652]">{m.dept}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 rounded-full bg-[#e5eeff]">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${m.engagement}%`, backgroundColor: m.flagged ? '#ba1a1a' : '#4edea3' }}
                          />
                        </div>
                        <span className="text-xs text-[#0b1c30]">{m.engLabel}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-[#464652]">{m.velocity}</td>
                    <td className="px-6 py-4">
                      <span className="font-bold" style={{ color: m.tone }}>{m.score}/100</span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className="rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-tight"
                        style={m.flagged
                          ? { backgroundColor: 'rgba(255,218,214,0.4)', color: '#ba1a1a' }
                          : { backgroundColor: 'rgba(0,47,30,0.1)', color: '#22c087' }}
                      >
                        {m.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
