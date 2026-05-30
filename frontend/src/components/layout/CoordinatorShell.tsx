import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useUnreadCount } from '@/hooks/useNotifications';
import { MobileNav } from './MobileNav';
import {
  LayoutDashboard, ClipboardList, UserCheck, Sparkles, Settings,
  Search, Bell, HelpCircle, GraduationCap, LogOut, Plus,
} from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

// Stitch "Nexus Oversight" nav. Items without a dedicated page yet land on the
// dashboard so the chrome stays consistent across coordinator views.
const navItems: NavItem[] = [
  { label: 'Intern Overview', href: '/coordinator/dashboard',   icon: LayoutDashboard },
  { label: 'Placements',      href: '/coordinator/placements',  icon: ClipboardList },
  { label: 'Assignments',     href: '/coordinator/assignments', icon: UserCheck },
  { label: 'AI Insights',     href: '/ai-insights',             icon: Sparkles },
  { label: 'Settings',        href: '/coordinator/dashboard',   icon: Settings },
];

interface CoordinatorShellProps {
  user: { name: string; email: string; initials: string };
  children: React.ReactNode;
}

export function CoordinatorShell({ user, children }: CoordinatorShellProps) {
  const { logout } = useAuth();
  const { data: unreadCount = 0 } = useUnreadCount();
  const { pathname } = useLocation();

  const isActive = (item: NavItem) =>
    item.href === pathname &&
    (pathname !== '/coordinator/dashboard' || item.label === 'Intern Overview');

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8f9ff] text-[#0b1c30]">
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-[#c4c5d5]/30 bg-[#f8f9ff]">
        {/* Brand */}
        <div className="px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#15157d]">
              <GraduationCap className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold leading-tight text-[#15157d]">AESIS</h2>
              <p className="text-[11px] font-semibold tracking-wide text-[#757684]">Nexus Oversight</p>
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
                    ? 'bg-[#645efb]/10 font-bold text-[#15157d]'
                    : 'text-[#444653] hover:bg-[#e5eeff] hover:text-[#15157d]',
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
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#15157d] py-3 text-sm font-semibold text-white shadow-md transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            New Placement
          </Link>
        </div>
        <div className="border-t border-[#c4c5d5]/30 p-3">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e1e0ff] text-xs font-semibold text-[#15157d]">
              {user.initials}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[#0b1c30]">{user.name}</p>
              <p className="truncate text-xs text-[#444653]">Coordinator</p>
            </div>
          </div>
          <button
            onClick={() => logout()}
            className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[#444653] transition-colors hover:bg-[#ffdad6] hover:text-[#ba1a1a]"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-[#c4c5d5]/30 bg-white px-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 md:hidden">
              <MobileNav
                items={navItems}
                isActive={isActive}
                user={user}
                roleLabel="Head Coordinator"
                unreadCount={unreadCount}
                onLogout={logout}
                brandSubtitle="Nexus Oversight"
              />
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#15157d]">
                <GraduationCap className="h-4 w-4 text-white" />
              </div>
              <span className="text-base font-bold text-[#15157d]">AESIS</span>
            </div>
            <div className="relative hidden md:block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#757684]" />
              <input
                type="text"
                placeholder="Search interns, projects, or companies..."
                className="w-[360px] rounded-lg border-none bg-[#eff4ff] py-2 pl-10 pr-4 text-sm text-[#0b1c30] placeholder:text-[#757684] focus:outline-none focus:ring-2 focus:ring-[#15157d]/30"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button className="relative rounded-full p-2 text-[#444653] transition-colors hover:bg-[#e5eeff]" aria-label="Notifications">
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#ba1a1a] px-1 text-[10px] font-bold text-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            <button className="hidden rounded-full p-2 text-[#444653] transition-colors hover:bg-[#e5eeff] sm:block" aria-label="Help">
              <HelpCircle className="h-5 w-5" />
            </button>
            <div className="mx-1 hidden h-8 w-px bg-[#c4c5d5]/40 sm:block" />
            <div className="flex items-center gap-3">
              <div className="hidden text-right lg:block">
                <p className="text-sm font-bold text-[#15157d]">{user.name}</p>
                <p className="text-xs text-[#757684]">Head Coordinator</p>
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
