import React from 'react';

import type { AuthUser } from '@/features/auth/types';

/** Shape of the auth context value. */
export type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  /** Store token + user after login/register. */
  setSession: (token: string, user: AuthUser) => void;
  /** Clear session and redirect to /login. */
  logout: () => void;
};

export const AuthContext = React.createContext<AuthContextValue | null>(null);

/** Hook to access the auth context. Must be used within an AuthProvider. */
export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
