import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, setAccessToken } from '@/lib/api';
import { initSocket, disconnectSocket } from '@/lib/socket';
import { queryClient } from '@/lib/queryClient';

export interface AuthUser {
  id:        string;
  email:     string;
  firstName: string;
  lastName:  string;
  role:      'student' | 'academic_supervisor' | 'coordinator' | 'admin';
}

interface AuthState {
  user:            AuthUser | null;
  isAuthenticated: boolean;
  isLoading:       boolean;
  login:           (email: string, password: string) => Promise<AuthUser>;
  logout:          () => Promise<void>;
  register:        (input: RegisterInput) => Promise<void>;
}

export type SelfRegisterRole = 'student' | 'academic_supervisor' | 'company_supervisor';

export interface RegisterInput {
  firstName:    string;
  lastName:     string;
  email:        string;
  password:     string;
  role:         SelfRegisterRole;
  gender:       'male' | 'female' | 'other';
  programmeId?: string;
  // Student-only university index / matric number (unique). Required by the API
  // when role=student.
  indexNumber?: string;
  // Student-only: the full placement is created at registration and a regional
  // academic supervisor is auto-assigned. Required by the API when role=student.
  region?:                 string;
  companyName?:            string;
  companyAddress?:         string;
  companySupervisorName?:  string;
  companySupervisorEmail?: string;
  startDate?:              string;
  endDate?:                string;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<AuthUser | null>(null);
  const [isLoading, setLoading] = useState(true);

  const storeSession = useCallback((token: string, authUser: AuthUser) => {
    setAccessToken(token);
    setUser(authUser);
    initSocket(token);
  }, []);

  // Attempt silent refresh on app load
  useEffect(() => {
    api.post<{ data: { accessToken: string; user: AuthUser } }>('/auth/refresh')
      .then((r) => storeSession(r.data.data.accessToken, r.data.data.user))
      .catch(() => { /* not logged in */ })
      .finally(() => setLoading(false));
  }, [storeSession]);

  const login = useCallback(async (email: string, password: string): Promise<AuthUser> => {
    const r = await api.post<{ data: { accessToken: string; user: AuthUser } }>(
      '/auth/login', { email, password },
    );
    storeSession(r.data.data.accessToken, r.data.data.user);
    return r.data.data.user;
  }, [storeSession]);

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout'); } catch { /* ignore */ }
    setAccessToken(null);
    setUser(null);
    disconnectSocket();
    queryClient.clear();
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    await api.post('/auth/register', input);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, logout, register }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
