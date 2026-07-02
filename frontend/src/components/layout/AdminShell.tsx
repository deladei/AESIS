import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { UserAvatar } from './UserAvatar';
import { useAuth } from '@/contexts/AuthContext';
import { useUnreadCount } from '@/hooks/useNotifications';
import { MobileNav } from './MobileNav';
import { ThemeToggle } from './ThemeToggle';
import NotificationBell from './NotificationBell';
import {
  LayoutDashboard, Users, Sparkles, MessageSquareText,
  FileBarChart, GraduationCap, LogOut,
  ClipboardCheck, UserRound, Send, Award,
} from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

// Stitch admin ("Supervisor Dashboard") nav — every item is a real page.
const navItems: NavItem[] = [
  { label: 'Dashboard',       href: '/admin/dashboard', icon: LayoutDashboard },
  { label: 'Interns',         href: '/admin/interns', icon: Users },
  { label: 'Review Logbooks', href: '/admin/review',    icon: ClipboardCheck },
  { label: 'Finalization',    href: '/admin/finalize',  icon: Award },
  { label: 'Messages',        href: '/admin/messages',  icon: Send },
  { label: 'AI Insights',     href: '/ai-insights', icon: Sparkles },
  { label: 'Feedback Center', href: '/feedback', icon: MessageSquareText },
  { label: 'My Profile',      href: '/profile',         icon: UserRound },
];

interface AdminShellProps {
  user: { name: string; email: string; initials: string; avatarUrl?: string | null };
  children: React.ReactNode;
}

export function AdminShell({ user, children }: AdminShellProps) {
  const { logout } = useAuth();
  const { data: unreadCount = 0 } = useUnreadCount();
  const { pathname } = useLocation();

  const isActive = (item: NavItem) =>
    item.href === pathname &&
    (pathname !== '/admin/dashboard' || item.label === 'Dashboard');

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--h-f8f9ff)] text-[var(--h-0b1c30)]">
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-[var(--h-c7c5d4-20)] bg-[var(--h-eff4ff)] shadow-lg shadow-indigo-500/5">
        <div className="px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--h-15157d)]">
              <GraduationCap className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold leading-tight text-[var(--h-15157d)]">AESIS</h2>
              <p className="text-[11px] font-semibold text-[var(--h-464652)]">AI-Powered Mentorship</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item);
            return (
              <Link
                key={item.label}
                to={item.href}
                className={cn(
                  'mx-2 my-1 flex items-center gap-3 rounded-lg px-4 py-2.5 transition-all duration-200',
                  active
                    ? 'translate-x-1 bg-[var(--h-8a4cfc)] font-semibold text-white shadow-sm shadow-[var(--h-8a4cfc-30)]'
                    : 'text-[var(--h-464652)] hover:bg-[var(--h-dce9ff)] hover:text-[var(--h-15157d)]',
                )}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                <span className="text-sm">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="px-4 pb-2">
          <Link
            to="/admin/report"
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--h-15157d)] py-3 text-sm font-semibold text-white shadow-md transition-colors hover:bg-[var(--h-2e3192)]"
          >
            <FileBarChart className="h-4 w-4" />
            Generate Report
          </Link>
        </div>
        <div className="border-t border-[var(--h-c7c5d4-30)] p-3">
          <div className="flex items-center gap-3 px-2 py-2">
            <UserAvatar avatarUrl={user.avatarUrl} initials={user.initials} name={user.name} shrink />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[var(--h-0b1c30)]">{user.name}</p>
              <p className="truncate text-xs text-[var(--h-464652)]">Administrator</p>
            </div>
          </div>
          <button
            onClick={() => logout()}
            className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--h-464652)] transition-colors hover:bg-[var(--h-ffdad6)] hover:text-[var(--h-ba1a1a)]"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-[var(--h-c7c5d4-30)] bg-[var(--h-f8f9ff-80)] px-6 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 md:hidden">
              <MobileNav
                items={navItems}
                isActive={isActive}
                user={user}
                roleLabel="Administrator"
                unreadCount={unreadCount}
                onLogout={logout}
                brandSubtitle="AI-Powered Mentorship"
              />
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--h-15157d)]">
                <GraduationCap className="h-4 w-4 text-white" />
              </div>
              <span className="text-base font-bold text-[var(--h-15157d)]">AESIS</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            {/* Live bell — same dropdown (mark-read, deep-links) the coordinator uses */}
            <NotificationBell />
            <div className="mx-1 hidden h-8 w-px bg-[var(--h-c7c5d4-40)] sm:block" />
            <div className="flex items-center gap-3">
              <div className="hidden text-right lg:block">
                <p className="text-sm font-bold text-[var(--h-15157d)]">{user.name}</p>
                <p className="text-xs text-[var(--h-464652)]">Administrator</p>
              </div>
              <UserAvatar avatarUrl={user.avatarUrl} initials={user.initials} name={user.name} />
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
