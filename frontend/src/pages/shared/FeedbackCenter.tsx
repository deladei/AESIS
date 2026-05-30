import {
  Sparkles, RefreshCw, Copy, Video, MoreVertical, Paperclip, Send,
} from 'lucide-react';

/**
 * Feedback & Mentorship Center — built from the Stitch "Feedback Center" design.
 * Shared across student / supervisor / admin (each renders it inside its own shell).
 *
 * NOTE: static demo data for now (Ghanaian names) — to be wired to live feedback
 * data later. Chrome (sidebar + topbar) comes from the per-role shell.
 */

const interns = [
  'Akosua Mensah — Front-end Development',
  'Kwabena Boateng — UX Research',
  'Yaa Frimpong — Data Science',
];

const contexts = [
  'Mid-Term Performance Review',
  'Weekly Check-in Summary',
  'Project Completion Wrap-up',
];

const suggestions = [
  'Proactive communicator',
  'Excellent time-management',
  'Strong problem solver',
];

export default function FeedbackCenter() {
  return (
    <div className="mx-auto max-w-[1440px] p-6 md:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-[#15157d]">Feedback Center</h1>
        <p className="text-sm text-[#464652]">AI-assisted feedback, mentorship chat, and formal evaluations.</p>
      </header>

      <div className="grid grid-cols-12 gap-6">
        {/* AI Feedback Generator */}
        <section className="col-span-12 rounded-xl border border-[#712ae2]/30 bg-white/70 p-6 shadow-lg ring-1 ring-[#712ae2]/10 backdrop-blur lg:col-span-8">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-[#712ae2]" fill="currentColor" />
              <h3 className="text-xl font-semibold text-[#15157d]">AI-Assisted Feedback Generator</h3>
            </div>
            <span className="rounded-full bg-[#712ae2]/10 px-3 py-1 text-xs font-semibold text-[#712ae2]">Premium Feature</span>
          </div>
          <div className="flex flex-col gap-4">
            <p className="text-sm text-[#464652]">
              Select a student and a performance period to generate constructive feedback based on their recent activity and submissions.
            </p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-[#0b1c30]">Select Intern</label>
                <select defaultValue={interns[0]} className="rounded-lg border border-[#c7c5d4] bg-white px-3 py-2 text-sm text-[#0b1c30] focus:border-[#15157d] focus:outline-none focus:ring-2 focus:ring-[#15157d]/20">
                  {interns.map((i) => <option key={i}>{i}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-[#0b1c30]">Evaluation Context</label>
                <select defaultValue={contexts[0]} className="rounded-lg border border-[#c7c5d4] bg-white px-3 py-2 text-sm text-[#0b1c30] focus:border-[#15157d] focus:outline-none focus:ring-2 focus:ring-[#15157d]/20">
                  {contexts.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="rounded-lg border border-[#15157d]/10 bg-[#dce9ff]/50 p-4 text-sm italic text-[#2e3192]">
              "Akosua has shown remarkable growth in her understanding of React component lifecycles. Her recent contributions to the Dashboard project demonstrated not only technical proficiency but also a strong eye for accessible UI design…"
            </div>
            <div className="mt-1 flex justify-end gap-3">
              <button className="flex items-center gap-2 rounded-lg border border-[#712ae2] px-4 py-2 text-sm font-medium text-[#712ae2] transition-colors hover:bg-[#712ae2]/5">
                <RefreshCw className="h-4 w-4" /> Regenerate
              </button>
              <button className="flex items-center gap-2 rounded-lg bg-[#712ae2] px-6 py-2 text-sm font-medium text-white transition-all hover:shadow-md">
                <Copy className="h-4 w-4" /> Use This Feedback
              </button>
            </div>
          </div>
        </section>

        {/* Evaluations Status */}
        <section className="col-span-12 rounded-xl border border-[#c7c5d4]/30 bg-white p-6 shadow-sm lg:col-span-4">
          <h3 className="mb-4 text-xl font-semibold text-[#15157d]">Evaluations Status</h3>
          <div className="space-y-4">
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-sm font-medium">
                <span className="text-[#0b1c30]">Mid-Term Completion</span>
                <span className="text-[#22c087]">85%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[#e5eeff]">
                <div className="h-full bg-[#4edea3]" style={{ width: '85%' }} />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-sm font-medium">
                <span className="text-[#0b1c30]">Final Reports Pending</span>
                <span className="text-[#ba1a1a]">12</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[#e5eeff]">
                <div className="h-full bg-[#ba1a1a]" style={{ width: '30%' }} />
              </div>
            </div>
          </div>
          <div className="mt-8">
            <div className="h-32 w-full rounded-lg bg-gradient-to-br from-[#15157d]/10 via-[#712ae2]/10 to-[#22c087]/15" />
            <p className="mt-4 text-center text-sm text-[#464652]">Feedback engagement has increased by 14% this month.</p>
          </div>
        </section>

        {/* Collaborative Chat */}
        <section className="col-span-12 flex h-[600px] flex-col overflow-hidden rounded-xl border border-[#c7c5d4]/30 bg-white shadow-sm lg:col-span-5">
          <div className="flex items-center justify-between border-b border-[#c7c5d4]/30 bg-[#eff4ff] p-4">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#e1e0ff] text-xs font-bold text-[#15157d]">AM</div>
                <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-[#4edea3]" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-[#0b1c30]">Akosua Mensah</h4>
                <p className="text-xs text-[#464652]">Project: Dashboard UI</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="rounded-full p-2 text-[#464652] hover:bg-[#dce9ff]"><Video className="h-5 w-5" /></button>
              <button className="rounded-full p-2 text-[#464652] hover:bg-[#dce9ff]"><MoreVertical className="h-5 w-5" /></button>
            </div>
          </div>
          <div className="flex-grow space-y-4 overflow-y-auto bg-[#f8f9ff]/50 p-4">
            <div className="flex max-w-[85%] gap-3">
              <div className="rounded-2xl rounded-tl-none bg-[#dce9ff] p-3">
                <p className="text-sm text-[#0b1c30]">Hi Dr. Adjei! I've just finished the responsive grid for the analytics page. Would love a quick review when you have a moment.</p>
                <span className="mt-1 block text-[10px] text-[#464652]">10:24 AM</span>
              </div>
            </div>
            <div className="ml-auto flex max-w-[85%] justify-end gap-3">
              <div className="rounded-2xl rounded-tr-none bg-[#15157d] p-3 text-white shadow-sm">
                <p className="text-sm">Great work on the grid, Akosua. I'll take a look before our 2 PM sync. The spacing looks much better than last week.</p>
                <span className="mt-1 block text-right text-[10px] text-[#9da1ff]">10:45 AM</span>
              </div>
            </div>
            <div className="mx-2 flex gap-3 rounded-xl border border-[#712ae2]/20 bg-[#712ae2]/5 p-4">
              <Sparkles className="h-5 w-5 shrink-0 text-[#712ae2]" fill="currentColor" />
              <div>
                <p className="text-xs font-semibold text-[#712ae2]">AI Suggested Reply</p>
                <p className="mt-1 text-sm italic text-[#464652]">"I've noticed your progress on the responsiveness. Let's discuss how we can optimize the touch targets for mobile."</p>
                <button className="mt-2 text-xs font-medium text-[#712ae2] underline">Insert this reply</button>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 border-t border-[#c7c5d4]/30 p-4">
            <button className="rounded-full p-2 text-[#464652] hover:bg-[#dce9ff]"><Paperclip className="h-5 w-5" /></button>
            <input type="text" placeholder="Type a message…" className="flex-grow rounded-full border-none bg-[#eff4ff] px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#15157d]/20" />
            <button className="rounded-full bg-[#15157d] p-2 text-white transition-transform hover:scale-105 active:scale-95"><Send className="h-5 w-5" /></button>
          </div>
        </section>

        {/* Formal Evaluation */}
        <section className="col-span-12 rounded-xl border border-[#c7c5d4]/30 bg-white p-6 shadow-sm lg:col-span-7">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h3 className="text-xl font-semibold text-[#15157d]">Formal Evaluation</h3>
              <p className="text-sm text-[#464652]">Mid-Term Assessment Form</p>
            </div>
            <div className="flex gap-2">
              <button className="rounded-lg border border-[#c7c5d4] px-4 py-2 text-sm font-medium text-[#464652] transition-colors hover:bg-[#eff4ff]">Save Draft</button>
              <button className="rounded-lg bg-[#15157d] px-4 py-2 text-sm font-medium text-white transition-all hover:shadow-md">Submit Evaluation</button>
            </div>
          </div>
          <form className="space-y-8" onSubmit={(e) => e.preventDefault()}>
            <div className="space-y-2">
              <label className="text-sm font-medium text-[#0b1c30]">1. Technical Proficiency</label>
              <div className="grid grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={
                      n === 4
                        ? 'rounded-lg border border-[#15157d] bg-[#15157d] py-2 text-sm text-white shadow-sm'
                        : 'rounded-lg border border-[#c7c5d4] py-2 text-sm text-[#0b1c30] transition-all hover:border-[#15157d] hover:bg-[#15157d]/5'
                    }
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="text-xs italic text-[#464652]">Student demonstrates high capability in applying core principles to production code.</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-[#0b1c30]">2. Collaborative Growth &amp; Communication</label>
              <textarea rows={4} placeholder="Enter detailed observations about communication, teamwork, and receptiveness to feedback…" className="w-full rounded-xl border border-[#c7c5d4] bg-[#eff4ff] p-3 text-sm text-[#0b1c30] focus:border-[#15157d] focus:outline-none focus:ring-2 focus:ring-[#15157d]/20" />
            </div>

            <div className="rounded-xl border border-[#712ae2]/10 bg-[#712ae2]/5 p-4">
              <div className="mb-2 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-[#712ae2]" fill="currentColor" />
                <span className="text-sm font-medium text-[#712ae2]">Smart Suggestions</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <button key={s} type="button" className="rounded-full border border-[#712ae2]/30 bg-white px-3 py-1 text-xs text-[#712ae2] transition-all hover:bg-[#712ae2] hover:text-white">
                    + Add: "{s}"
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-[#0b1c30]">3. Areas for Improvement</label>
              <textarea rows={3} placeholder="Identify specific areas where the intern can focus for the remainder of the program…" className="w-full rounded-xl border border-[#c7c5d4] bg-[#eff4ff] p-3 text-sm text-[#0b1c30] focus:border-[#15157d] focus:outline-none focus:ring-2 focus:ring-[#15157d]/20" />
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
