import {
  Award, Bell, Building2, ClipboardCheck, ClipboardList, GraduationCap,
  LayoutDashboard, MessageSquare, MessageSquareText, Settings, Sparkles,
  UserCheck, UserRound, Users, BookOpen, FileText,
} from 'lucide-react';

export type ShellRole = 'student' | 'academic_supervisor' | 'coordinator' | 'admin' | 'hod';

export interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  /** Hidden unless this feature flag resolves on. */
  flag?: 'aiInsights';
}

export interface RoleNav {
  /** Sits under "AESIS" in the sidebar header. */
  brandSubtitle: string;
  /** Shown under the user's name in the sidebar card and mobile drawer. */
  roleLabel: string;
  items: NavItem[];
  /** Whether this role can reach the message centre behind the topbar icon. */
  messagesHref?: string;
}

/**
 * One nav table for the whole app.
 *
 * These lists previously lived inside four separate shell components that
 * shared no base, so a change to the chrome had to be made four times and had
 * already drifted (three of the topbar widgets existed only for the
 * coordinator). Every href below is a route that actually exists in
 * router.tsx — the dead `AppShell` this replaces pointed at five that do not.
 */
export const ROLE_NAV: Record<ShellRole, RoleNav> = {
  student: {
    brandSubtitle: 'Internship System',
    roleLabel: 'Student',
    messagesHref: '/feedback',
    items: [
      { label: 'Dashboard',       href: '/student/dashboard',        icon: LayoutDashboard },
      { label: 'My Logbook',      href: '/student/logbook',          icon: BookOpen },
      { label: 'Submissions',     href: '/student/submissions',      icon: FileText },
      { label: 'Assessment',      href: '/student/final-assessment', icon: Award },
      { label: 'Feedback',        href: '/feedback',                 icon: MessageSquareText },
      { label: 'Notifications',   href: '/student/notifications',    icon: Bell },
      { label: 'AESIS Assistant', href: '/student/chatbot',          icon: MessageSquare },
      { label: 'My Profile',      href: '/profile',                  icon: UserRound },
    ],
  },

  academic_supervisor: {
    brandSubtitle: 'Supervision',
    roleLabel: 'Academic Supervisor',
    messagesHref: '/feedback',
    // Labels follow the reference design where a real route backs them. Items
    // it shows that have no page here (Calendar, Documents, standalone
    // Messages) are omitted rather than pointed at a 404 — that is exactly what
    // made the old AppShell dead weight.
    items: [
      { label: 'Supervisor Dashboard', href: '/supervisor/dashboard', icon: LayoutDashboard },
      { label: 'My Students',          href: '/supervisor/review',    icon: Users },
      { label: 'Student Progress',     href: '/ai-insights',          icon: Sparkles },
      { label: 'Assessments',          href: '/supervisor/finalize',  icon: Award },
      { label: 'Reviews & Feedback',   href: '/feedback',             icon: MessageSquareText },
      { label: 'My Profile',           href: '/profile',              icon: UserRound },
    ],
  },

  coordinator: {
    brandSubtitle: 'Cohort Oversight',
    roleLabel: 'Coordinator',
    items: [
      { label: 'Intern Overview', href: '/coordinator/dashboard',   icon: LayoutDashboard },
      { label: 'All Interns',     href: '/coordinator/interns',     icon: Users },
      { label: 'Placements',      href: '/coordinator/placements',  icon: ClipboardList },
      { label: 'Companies',       href: '/coordinator/companies',   icon: Building2 },
      { label: 'Assignments',     href: '/coordinator/assignments', icon: UserCheck },
      { label: 'AI Insights',     href: '/ai-insights',             icon: Sparkles, flag: 'aiInsights' },
      { label: 'Settings',        href: '/coordinator/settings',    icon: Settings },
    ],
  },

  admin: {
    brandSubtitle: 'Administration',
    roleLabel: 'Administrator',
    messagesHref: '/feedback',
    items: [
      { label: 'Dashboard',       href: '/admin/dashboard', icon: LayoutDashboard },
      { label: 'Interns',         href: '/admin/interns',   icon: Users },
      { label: 'Review Logbooks', href: '/admin/review',    icon: ClipboardCheck },
      { label: 'Finalization',    href: '/admin/finalize',  icon: Award },
      { label: 'AI Insights',     href: '/ai-insights',     icon: Sparkles },
      { label: 'Feedback Centre', href: '/feedback',        icon: MessageSquareText },
      { label: 'My Profile',      href: '/profile',         icon: UserRound },
    ],
  },

  /**
   * HoD is the coordinator, with a different title on the door.
   *
   * No route in the backend is hod-only: every appearance is
   * `authorize('coordinator', 'hod', ...)`, and `isStaff()` in grades,
   * industry, finalization and siwes treats the two identically. (The comment
   * in `middleware/authorize.ts` about hod-only grade-release sign-off
   * describes a route that does not exist.) So this shares the coordinator's
   * item list by reference rather than copying it — two lists that must stay in
   * step are two lists that will drift.
   *
   * It still needs its own entry at all because the role had NO shell and no
   * landing route, which meant an HoD login bounced straight back to the login
   * page.
   */
  hod: {
    brandSubtitle: 'Cohort Oversight',
    roleLabel: 'Head of Department',
    get items() { return ROLE_NAV.coordinator.items; },
  },
};

export const BRAND_ICON = GraduationCap;
