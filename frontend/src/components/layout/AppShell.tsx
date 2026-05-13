import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useUnreadCount } from '@/hooks/useNotifications';
import {
  LayoutDashboard, BookOpen, Bell, MessageSquare, FileText,
  Users, ClipboardCheck, AlertTriangle, Building2, BarChart3,
  Shield, ChevronLeft, ChevronRight, LogOut, Settings,
} from 'lucide-react';

type UserRole = 'student' | 'academic_supervisor' | 'coordinator' | 'admin';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: number;
}

const navByRole: Record<UserRole, NavItem[]> = {
  student: [
    { label: 'Dashboard',        href: '/student/dashboard',     icon: LayoutDashboard },
    { label: 'Logbook',          href: '/student/logbook',       icon: BookOpen },
    { label: 'Submissions',      href: '/student/submissions',   icon: FileText },
    { label: 'AESIS Assistant',  href: '/student/chatbot',       icon: MessageSquare },
    { label: 'Notifications',    href: '/student/notifications', icon: Bell },
  ],
  academic_supervisor: [
    { label: 'Dashboard',        href: '/supervisor/dashboard',  icon: LayoutDashboard },
    { label: 'My Students',      href: '/supervisor/students',   icon: Users },
    { label: 'Review Queue',     href: '/supervisor/review',     icon: ClipboardCheck },
    { label: 'Risk Alerts',      href: '/supervisor/alerts',     icon: AlertTriangle },
    { label: 'Notifications',    href: '/supervisor/notifications', icon: Bell },
  ],
  coordinator: [
    { label: 'Cohort Dashboard', href: '/coordinator/dashboard', icon: LayoutDashboard },
    { label: 'Risk Alerts',      href: '/coordinator/alerts',    icon: AlertTriangle },
    { label: 'Placements',       href: '/coordinator/placements',icon: FileText },
    { label: 'Companies',        href: '/coordinator/companies', icon: Building2 },
    { label: 'Reports',          href: '/coordinator/reports',   icon: BarChart3 },
  ],
  admin: [
    { label: 'Dashboard',        href: '/admin/dashboard',       icon: LayoutDashboard },
    { label: 'Users',            href: '/admin/users',           icon: Users },
    { label: 'Settings',         href: '/admin/settings',        icon: Settings },
    { label: 'Security',         href: '/admin/security',        icon: Shield },
  ],
};

interface AppShellProps {
  role: UserRole;
  user: { name: string; email: string; initials: string };
  notificationCount?: number;
  children: React.ReactNode;
}

export function AppShell({ role, user, children }: Omit<AppShellProps, 'notificationCount'>) {
  const { logout } = useAuth();
  const { data: unreadCount = 0 } = useUnreadCount();
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const navItems = navByRole[role];

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden">
      {/* Sidebar */}
      <aside
        className={cn(
          'flex flex-col bg-slate-900 border-r border-slate-800 transition-all duration-300 shrink-0',
          collapsed ? 'w-16' : 'w-60'
        )}
      >
        {/* Logo */}
        <div className={cn(
          'flex items-center h-16 px-4 border-b border-slate-800 shrink-0',
          collapsed ? 'justify-center' : 'gap-3'
        )}>
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-sm font-mono">A</span>
          </div>
          {!collapsed && (
            <div>
              <p className="text-white font-semibold text-sm tracking-wide">AESIS</p>
              <p className="text-slate-500 text-xs">CS Department</p>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto scrollbar-thin">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.href;
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors duration-150 cursor-pointer group',
                  active
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                )}
                title={collapsed ? item.label : undefined}
              >
                <Icon className="w-4.5 h-4.5 shrink-0 w-[18px] h-[18px]" />
                {!collapsed && (
                  <span className="text-sm font-medium truncate">{item.label}</span>
                )}
                {!collapsed && item.href.includes('notification') && unreadCount > 0 && (
                  <span className="ml-auto bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-mono shrink-0">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* User + Collapse */}
        <div className="border-t border-slate-800 p-3 space-y-2 shrink-0">
          {!collapsed && (
            <div className="flex items-center gap-3 px-2 py-2">
              <div className="w-8 h-8 rounded-full bg-blue-600/20 border border-blue-600/40 flex items-center justify-center shrink-0">
                <span className="text-blue-400 text-xs font-semibold font-mono">{user.initials}</span>
              </div>
              <div className="min-w-0">
                <p className="text-slate-200 text-sm font-medium truncate">{user.name}</p>
                <p className="text-slate-500 text-xs truncate">{user.email}</p>
              </div>
            </div>
          )}
          <div className="flex gap-1">
            <button
              onClick={() => logout()}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors duration-150 cursor-pointer text-xs"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
              {!collapsed && 'Sign out'}
            </button>
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="p-2 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors duration-150 cursor-pointer"
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto scrollbar-thin">
        {children}
      </main>
    </div>
  );
}
