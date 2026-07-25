import { Navigate, createBrowserRouter, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { RouteErrorBoundary } from '@/components/shared/RouteErrorBoundary';
import { AppShell } from '@/components/layout/AppShell';
import { StudentShell } from '@/components/layout/StudentShell';
import { SupervisorShell } from '@/components/layout/SupervisorShell';
import { CoordinatorShell } from '@/components/layout/CoordinatorShell';
import { AdminShell } from '@/components/layout/AdminShell';

import LoginPage         from '@/pages/auth/LoginPage';
import RegisterPage      from '@/pages/auth/RegisterPage';
import VerifyEmailPage   from '@/pages/auth/VerifyEmailPage';
import ResetPasswordPage from '@/pages/auth/ResetPasswordPage';
import ResetPasswordConfirmPage from '@/pages/auth/ResetPasswordConfirmPage';
import StudentDashboard  from '@/pages/student/StudentDashboard';
import LogbookEditor     from '@/pages/student/LogbookEditor';
import DailyLogbook      from '@/pages/student/DailyLogbook';
import SubmissionHistory from '@/pages/student/SubmissionHistory';
import NotificationInbox from '@/pages/student/NotificationInbox';
import ChatbotPanel      from '@/pages/student/ChatbotPanel';
import FinalAssessment   from '@/pages/student/FinalAssessment';
import SupervisorDashboard from '@/pages/supervisor/SupervisorDashboard';
import EntryReview         from '@/pages/supervisor/EntryReview';
import PlacementFinalization from '@/pages/supervisor/PlacementFinalization';
import CoordinatorDashboard from '@/pages/coordinator/CoordinatorDashboard';
import InternsList          from '@/pages/coordinator/InternsList';
import InternDetail         from '@/pages/coordinator/InternDetail';
import PlacementApproval    from '@/pages/coordinator/PlacementApproval';
import SupervisorAssignment from '@/pages/coordinator/SupervisorAssignment';
import CohortSettings       from '@/pages/coordinator/CohortSettings';
import CohortReport         from '@/pages/coordinator/CohortReport';
import AdminReport          from '@/pages/admin/AdminReport';
import CompaniesList        from '@/pages/coordinator/CompaniesList';
import CompanyDetail        from '@/pages/coordinator/CompanyDetail';
import AdminDashboard       from '@/pages/admin/AdminDashboard';
import AdminInterns         from '@/pages/admin/AdminInterns';
import FeedbackCenter       from '@/pages/shared/FeedbackCenter';
import AIInsights           from '@/pages/shared/AIInsights';
import ProfilePage          from '@/pages/shared/ProfilePage';
import Attestation          from '@/pages/public/Attestation';
import IndustryScore        from '@/pages/public/IndustryScore';
import WeeklyComment        from '@/pages/public/WeeklyComment';

type UserRole = 'student' | 'academic_supervisor' | 'coordinator' | 'admin';

function RequireAuth({ roles, bare }: { roles?: UserRole[]; bare?: boolean }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();
  if (isLoading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (!isAuthenticated || !user) return <Navigate to="/auth/login" replace />;
  if (roles && !roles.includes(user.role as UserRole)) return <Navigate to="/" replace />;

  const initials = `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
  const shellUser = { name: `${user.firstName} ${user.lastName}`, email: user.email, initials, avatarUrl: user.avatarUrl ?? null };

  // Page content is wrapped in an error boundary so a crashing page renders a
  // contained fallback inside the shell rather than unmounting the whole app.
  // Keyed on pathname so navigating away auto-clears a previous page's error.
  const content = (
    <RouteErrorBoundary resetKey={location.pathname}>
      <Outlet />
    </RouteErrorBoundary>
  );

  // Bare mode: authed but no role shell (e.g. the printable cohort report).
  if (bare) return content;

  if (user.role === 'student') {
    return <StudentShell user={shellUser}>{content}</StudentShell>;
  }

  if (user.role === 'academic_supervisor') {
    return <SupervisorShell user={shellUser}>{content}</SupervisorShell>;
  }

  if (user.role === 'coordinator') {
    return <CoordinatorShell user={shellUser}>{content}</CoordinatorShell>;
  }

  if (user.role === 'admin') {
    return <AdminShell user={shellUser}>{content}</AdminShell>;
  }

  return (
    <AppShell role={user.role as UserRole} user={shellUser}>
      {content}
    </AppShell>
  );
}

function RootRedirect() {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user) return <Navigate to="/auth/login" replace />;
  const redirects: Record<string, string> = {
    student:             '/student/dashboard',
    academic_supervisor: '/supervisor/dashboard',
    coordinator:         '/coordinator/dashboard',
    admin:               '/admin/dashboard',
  };
  return <Navigate to={redirects[user.role] ?? '/auth/login'} replace />;
}

export const router = createBrowserRouter([
  { path: '/',               element: <RootRedirect /> },
  { path: '/auth/login',     element: <LoginPage /> },
  { path: '/auth/register',  element: <RegisterPage /> },
  // Email-link landing pages (public — reached from verification/reset emails)
  { path: '/auth/verify-email',           element: <VerifyEmailPage /> },
  { path: '/auth/reset-password',         element: <ResetPasswordPage /> },
  { path: '/auth/reset-password/confirm', element: <ResetPasswordConfirmPage /> },

  // Public company attestation (magic link — no account, no shell)
  { path: '/attest/:token',  element: <Attestation /> },
  // Public company-supervisor industry score (magic link — no account, no shell)
  { path: '/grade/:token',   element: <IndustryScore /> },
  // Public industry-supervisor weekly logbook comment (magic link — no account, no shell)
  { path: '/weekly-comment/:token', element: <WeeklyComment /> },

  // Student
  {
    element: <RequireAuth roles={['student']} />,
    children: [
      { path: '/student/dashboard',     element: <StudentDashboard /> },
      { path: '/student/logbook',       element: <LogbookEditor /> },
      { path: '/student/daily-logbook', element: <DailyLogbook /> },
      { path: '/student/submissions',   element: <SubmissionHistory /> },
      { path: '/student/notifications', element: <NotificationInbox /> },
      { path: '/student/chatbot',       element: <ChatbotPanel /> },
      { path: '/student/final-assessment', element: <FinalAssessment /> },
    ],
  },

  // Supervisor
  {
    element: <RequireAuth roles={['academic_supervisor', 'admin']} />,
    children: [
      { path: '/supervisor/dashboard', element: <SupervisorDashboard /> },
      { path: '/supervisor/review',    element: <EntryReview /> },
      { path: '/supervisor/finalize',  element: <PlacementFinalization /> },
    ],
  },

  // Coordinator
  {
    element: <RequireAuth roles={['coordinator', 'admin']} />,
    children: [
      { path: '/coordinator/dashboard',  element: <CoordinatorDashboard /> },
      { path: '/coordinator/interns',    element: <InternsList /> },
      { path: '/coordinator/interns/:placementId', element: <InternDetail /> },
      { path: '/coordinator/companies', element: <CompaniesList /> },
      { path: '/coordinator/companies/:id', element: <CompanyDetail /> },
      { path: '/coordinator/placements', element: <PlacementApproval /> },
      { path: '/coordinator/assignments', element: <SupervisorAssignment /> },
      // Oversight merged into All Interns (kept as a redirect for old links).
      { path: '/coordinator/oversight',  element: <Navigate to="/coordinator/interns?view=oversight" replace /> },
      { path: '/coordinator/settings',   element: <CohortSettings /> },
    ],
  },

  // Coordinator printable cohort report (PDF export, item 16) — authed but
  // shell-less so the browser print/Save-as-PDF captures only the report.
  {
    element: <RequireAuth roles={['coordinator', 'admin']} bare />,
    children: [
      { path: '/coordinator/report', element: <CohortReport /> },
    ],
  },

  // Admin printable system report — shell-less for clean print/Save-as-PDF.
  {
    element: <RequireAuth roles={['admin']} bare />,
    children: [
      { path: '/admin/report', element: <AdminReport /> },
    ],
  },

  // Admin
  {
    element: <RequireAuth roles={['admin']} />,
    children: [
      { path: '/admin/dashboard', element: <AdminDashboard /> },
      { path: '/admin/interns',   element: <AdminInterns /> },
      // Messaging + call scheduling folded into the Feedback Center
      { path: '/admin/messages',  element: <Navigate to="/feedback" replace /> },
      { path: '/admin/review',    element: <EntryReview /> },
      { path: '/admin/finalize',  element: <PlacementFinalization /> },
    ],
  },

  // Feedback Center — shared screen, rendered inside each role's own shell
  {
    element: <RequireAuth roles={['student', 'academic_supervisor', 'admin']} />,
    children: [
      { path: '/feedback', element: <FeedbackCenter /> },
    ],
  },

  // AI Insights & Analytics — shared screen, rendered inside each role's own shell
  {
    element: <RequireAuth roles={['academic_supervisor', 'coordinator', 'admin']} />,
    children: [
      { path: '/ai-insights', element: <AIInsights /> },
    ],
  },

  // Profile — shared screen for every authenticated role, in their own shell
  {
    element: <RequireAuth roles={['student', 'academic_supervisor', 'coordinator', 'admin']} />,
    children: [
      { path: '/profile', element: <ProfilePage /> },
    ],
  },

  { path: '*', element: <Navigate to="/" replace /> },
]);
