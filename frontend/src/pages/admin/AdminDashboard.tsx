import {
  Activity, ArrowRight, CheckCircle2, MessageCircle, Sparkles,
  AlertTriangle, CalendarClock, Zap, ArrowUpCircle, MoreVertical, ChevronDown,
} from 'lucide-react';

/**
 * Admin Dashboard — built from the Stitch "Supervisor Dashboard" design
 * (Pulse Check Board / AI Alerts / Recent Submissions).
 *
 * NOTE: static demo data for now (Ghanaian names) — to be wired to live data
 * later. Chrome (sidebar + topbar) comes from AdminShell.
 */

const stats = [
  { label: 'Active Interns',  value: '12',  tone: 'text-[#15157d]' },
  { label: 'Pending Reviews', value: '08',  tone: 'text-[#712ae2]' },
  { label: 'Avg. Pulse',      value: '92%', tone: 'text-[#22c087]' },
];

const pulse = [
  { name: 'Akua Sarpong',  role: 'UX Design Intern', badge: 'Top Performer', top: true,  pct: 98, tasks: '14/15 Tasks', feedback: '8 Feedbacks' },
  { name: 'Kojo Mensah',   role: 'Backend Intern',   badge: 'On Track',      top: false, pct: 82, tasks: '11/15 Tasks', feedback: '3 Feedbacks' },
  { name: 'Adwoa Agyeman', role: 'Marketing Intern', badge: 'On Track',      top: false, pct: 75, tasks: '9/12 Tasks',  feedback: '5 Feedbacks' },
  { name: 'Kwame Appiah',  role: 'Product Intern',   badge: 'On Track',      top: false, pct: 88, tasks: '13/15 Tasks', feedback: '2 Feedbacks' },
];

const submissions = [
  { name: 'Kojo Mensah',   av: 'bg-[#2e3192] text-[#9da1ff]', task: 'API Documentation – Auth V2', date: 'Today, 10:45 AM',  status: 'pending'  },
  { name: 'Akua Sarpong',  av: 'bg-[#8a4cfc] text-[#fffbff]', task: 'User Journey Mapping',        date: 'Yesterday, 4:20 PM', status: 'pending'  },
  { name: 'Kwesi Boateng', av: 'bg-[#6ffbbe] text-[#002113]', task: 'Bug Fix: Dashboard Grid',     date: 'Feb 22, 2:15 PM',   status: 'approved' },
];

function initials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
}

