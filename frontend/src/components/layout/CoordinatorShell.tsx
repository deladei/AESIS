import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { UserAvatar } from './UserAvatar';
import { useAuth } from '@/contexts/AuthContext';
import { useUnreadCount } from '@/hooks/useNotifications';
import { useCoordinatorFeatureFlags } from '@/hooks/useDashboard';
import { MobileNav } from './MobileNav';
import GlobalSearch from './GlobalSearch';
import { ThemeToggle } from './ThemeToggle';
import NotificationBell from './NotificationBell';
import QuickActionsMenu from './QuickActionsMenu';
import AccountMenu from './AccountMenu';
import {
  LayoutDashboard, ClipboardList, UserCheck, Sparkles, Settings, Users,
  GraduationCap, LogOut, Plus, ShieldAlert, Building2,
} from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  /** Hidden unless this feature flag is on (item 24). */
  flag?: 'aiInsights';
}

// Stitch "Nexus Oversight" nav. "Intern Overview" is the dashboard (metrics +
// status monitor); "Oversight" is the distinct cross-cohort at-risk monitoring
// surface. AI Insights is gated behind a feature flag.
const navItems: NavItem[] = [
  { label: 'Intern Overview', href: '/coordinator/dashboard',   icon: LayoutDashboard },
  { label: 'All Interns',     href: '/coordinator/interns',     icon: Users },
  { label: 'Oversight',       href: '/coordinator/oversight',   icon: ShieldAlert },
  { label: 'Placements',      href: '/coordinator/placements',  icon: ClipboardList },
  { label: 'Companies',       href: '/coordinator/companies',   icon: Building2 },
  { label: 'Assignments',     href: '/coordinator/assignments', icon: UserCheck },
  { label: 'AI Insights',     href: '/ai-insights',             icon: Sparkles, flag: 'aiInsights' },
  { label: 'Settings',        href: '/coordinator/settings',    icon: Settings },
];

interface CoordinatorShellProps {
  user: { name: string; email: string; initials: string; avatarUrl?: string | null };
  children: React.ReactNode;
}

export function CoordinatorShell({ user, children }: CoordinatorShellProps) {
  const { logout } = useAuth();
  const { data: unreadCount = 0 } = useUnreadCount();
  const { data: flags } = useCoordinatorFeatureFlags();
  const { pathname } = useLocation();

  // Hide flag-gated nav items until their flag resolves on (item 24).
  const visibleNav = navItems.filter((i) => !i.flag || flags?.[i.flag]);

  const isActive = (item: NavItem) =>
    item.href === pathname &&
    (pathname !== '/coordinator/dashboard' || item.label === 'Intern Overview');

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--h-f8f9ff)] text-[var(--h-0b1c30)]">
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-[var(--h-c4c5d5-30)] bg-[var(--h-f8f9ff)]">
        {/* Brand */}
        <div className="px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--h-15157d)]">
              <GraduationCap className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold leading-tight text-[var(--h-15157d)]">AESIS</h2>
              <p className="text-[11px] font-semibold tracking-wide text-[var(--h-757684)]">Nexus Oversight</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const active = isActive(item);
            return (
              <Link
                key={item.label}
                to={item.href}
                className={cn(
                  'mx-2 my-1 flex items-center gap-3 rounded-lg px-4 py-2.5 transition-all duration-200',
                  active
                    ? 'bg-[var(--h-645efb-10)] font-bold text-[var(--h-15157d)]'
                    : 'text-[var(--h-444653)] hover:bg-[var(--h-e5eeff)] hover:text-[var(--h-15157d)]',
                )}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                <span className="text-sm">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* New placement + user */}
        <div className="px-4 pb-2">
          <Link
            to="/coordinator/placements"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--h-15157d)] py-3 text-sm font-semibold text-white shadow-md transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            New Placement
          </Link>
        </div>
        <div className="border-t border-[var(--h-c4c5d5-30)] p-3">
          <div className="flex items-center gap-3 px-2 py-2">
            <UserAvatar avatarUrl={user.avatarUrl} initials={user.initials} name={user.name} shrink />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[var(--h-0b1c30)]">{user.name}</p>
              <p className="truncate text-xs text-[var(--h-444653)]">Coordinator</p>
            </div>
          </div>
          <button
            onClick={() => logout()}
            className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--h-444653)] transition-colors hover:bg-[var(--h-ffdad6)] hover:text-[var(--h-ba1a1a)]"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-[var(--h-c4c5d5-30)] bg-[var(--h-ffffff)] px-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 md:hidden">
              <MobileNav
                items={visibleNav}
                isActive={isActive}
                user={user}
                roleLabel="Head Coordinator"
                unreadCount={unreadCount}
                onLogout={logout}
                brandSubtitle="Nexus Oversight"
              />
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--h-15157d)]">
                <GraduationCap className="h-4 w-4 text-white" />
              </div>
              <span className="text-base font-bold text-[var(--h-15157d)]">AESIS</span>
            </div>
            <GlobalSearch />
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <NotificationBell />
            <QuickActionsMenu />
            <div className="mx-1 hidden h-8 w-px bg-[var(--h-c4c5d5-40)] sm:block" />
            <AccountMenu user={user} />
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
