import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LogOut, Mail, PanelLeftClose, PanelLeftOpen, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useUnreadCount } from '@/hooks/useNotifications';
import { useCoordinatorFeatureFlags } from '@/hooks/useDashboard';
import { useStudentDashboard } from '@/hooks/useStudentDashboard';
import { UserAvatar } from './UserAvatar';
import { MobileNav } from './MobileNav';
import { ThemeToggle } from './ThemeToggle';
import NotificationBell from './NotificationBell';
import GlobalSearch from './GlobalSearch';
import QuickActionsMenu from './QuickActionsMenu';
import AccountMenu from './AccountMenu';
import { BRAND_ICON, ROLE_NAV, type NavItem, type ShellRole } from './roleNav';

interface RoleShellProps {
  role: ShellRole;
  user: { name: string; email: string; initials: string; avatarUrl?: string | null };
  children: React.ReactNode;
  /**
   * Role-specific control for the top bar — the coordinator's cohort picker,
   * for instance. Left empty rather than filled with a decorative academic-year
   * dropdown: a control that cannot change anything is worse than no control.
   */
  topbarSlot?: React.ReactNode;
}

/**
 * The application shell: dark rail, top bar, content column.
 *
 * This replaces four separate shells (student, supervisor, coordinator, admin)
 * that shared no base. Three of them were near-copies; the student's was a
 * horizontal top-nav with no sidebar at all, so the app looked like two
 * different products depending on who logged in. `GlobalSearch`, the account
 * menu and the theme toggle existed only in the coordinator's copy — every role
 * gets them now.
 */
const SIDEBAR_KEY = 'aesis-sidebar-collapsed';

/** Remembered per browser, like the theme — the only other UI preference the
 *  app persists. A failed read (private mode) just means expanded. */
function useCollapsedSidebar() {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(SIDEBAR_KEY) === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0'); } catch { /* ignore */ }
  }, [collapsed]);
  return [collapsed, setCollapsed] as const;
}