export default function AdminDashboard() {
  return (
    <div className="mx-auto max-w-[1440px] space-y-8 p-6 md:p-10">
      {/* Welcome & stats */}
      <section className="flex flex-col items-end justify-between gap-6 md:flex-row">
        <div className="w-full">
          <h2 className="text-3xl font-semibold tracking-tight text-[#0b1c30]">Supervisor Overview</h2>
          <p className="mt-1 text-[#464652]">Monitoring 12 active internships across Engineering &amp; Product.</p>
        </div>
        <div className="flex gap-4">
          {stats.map((s) => (
            <div key={s.label} className="flex flex-col rounded-xl border border-[#c7c5d4]/30 bg-white p-4 shadow-sm">
              <span className="text-xs font-medium text-[#464652]">{s.label}</span>
              <span className={`text-2xl font-bold ${s.tone}`}>{s.value}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Bento grid */}
      <div className="grid grid-cols-12 gap-6">
        {/* Pulse Check Board */}
        <section className="col-span-12 space-y-4 lg:col-span-8">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-2xl font-semibold text-[#0b1c30]">
              <Activity className="h-6 w-6 text-[#22c087]" />
              Pulse Check Board
            </h3>
            <button className="flex items-center gap-1 text-sm font-medium text-[#15157d] hover:underline">
              View Detailed Metrics <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {pulse.map((p) => (
              <div key={p.name} className="rounded-xl border border-[#c7c5d4]/30 bg-white/70 p-4 backdrop-blur transition-all hover:shadow-lg">
                <div className="mb-4 flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#e1e0ff] text-sm font-bold text-[#15157d]">{initials(p.name)}</div>
                    <div>
                      <h4 className="text-sm font-bold text-[#0b1c30]">{p.name}</h4>
                      <p className="text-xs text-[#464652]">{p.role}</p>
                    </div>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${p.top ? 'bg-[#6ffbbe] text-[#002113]' : 'bg-[#dce9ff] text-[#464652]'}`}>
                    {p.badge}
                  </span>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[#464652]">Weekly Engagement</span>
                    <span className="font-semibold text-[#15157d]">{p.pct}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-200">
                    <div className={`h-2 rounded-full ${p.top ? 'bg-[#4edea3]' : 'bg-[#15157d]'}`} style={{ width: `${p.pct}%` }} />
                  </div>
                  <div className="flex items-center gap-4 text-xs text-[#464652]">
                    <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> {p.tasks}</span>
                    <span className="flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" /> {p.feedback}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* AI Alerts */}
        <aside className="col-span-12 space-y-4 lg:col-span-4">
          <h3 className="flex items-center gap-2 text-2xl font-semibold text-[#0b1c30]">
            <Sparkles className="h-6 w-6 text-[#712ae2]" />
            AI Alerts
          </h3>
          <div className="flex flex-col gap-4">
            {/* Urgent */}
            <div className="space-y-3 rounded-xl border border-[#712ae2]/20 bg-white/70 p-5 shadow-[0_0_15px_-3px_rgba(113,42,226,0.15)] backdrop-blur">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-[#712ae2]" />
                <span className="text-xs font-bold uppercase tracking-widest text-[#712ae2]">Urgent Support Needed</span>
              </div>
              <p className="text-sm leading-tight text-[#0b1c30]">
                <span className="font-bold text-[#15157d]">Kwesi Boateng</span> has missed 3 daily standups and submission frequency has dropped by 45% this week.
              </p>
              <div className="rounded-lg border border-[#ba1a1a]/10 bg-[#ffdad6]/30 p-3">
                <p className="text-sm italic text-[#93000a]">"AI predicts potential burnout or blockers in the 'Authentication' module."</p>
              </div>
              <button className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#712ae2] py-2 text-sm font-medium text-[#712ae2] transition-colors hover:bg-[#712ae2]/5">
                <CalendarClock className="h-4 w-4" /> Schedule Check-in
              </button>
            </div>
            {/* Growth */}
            <div className="space-y-3 rounded-xl border border-[#712ae2]/20 bg-white/70 p-5 shadow-[0_0_15px_-3px_rgba(113,42,226,0.15)] backdrop-blur">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-[#22c087]" />
                <span className="text-xs font-bold uppercase tracking-widest text-[#22c087]">Growth Opportunity</span>
              </div>
              <p className="text-sm leading-tight text-[#0b1c30]">
                <span className="font-bold text-[#15157d]">Akua Sarpong</span> has completed her curriculum 2 weeks ahead of schedule.
              </p>
              <p className="text-sm text-[#464652]">AI suggests assigning "Lead Architect Shadowing" to maintain momentum.</p>
              <button className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#712ae2] py-2 text-sm font-medium text-[#712ae2] transition-colors hover:bg-[#712ae2]/5">
                <ArrowUpCircle className="h-4 w-4" /> Promote to Level 2
              </button>
            </div>
          </div>
        </aside>

        {/* Recent Submissions */}
        <section className="col-span-12 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-semibold text-[#0b1c30]">Recent Submissions</h3>
            <div className="flex gap-2">
              <span className="rounded-full bg-[#8a4cfc] px-3 py-1 text-xs font-medium text-[#fffbff]">8 Pending</span>
              <span className="rounded-full bg-[#e5eeff] px-3 py-1 text-xs font-medium text-[#464652]">24 Reviewed</span>
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-[#c7c5d4]/30 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead className="border-b border-[#c7c5d4]/30 bg-[#eff4ff]">
                  <tr className="text-xs font-medium uppercase tracking-wider text-[#464652]">
                    <th className="px-6 py-4">Intern</th>
                    <th className="px-6 py-4">Task Title</th>
                    <th className="px-6 py-4">Submission Date</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#c7c5d4]/20">
                  {submissions.map((s) => (
                    <tr key={s.name} className="transition-colors hover:bg-[#eff4ff]">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${s.av}`}>{initials(s.name)}</div>
                          <span className="text-sm text-[#0b1c30]">{s.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-[#0b1c30]">{s.task}</td>
                      <td className="px-6 py-4 text-sm text-[#464652]">{s.date}</td>
                      <td className="px-6 py-4">
                        {s.status === 'pending' ? (
                          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">Pending Review</span>
                        ) : (
                          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">Approved</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {s.status === 'pending' ? (
                          <button className="rounded-lg bg-[#15157d] px-4 py-1.5 text-sm font-semibold text-white transition-transform active:scale-95">Review</button>
                        ) : (
                          <button className="text-[#464652] transition-colors hover:text-[#15157d]"><MoreVertical className="h-5 w-5" /></button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-center bg-[#eff4ff]/50 p-4">
              <button className="flex items-center gap-2 text-sm font-medium text-[#464652] transition-colors hover:text-[#15157d]">
                View all submissions <ChevronDown className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
