import React from 'react';

import type { AuthUser } from '@/features/auth/types';
import { fetchCurrentUser, logoutUser } from '@/features/auth/api';
import { AuthContext } from '@/features/auth/hooks/useAuth';

const TOKEN_KEY = 'auth_token';

/**
 * Provides auth state to the component tree.
 * On mount, validates the stored token via GET /auth/me.
 * Exposes setSession (for login/register) and logout.
 */
export function AuthProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setIsLoading(false);
      return;
    }

    fetchCurrentUser()
      .then((u) => {
        if (!cancelled) {
          if (!u) localStorage.removeItem(TOKEN_KEY);
          setUser(u);
        }
      })
      .catch(() => {
        if (!cancelled) {
          localStorage.removeItem(TOKEN_KEY);
          setUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const setSession = React.useCallback((token: string, authUser: AuthUser) => {
    localStorage.setItem(TOKEN_KEY, token);
    setUser(authUser);
  }, []);

  const logout = React.useCallback(() => {
    logoutUser();
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }, []);

  const value = React.useMemo(
    () => ({ user, isLoading, setSession, logout }),
    [user, isLoading, setSession, logout],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
