import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api, User, AppSettings, ApiClientError } from '../api/client';
import { ShieldAlert, Loader2 } from 'lucide-react';

interface AuthContextValue {
  user: User | null;
  settings: AppSettings | null;
  loading: boolean;
  isAdmin: boolean;
  login: (credentials: { username: string; password: string }) => Promise<User>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  refreshSettings: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const refreshMe = useCallback(async () => {
    try {
      const res = await api.auth.getMe();
      setUser(res.user);
    } catch (err: any) {
      if (err instanceof ApiClientError && (err.status === 401 || err.status === 403)) {
        setUser(null);
      } else {
        console.error('Failed to restore user session:', err);
      }
    }
  }, []);

  const refreshSettings = useCallback(async () => {
    try {
      const res = await api.settings.get();
      setSettings(res.settings);
    } catch (err: any) {
      // Unauthenticated or settings error is non-fatal for session init
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    async function init() {
      setLoading(true);
      try {
        const meRes = await api.auth.getMe();
        if (mounted) {
          setUser(meRes.user);
          try {
            const setRes = await api.settings.get();
            if (mounted) setSettings(setRes.settings);
          } catch {
            // ignore settings load failure when starting
          }
        }
      } catch {
        if (mounted) {
          setUser(null);
          setSettings(null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }
    init();
    return () => {
      mounted = false;
    };
  }, []);

  const login = useCallback(
    async (credentials: { username: string; password: string }) => {
      const res = await api.auth.login(credentials);
      setUser(res.user);
      try {
        const setRes = await api.settings.get();
        setSettings(setRes.settings);
      } catch {
        // silent fallback
      }
      return res.user;
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch (err) {
      console.warn('Logout warning:', err);
    } finally {
      setUser(null);
      setSettings(null);
    }
  }, []);

  const isAdmin = user?.role === 'ADMIN';

  return (
    <AuthContext.Provider
      value={{
        user,
        settings,
        loading,
        isAdmin,
        login,
        logout,
        refreshMe,
        refreshSettings,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

/**
 * Route guard component requiring an authenticated user.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-slate-600 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
        <p className="text-sm font-medium tracking-wide">Authenticating Nepal VAT Session...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

/**
 * Route guard component requiring ADMIN role.
 */
export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, loading, isAdmin } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-slate-600 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
        <p className="text-sm font-medium tracking-wide">Checking permissions...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!isAdmin) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mb-4 shadow-sm">
          <ShieldAlert className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Access Restricted</h2>
        <p className="text-sm text-slate-600 max-w-md mb-6">
          You are signed in as <strong>{user.fullName}</strong> ({user.role}). This section requires Administrator access permissions.
        </p>
        <a
          href="/"
          className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors shadow-sm"
        >
          Return to Dashboard
        </a>
      </div>
    );
  }

  return <>{children}</>;
}