export function RoleShell({ role, user, children, topbarSlot }: RoleShellProps) {
  const [collapsed, setCollapsed] = useCollapsedSidebar();
  const { logout } = useAuth();
  const { pathname } = useLocation();
  const { data: unreadCount = 0 } = useUnreadCount();
  // Coordinator-only endpoint: asking as a student or supervisor 403s on
  // every page load. The flags only gate coordinator nav items anyway.
  const canReadFlags = role === 'coordinator' || role === 'admin';
  const { data: flags } = useCoordinatorFeatureFlags(canReadFlags);
  // The sidebar's profile-completion meter. Same cached query the student
  // dashboard uses, so this costs no extra request.
  const { data: studentStats } = useStudentDashboard(role === 'student');

  const nav = ROLE_NAV[role];
  const visibleNav = nav.items.filter((i) => !i.flag || flags?.[i.flag]);

  /**
   * The mockups put a search box in every role's top bar, but the only search
   * endpoint that exists is `/coordinator/search`, which is coordinator-scoped.
   * Rendering the box for a student would fire a 403 on every keystroke, so it
   * appears only for the roles it actually serves. A student- and
   * supervisor-scoped search is a backend task, not a frontend one.
   */
  const canSearch = role === 'coordinator' || role === 'hod' || role === 'admin';
  const canQuickAct = role === 'coordinator' || role === 'hod';

  // The dashboard is the only place that carries the student's academic
  // identity, so it's null for every other role and while the query is loading.
  const studentProgramme =
    studentStats?.profile.programme ?? studentStats?.profile.department ?? null;

  const userCard = (
    <div className="m-3 rounded-card bg-sidebar-hover p-3">
      <div className="flex items-center gap-3">
        <UserAvatar avatarUrl={user.avatarUrl} initials={user.initials} name={user.name} />
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-semibold text-white">{user.name}</span>
          <span className="block truncate text-[11px] text-sidebar-ink">
            {nav.roleLabel}
            {studentStats?.profile.academicLevel ? ` · Level ${studentStats.profile.academicLevel}` : ''}
          </span>
          {/* Programme where the student has one, department otherwise — the
              department is always set, so this line is never empty for a
              student. Its own line so it can't crowd out the role above it. */}
          {studentProgramme && (
            <span className="block truncate text-[11px] text-sidebar-ink">{studentProgramme}</span>
          )}
          <span className="mt-0.5 flex items-center gap-1 text-[11px] text-ok">
            <span className="h-1.5 w-1.5 rounded-full bg-ok" /> Online
          </span>
        </span>
      </div>

      {role === 'student' && studentStats && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-sidebar-ink">Profile completion</span>
            <span className="font-semibold text-white">{studentStats.profile.completionPct}%</span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-ok transition-[width] duration-500"
              style={{ width: `${studentStats.profile.completionPct}%` }}
            />
          </div>
          {studentStats.profile.completionPct < 100 && (
            <Link to="/profile" className="mt-2 block text-[11px] font-semibold text-brand-ink hover:underline">
              Complete your profile →
            </Link>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={logout}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-sidebar-ink transition-colors hover:bg-white/5 hover:text-white"
      >
        <LogOut className="h-3.5 w-3.5" />
        Sign out
      </button>
    </div>
  );

  // The assistant card the supervisor and coordinator rails carry at the foot.
  const assistantCard = (
    <Link
      to={role === 'student' ? '/student/chatbot' : '/ai-insights'}
      className="m-3 block rounded-card bg-brand p-3 transition-opacity hover:opacity-90"
    >
      <span className="flex items-center gap-2 text-sm font-semibold text-white">
        <Sparkles className="h-4 w-4" /> Insights
      </span>
      <span className="mt-1 block text-[11px] leading-snug text-white/80">
        Cohort signals derived from submission behaviour — advisory, never a prediction.
      </span>
    </Link>
  );

  // Exact match only. Several roles share hrefs (/feedback, /ai-insights, and
  // /profile), so a prefix test would light up two rows at once.
  const isActive = (item: NavItem) => item.href === pathname;

  return (
    <div className="flex h-screen overflow-hidden bg-app text-ink">
      <aside
        className={cn(
          'hidden shrink-0 flex-col bg-sidebar transition-[width] duration-200 md:flex',
          collapsed ? 'w-[4.5rem]' : 'w-64',
        )}
      >
        {/* Brand, with the collapse control beside it.
            The toggle used to sit at the foot of the rail, below the Insights
            card, where it competed with the nav for the eye and moved whenever
            the content above it changed height. Up here it is structural
            furniture next to the mark, always in the same place whether the
            rail is open or shut, and the foot is left to identity and
            Insights. Collapsed, the row stacks so the control stays visible
            rather than hiding behind a hover — a hover-only expand is
            unreachable on touch. */}
        <div className={cn('flex py-5', collapsed ? 'flex-col items-center gap-3 px-3' : 'items-center gap-3 px-5')}>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand">
            <BRAND_ICON className="h-5 w-5 text-white" />
          </span>
          {!collapsed && (
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block text-sm font-bold text-white">AESIS</span>
              <span className="block truncate text-[11px] text-sidebar-ink">{nav.brandSubtitle}</span>
            </span>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand the sidebar' : 'Collapse the sidebar'}
            title={collapsed ? 'Expand the sidebar' : 'Collapse the sidebar'}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sidebar-ink transition-colors hover:bg-sidebar-hover hover:text-white"
          >
            {collapsed
              ? <PanelLeftOpen className="h-[18px] w-[18px]" />
              : <PanelLeftClose className="h-[18px] w-[18px]" />}
          </button>
        </div>

        {/* Nav. `scrollbar-none` because this column is barely taller than its
            content: the bar appeared and vanished as items were flagged in and
            out, right beside the active pill. */}
        <nav className="scrollbar-none flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {visibleNav.map((item) => {
            const active = isActive(item);
            const showBadge = item.href.includes('notifications') && unreadCount > 0;

            return (
              <Link
                key={item.href}
                to={item.href}
                aria-current={active ? 'page' : undefined}
                // Collapsed, the label is gone, so the icon carries the name —
                // `title` gives it back on hover and `aria-label` to a reader.
                title={collapsed ? item.label : undefined}
                aria-label={collapsed ? item.label : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-xl py-2.5 text-sm font-medium transition-colors',
                  collapsed ? 'justify-center px-2' : 'px-3',
                  active
                    ? 'bg-brand text-white shadow-card'
                    : 'text-sidebar-ink hover:bg-sidebar-hover hover:text-white',
                )}
              >
                <span className="relative shrink-0">
                  <item.icon className="h-[18px] w-[18px]" />
                  {collapsed && showBadge && (
                    <span className="absolute -right-1.5 -top-1.5 h-2 w-2 rounded-full bg-danger" />
                  )}
                </span>
                {!collapsed && <span className="truncate">{item.label}</span>}
                {!collapsed && showBadge && (
                  <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1.5 text-[11px] font-bold text-white">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Insights first, then who you are signed in as. Identity sits at the
            very foot for every role now; it used to sit at the top for the
            supervisor alone, which meant the rail rearranged itself depending
            on who logged in. Sign out belongs with the name it signs out. */}
        {!collapsed && role !== 'student' && assistantCard}
        {!collapsed && userCard}
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-line bg-surface px-4 sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex items-center gap-2 md:hidden">
              <MobileNav
                items={visibleNav}
                isActive={isActive}
                user={user}
                roleLabel={nav.roleLabel}
                brandSubtitle={nav.brandSubtitle}
                unreadCount={unreadCount}
                onLogout={logout}
              />
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand">
                <BRAND_ICON className="h-4 w-4 text-white" />
              </span>
            </div>
            {canSearch && <GlobalSearch />}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {topbarSlot}
            {canQuickAct && <QuickActionsMenu />}
            {nav.messagesHref && (
              <Link
                to={nav.messagesHref}
                aria-label="Messages"
                className="grid h-9 w-9 place-items-center rounded-lg text-ink-secondary transition-colors hover:bg-surface-sunken"
              >
                <Mail className="h-[18px] w-[18px]" />
              </Link>
            )}
            <ThemeToggle />
            <NotificationBell />
            <div className="mx-1 hidden h-8 w-px bg-line sm:block" />
            <AccountMenu user={user} />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
