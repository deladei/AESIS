import { Navigate, createBrowserRouter, Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AppShell } from '@/components/layout/AppShell';
import { StudentShell } from '@/components/layout/StudentShell';
import { SupervisorShell } from '@/components/layout/SupervisorShell';

import LoginPage         from '@/pages/auth/LoginPage';
import RegisterPage      from '@/pages/auth/RegisterPage';
import StudentDashboard  from '@/pages/student/StudentDashboard';
import LogbookEditor     from '@/pages/student/LogbookEditor';
import SubmissionHistory from '@/pages/student/SubmissionHistory';
import NotificationInbox from '@/pages/student/NotificationInbox';
import ChatbotPanel      from '@/pages/student/ChatbotPanel';
import SupervisorDashboard from '@/pages/supervisor/SupervisorDashboard';
import LogbookReview       from '@/pages/supervisor/LogbookReview';
import CoordinatorDashboard from '@/pages/coordinator/CoordinatorDashboard';
import PlacementApproval    from '@/pages/coordinator/PlacementApproval';
import SupervisorAssignment from '@/pages/coordinator/SupervisorAssignment';

type UserRole = 'student' | 'academic_supervisor' | 'coordinator' | 'admin';

function RequireAuth({ roles }: { roles?: UserRole[] }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  if (isLoading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (!isAuthenticated || !user) return <Navigate to="/auth/login" replace />;
  if (roles && !roles.includes(user.role as UserRole)) return <Navigate to="/" replace />;

  const initials = `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
  const shellUser = { name: `${user.firstName} ${user.lastName}`, email: user.email, initials };

  if (user.role === 'student') {
    return (
      <StudentShell user={shellUser}>
        <Outlet />
      </StudentShell>
    );
  }

  if (user.role === 'academic_supervisor') {
    return (
      <SupervisorShell user={shellUser}>
        <Outlet />
      </SupervisorShell>
    );
  }

  return (
    <AppShell role={user.role as UserRole} user={shellUser}>
      <Outlet />
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
    admin:               '/coordinator/dashboard',
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
      { path: '/supervisor/review',    element: <LogbookReview /> },
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

  { path: '*', element: <Navigate to="/" replace /> },
]);
