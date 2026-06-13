import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Zap, ClipboardList, UserCheck, Settings } from 'lucide-react';
import { useClickOutside } from '@/hooks/useClickOutside';

/**
 * Quick-actions menu (item 20) — replaces the previously decorative icon beside
 * the bell with a functional shortcut menu to the coordinator's common tasks.
 */
const ACTIONS = [
  { label: 'New placement',     to: '/coordinator/placements',  icon: Plus },
  { label: 'Review placements', to: '/coordinator/placements',  icon: ClipboardList },
  { label: 'Manage assignments', to: '/coordinator/assignments', icon: UserCheck },
  { label: 'Settings',          to: '/coordinator/settings',    icon: Settings },
];

export default function QuickActionsMenu() {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));

  return (
    <div className="relative hidden sm:block" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-full p-2 text-[#444653] transition-colors hover:bg-[#e5eeff]"
        aria-label="Quick actions" aria-haspopup="true" aria-expanded={open}
      >
        <Zap className="h-5 w-5" />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-[#c4c5d5]/60 bg-white py-1 shadow-xl">
          <p className="px-4 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-[#757684]">Quick actions</p>
          {ACTIONS.map((a) => {
            const Icon = a.icon;
            return (
              <Link key={a.label} to={a.to} onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-2 text-sm text-[#0b1c30] transition-colors hover:bg-[#eff4ff]">
                <Icon className="h-4 w-4 text-[#15157d]" /> {a.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
