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
import StudentDashboard  from '@/pages/student/StudentDashboard';
import LogbookEditor     from '@/pages/student/LogbookEditor';
import SubmissionHistory from '@/pages/student/SubmissionHistory';
import NotificationInbox from '@/pages/student/NotificationInbox';
import ChatbotPanel      from '@/pages/student/ChatbotPanel';
import SupervisorDashboard from '@/pages/supervisor/SupervisorDashboard';
import EntryReview         from '@/pages/supervisor/EntryReview';
import CoordinatorDashboard from '@/pages/coordinator/CoordinatorDashboard';
import PlacementApproval    from '@/pages/coordinator/PlacementApproval';
import SupervisorAssignment from '@/pages/coordinator/SupervisorAssignment';
import AdminDashboard       from '@/pages/admin/AdminDashboard';
import FeedbackCenter       from '@/pages/shared/FeedbackCenter';
import AIInsights           from '@/pages/shared/AIInsights';

type UserRole = 'student' | 'academic_supervisor' | 'coordinator' | 'admin';

function RequireAuth({ roles }: { roles?: UserRole[] }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();
  if (isLoading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (!isAuthenticated || !user) return <Navigate to="/auth/login" replace />;
  if (roles && !roles.includes(user.role as UserRole)) return <Navigate to="/" replace />;

  const initials = `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
  const shellUser = { name: `${user.firstName} ${user.lastName}`, email: user.email, initials };

  // Page content is wrapped in an error boundary so a crashing page renders a
  // contained fallback inside the shell rather than unmounting the whole app.
  // Keyed on pathname so navigating away auto-clears a previous page's error.
  const content = (
    <RouteErrorBoundary resetKey={location.pathname}>
      <Outlet />
    </RouteErrorBoundary>
  );

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

  // Student
  {
    element: <RequireAuth roles={['student']} />,
    children: [
      { path: '/student/dashboard',     element: <StudentDashboard /> },
      { path: '/student/logbook',       element: <LogbookEditor /> },
      { path: '/student/submissions',   element: <SubmissionHistory /> },
      { path: '/student/notifications', element: <NotificationInbox /> },
      { path: '/student/chatbot',       element: <ChatbotPanel /> },
    ],
  },

  // Supervisor
  {
    element: <RequireAuth roles={['academic_supervisor', 'admin']} />,
    children: [
      { path: '/supervisor/dashboard', element: <SupervisorDashboard /> },
      { path: '/supervisor/review',    element: <EntryReview /> },
    ],
  },

  // Coordinator
  {
    element: <RequireAuth roles={['coordinator', 'admin']} />,
    children: [
      { path: '/coordinator/dashboard',  element: <CoordinatorDashboard /> },
      { path: '/coordinator/placements', element: <PlacementApproval /> },
      { path: '/coordinator/assignments', element: <SupervisorAssignment /> },
    ],
  },

  // Admin
  {
    element: <RequireAuth roles={['admin']} />,
    children: [
      { path: '/admin/dashboard', element: <AdminDashboard /> },
      { path: '/admin/review',    element: <EntryReview /> },
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

  { path: '*', element: <Navigate to="/" replace /> },
]);
