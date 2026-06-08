import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useUnreadCount } from '@/hooks/useNotifications';
import { MobileNav } from './MobileNav';
import {
  LayoutDashboard, Users, Sparkles, MessageSquareText, FolderOpen,
  FileBarChart, Search, Bell, Settings, HelpCircle, GraduationCap, LogOut, ClipboardCheck,
} from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

// Full Stitch "Supervisor" nav. Items without a dedicated page yet land on the
// dashboard, where their content (Pulse Check Board / AI Alerts) already lives.
const navItems: NavItem[] = [
  { label: 'Dashboard',       href: '/supervisor/dashboard', icon: LayoutDashboard },
  { label: 'Interns',         href: '/supervisor/dashboard', icon: Users },
  { label: 'Review Logbooks', href: '/supervisor/review',    icon: ClipboardCheck },
  { label: 'AI Insights',     href: '/ai-insights',          icon: Sparkles },
  { label: 'Feedback Center', href: '/feedback',            icon: MessageSquareText },
  { label: 'Resources',      href: '/supervisor/dashboard', icon: FolderOpen },
];

interface SupervisorShellProps {
  user: { name: string; email: string; initials: string };
  children: React.ReactNode;
}

export function SupervisorShell({ user, children }: SupervisorShellProps) {
  const { logout } = useAuth();
  const { data: unreadCount = 0 } = useUnreadCount();
  const { pathname } = useLocation();

  // Only one item highlights per route: "Dashboard" on the dashboard, the
  // matching item elsewhere — avoids the shared-href items all lighting up.
  const isActive = (item: NavItem) =>
    item.href === pathname &&
    (pathname !== '/supervisor/dashboard' || item.label === 'Dashboard');

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8f9ff] text-[#0b1c30]">
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-[#c7c5d4]/20 bg-[#eff4ff] shadow-lg shadow-indigo-500/5">
        {/* Brand */}
        <div className="px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#15157d]">
              <GraduationCap className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold leading-tight text-[#15157d]">AESIS</h2>
              <p className="text-[11px] font-semibold text-[#464652]">AI-Powered Mentorship</p>
            </div>
          </div>
        </div>

        {/* Nav */}
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
                    ? 'translate-x-1 bg-[#8a4cfc] font-semibold text-white shadow-sm shadow-[#8a4cfc]/30'
                    : 'text-[#464652] hover:bg-[#dce9ff] hover:text-[#15157d]',
                )}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                <span className="text-sm">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Generate Report + user */}
        <div className="px-4 pb-2">
          <Link
            to="/supervisor/review"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#15157d] py-3 text-sm font-semibold text-white shadow-md transition-colors hover:bg-[#2e3192]"
          >
            <FileBarChart className="h-4 w-4" />
            Generate Report
          </Link>
        </div>
        <div className="border-t border-[#c7c5d4]/30 p-3">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e1e0ff] text-xs font-semibold text-[#15157d]">
              {user.initials}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[#0b1c30]">{user.name}</p>
              <p className="truncate text-xs text-[#464652]">Academic Supervisor</p>
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
          {/* Mobile brand + search */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 md:hidden">
              <MobileNav
                items={navItems}
                isActive={isActive}
                user={user}
                roleLabel="Academic Supervisor"
                unreadCount={unreadCount}
                onLogout={logout}
                brandSubtitle="AI-Powered Mentorship"
              />
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#15157d]">
                <GraduationCap className="h-4 w-4 text-white" />
              </div>
              <span className="text-base font-bold text-[#15157d]">AESIS</span>
            </div>
            <div className="relative hidden md:block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#464652]" />
              <input
                type="text"
                placeholder="Search interns or metrics..."
                className="w-64 rounded-full border-none bg-[#eff4ff] py-2 pl-10 pr-4 text-sm text-[#0b1c30] placeholder:text-[#464652] focus:outline-none focus:ring-2 focus:ring-[#15157d]/40"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/supervisor/review"
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
            <button className="rounded-full p-2 text-[#464652] transition-colors hover:bg-[#dce9ff]" aria-label="Settings">
              <Settings className="h-5 w-5" />
            </button>
            <button className="hidden rounded-full p-2 text-[#464652] transition-colors hover:bg-[#dce9ff] sm:block" aria-label="Help">
              <HelpCircle className="h-5 w-5" />
            </button>
            <div className="mx-1 hidden h-8 w-px bg-[#c7c5d4]/40 sm:block" />
            <div className="flex items-center gap-3">
              <div className="hidden text-right lg:block">
                <p className="text-sm font-bold text-[#15157d]">{user.name}</p>
                <p className="text-xs text-[#464652]">Academic Supervisor</p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e1e0ff] text-xs font-semibold text-[#15157d]">
                {user.initials}
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
