import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { UserAvatar } from './UserAvatar';
import { useAuth } from '@/contexts/AuthContext';
import { useUnreadCount } from '@/hooks/useNotifications';
import { useClickOutside } from '@/hooks/useClickOutside';
import { MobileNav } from './MobileNav';
import { ThemeToggle } from './ThemeToggle';
import NotificationBell from './NotificationBell';
import {
  LayoutDashboard, BookOpen, CalendarDays, FileText, MessageSquare, MessageSquareText, Bell,
  LogOut, Award, UserRound, GraduationCap,
} from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

const navItems: NavItem[] = [
  { label: 'Dashboard',       href: '/student/dashboard',     icon: LayoutDashboard },
  { label: 'Logbook',         href: '/student/logbook',       icon: BookOpen },
  { label: 'Daily logbook',   href: '/student/daily-logbook', icon: CalendarDays },
  { label: 'Submissions',     href: '/student/submissions',   icon: FileText },
  { label: 'AESIS Assistant', href: '/student/chatbot',       icon: MessageSquare },
  { label: 'Feedback',        href: '/feedback',              icon: MessageSquareText },
  { label: 'Assessment',      href: '/student/final-assessment', icon: Award },
];

interface StudentShellProps {
  user: { name: string; email: string; initials: string; avatarUrl?: string | null };
  children: React.ReactNode;
}

function AccountDropdown({ user }: { user: StudentShellProps['user'] }) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));
  const { logout } = useAuth();

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full p-1 transition-colors hover:bg-[var(--h-dce9ff)]"
        aria-label="Account menu" aria-haspopup="true" aria-expanded={open}
      >
        <span className="hidden text-right lg:block">
          <span className="block text-sm font-bold text-[var(--h-15157d)]">{user.name}</span>
          <span className="block text-xs text-[var(--h-757684)]">Student</span>
        </span>
        <UserAvatar avatarUrl={user.avatarUrl} initials={user.initials} name={user.name} />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-[var(--h-c4c5d5-60)] bg-[var(--h-ffffff)] shadow-xl">
          <div className="border-b border-[var(--h-c4c5d5-40)] px-4 py-3">
            <p className="truncate text-sm font-bold text-[var(--h-0b1c30)]">{user.name}</p>
            <p className="truncate text-xs text-[var(--h-757684)]">{user.email}</p>
            <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-[var(--h-eff4ff)] px-2 py-0.5 text-[11px] font-semibold text-[var(--h-15157d)]">
              <GraduationCap className="h-3 w-3" /> Student
            </span>
          </div>
          <div className="py-1">
            <Link to="/profile" onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2 text-sm text-[var(--h-0b1c30)] transition-colors hover:bg-[var(--h-eff4ff)]">
              <UserRound className="h-4 w-4 text-[var(--h-15157d)]" /> My Profile
            </Link>
            <button onClick={() => { setOpen(false); logout(); }}
              className="flex w-full items-center gap-3 px-4 py-2 text-sm text-[var(--h-444653)] transition-colors hover:bg-[var(--h-ffdad6)] hover:text-[var(--h-ba1a1a)]">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function StudentShell({ user, children }: StudentShellProps) {
  const { logout } = useAuth();
  const { data: unreadCount = 0 } = useUnreadCount();
  const location = useLocation();

  // Mobile nav reuses the full item set (incl. Notifications + Profile).
  const mobileItems: NavItem[] = [
    ...navItems,
    { label: 'Notifications', href: '/student/notifications', icon: Bell },
    { label: 'My Profile',    href: '/profile',               icon: UserRound },
  ];

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--h-f8f9ff)] text-[var(--h-0b1c30)]">
      {/* Top navigation */}
      <header className="sticky top-0 z-30 shrink-0 border-b border-[var(--h-c7c5d4-30)] bg-[var(--h-f8f9ff-80)] backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          {/* Left: mobile menu + brand */}
          <div className="flex items-center gap-3">
            <div className="md:hidden">
              <MobileNav
                items={mobileItems}
                isActive={(item) => location.pathname === item.href}
                user={user}
                unreadCount={unreadCount}
                onLogout={logout}
                brandSubtitle="AI-Powered Supervision"
              />
            </div>
            <Link to="/student/dashboard" className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--h-15157d)]">
                <span className="text-sm font-bold text-white">A</span>
              </div>
              <span className="text-lg font-bold text-[var(--h-15157d)]">AESIS</span>
            </Link>
          </div>

          {/* Center: horizontal nav (desktop) */}
          <nav className="hidden flex-1 items-center justify-center gap-1 md:flex">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = location.pathname === item.href;
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                    active
                      ? 'bg-[var(--h-8a4cfc)] font-semibold text-white'
                      : 'text-[var(--h-464652)] hover:bg-[var(--h-dce9ff)] hover:text-[var(--h-15157d)]',
                  )}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" />
                  <span className="hidden lg:inline">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Right: theme + notifications + account */}
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <NotificationBell />
            <div className="mx-1 hidden h-8 w-px bg-[var(--h-c7c5d4-40)] sm:block" />
            <AccountDropdown user={user} />
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
