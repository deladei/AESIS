import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Settings, LogOut, ShieldCheck, UserRound } from 'lucide-react';
import { useClickOutside } from '@/hooks/useClickOutside';
import { useAuth } from '@/contexts/AuthContext';
import { ROLE_LABELS } from '@/lib/roles';
import { UserAvatar } from './UserAvatar';

/**
 * Account menu — avatar/name button opening a dropdown with the signed-in
 * user's identity + role, a link to Settings, and Sign out.
 *
 * The subtitle used to be the literal string "Head Coordinator" for everybody,
 * so a student saw themselves labelled as the coordinator on every page.
 */
export default function AccountMenu({ user }: { user: { name: string; email: string; initials: string; avatarUrl?: string | null } }) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));
  const { logout, user: authUser } = useAuth();
  const roleLabel = authUser?.role ? ROLE_LABELS[authUser.role] ?? 'Account' : 'Account';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-3 rounded-full p-1 transition-colors hover:bg-brand-soft"
        aria-label="Account menu" aria-haspopup="true" aria-expanded={open}
      >
        <span className="hidden text-right lg:block">
          <span className="block text-sm font-bold text-brand-ink">{user.name}</span>
          <span className="block text-xs text-ink-muted">{roleLabel}</span>
        </span>
        <UserAvatar avatarUrl={user.avatarUrl} initials={user.initials} name={user.name} />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-card border border-line bg-surface shadow-pop">
          <div className="border-b border-line px-4 py-3">
            <p className="truncate text-sm font-bold text-ink">{user.name}</p>
            <p className="truncate text-xs text-ink-muted">{user.email}</p>
            <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand-ink">
              <ShieldCheck className="h-3 w-3" /> Coordinator
            </span>
          </div>
          <div className="py-1">
            <Link to="/profile" onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2 text-sm text-ink transition-colors hover:bg-brand-soft">
              <UserRound className="h-4 w-4 text-brand-ink" /> My Profile
            </Link>
            <Link to="/coordinator/settings" onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2 text-sm text-ink transition-colors hover:bg-brand-soft">
              <Settings className="h-4 w-4 text-brand-ink" /> Settings
            </Link>
            <button onClick={() => { setOpen(false); logout(); }}
              className="flex w-full items-center gap-3 px-4 py-2 text-sm text-ink-secondary transition-colors hover:bg-danger-soft hover:text-danger">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
