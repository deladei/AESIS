import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Settings, LogOut, ShieldCheck } from 'lucide-react';
import { useClickOutside } from '@/hooks/useClickOutside';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Account menu (item 21) — avatar/name button opening a dropdown with the
 * coordinator's identity + role, a link to Settings, and Sign out.
 */
export default function AccountMenu({ user }: { user: { name: string; email: string; initials: string } }) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));
  const { logout } = useAuth();

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-3 rounded-full p-1 transition-colors hover:bg-[#e5eeff]"
        aria-label="Account menu" aria-haspopup="true" aria-expanded={open}
      >
        <span className="hidden text-right lg:block">
          <span className="block text-sm font-bold text-[#15157d]">{user.name}</span>
          <span className="block text-xs text-[#757684]">Head Coordinator</span>
        </span>
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e1e0ff] text-xs font-semibold text-[#15157d]">
          {user.initials}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-[#c4c5d5]/60 bg-white shadow-xl">
          <div className="border-b border-[#c4c5d5]/40 px-4 py-3">
            <p className="truncate text-sm font-bold text-[#0b1c30]">{user.name}</p>
            <p className="truncate text-xs text-[#757684]">{user.email}</p>
            <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-[#eff4ff] px-2 py-0.5 text-[11px] font-semibold text-[#15157d]">
              <ShieldCheck className="h-3 w-3" /> Coordinator
            </span>
          </div>
          <div className="py-1">
            <Link to="/coordinator/settings" onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2 text-sm text-[#0b1c30] transition-colors hover:bg-[#eff4ff]">
              <Settings className="h-4 w-4 text-[#15157d]" /> Settings
            </Link>
            <button onClick={() => { setOpen(false); logout(); }}
              className="flex w-full items-center gap-3 px-4 py-2 text-sm text-[#444653] transition-colors hover:bg-[#ffdad6] hover:text-[#ba1a1a]">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
