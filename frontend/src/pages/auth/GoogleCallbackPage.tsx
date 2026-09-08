import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

const ROLE_HOME: Record<string, string> = {
  student:             '/student/dashboard',
  academic_supervisor: '/supervisor/dashboard',
  coordinator:         '/coordinator/dashboard',
  admin:               '/admin/dashboard',
};

/**
 * Where Google sign-in lands.
 *
 * The server has already set the refresh cookie; the access token is
 * deliberately not in the URL, because anything there ends up in browser
 * history, the Referer header and proxy logs. `AuthContext` trades the cookie
 * for a session on mount — the same path every page reload takes — so this
 * page only has to wait for that and then route by role.
 */
export default function GoogleCallbackPage() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const [tookTooLong, setTookTooLong] = useState(false);
  const timer = useRef<number>();

  useEffect(() => {
    if (isLoading) return;
    if (user) {
      navigate(ROLE_HOME[user.role] ?? '/student/dashboard', { replace: true });
      return;
    }
    // Signed out after the bootstrap settled means the cookie did not survive
    // the round trip. Say so rather than spinning forever.
    navigate('/auth/login?google=failed', { replace: true });
  }, [isLoading, user, navigate]);

  useEffect(() => {
    timer.current = window.setTimeout(() => setTookTooLong(true), 12_000);
    return () => window.clearTimeout(timer.current);
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-app p-8">
      <div className="text-center">
        <div
          className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-line border-t-brand"
          role="status"
          aria-label="Signing you in"
        />
        <p className="text-sm text-ink-secondary">Signing you in…</p>
        {tookTooLong && (
          <p className="mt-3 max-w-xs text-xs text-ink-muted">
            This is taking longer than usual. The API may be waking up — give it
            a few more seconds.
          </p>
        )}
      </div>
    </div>
  );
}
