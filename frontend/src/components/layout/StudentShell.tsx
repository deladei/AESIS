import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useUnreadCount } from '@/hooks/useNotifications';
import { MobileNav } from './MobileNav';
import {
  LayoutDashboard, BookOpen, FileText, MessageSquare, MessageSquareText, Bell, LogOut, Sparkles, Award,
} from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

const navItems: NavItem[] = [
  { label: 'Dashboard',       href: '/student/dashboard',     icon: LayoutDashboard },
  { label: 'Logbook',         href: '/student/logbook',       icon: BookOpen },
  { label: 'Submissions',     href: '/student/submissions',   icon: FileText },
  { label: 'AESIS Assistant', href: '/student/chatbot',       icon: MessageSquare },
  { label: 'Feedback Center', href: '/feedback',              icon: MessageSquareText },
  { label: 'Final Assessment', href: '/student/final-assessment', icon: Award },
  { label: 'Notifications',   href: '/student/notifications', icon: Bell },
];

interface StudentShellProps {
  user: { name: string; email: string; initials: string };
  children: React.ReactNode;
}

export function StudentShell({ user, children }: StudentShellProps) {
  const { logout } = useAuth();
  const { data: unreadCount = 0 } = useUnreadCount();
  const location = useLocation();

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8f9ff] text-[#0b1c30]">
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-[#c7c5d4]/30 bg-[#eff4ff] shadow-lg shadow-indigo-500/5">
        {/* Brand */}
        <div className="px-6 py-6">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#15157d]">
              <span className="font-bold text-sm text-white">A</span>
            </div>
            <div>
              <h2 className="text-lg font-bold leading-tight text-[#15157d]">AESIS</h2>
              <p className="text-[11px] font-medium text-[#464652]">AI-Powered Supervision</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.href;
            const showBadge = item.href.includes('notifications') && unreadCount > 0;
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  'mx-2 my-1 flex items-center gap-3 rounded-lg px-4 py-2.5 transition-all duration-200',
                  active
                    ? 'translate-x-1 bg-[#8a4cfc] font-semibold text-white shadow-sm shadow-[#8a4cfc]/30'
                    : 'text-[#464652] hover:bg-[#dce9ff] hover:text-[#15157d]',
                )}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                <span className="text-sm">{item.label}</span>
                {showBadge && (
                  <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-[#15157d] px-1.5 text-[11px] font-semibold text-white">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* User + Sign out */}
        <div className="border-t border-[#c7c5d4]/30 p-3">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e1e0ff] text-xs font-semibold text-[#15157d]">
              {user.initials}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[#0b1c30]">{user.name}</p>
              <p className="truncate text-xs text-[#464652]">{user.email}</p>
            </div>
          </div>
          <button
            onClick={() => logout()}
            className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[#464652] transition-colors hover:bg-[#ffdad6] hover:text-[#ba1a1a]"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-[#c7c5d4]/30 bg-[#f8f9ff]/80 px-6 backdrop-blur-md">
          {/* Mobile: menu + brand */}
          <div className="flex items-center gap-2 md:hidden">
            <MobileNav
              items={navItems}
              isActive={(item) => location.pathname === item.href}
              user={user}
              unreadCount={unreadCount}
              onLogout={logout}
              brandSubtitle="AI-Powered Supervision"
            />
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#15157d]">
              <span className="font-bold text-sm text-white">A</span>
            </div>
            <span className="text-base font-bold text-[#15157d]">AESIS</span>
          </div>

          <div className="hidden items-center gap-2 rounded-full bg-[#e1e0ff]/60 px-3 py-1.5 md:flex">
            <Sparkles className="h-3.5 w-3.5 text-[#712ae2]" />
            <span className="text-xs font-semibold text-[#15157d]">AESIS AI</span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/student/notifications"
              className="relative rounded-full p-2 text-[#464652] transition-colors hover:bg-[#dce9ff]"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#ba1a1a] px-1 text-[10px] font-bold text-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Link>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#e1e0ff] text-xs font-semibold text-[#15157d]">
              {user.initials}
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
