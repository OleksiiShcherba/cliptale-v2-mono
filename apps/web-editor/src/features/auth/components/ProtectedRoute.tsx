import React from 'react';
import { Navigate } from 'react-router-dom';

import { useAuth } from '@/features/auth/hooks/useAuth';
import { useOAuthToken } from '@/features/auth/hooks/useOAuthToken';
import { authStyles as s } from './authStyles';

/**
 * Route guard that redirects unauthenticated users to /login.
 * Also handles OAuth callback tokens from the URL (?token=xxx).
 * Shows a loading spinner while the initial auth check is in progress.
 */
export function ProtectedRoute({ children }: { children: React.ReactNode }): React.ReactElement {
  const { user, isLoading } = useAuth();
  useOAuthToken();

  if (isLoading) {
    return (
      <div
        style={{
          ...s.page,
          height: '100vh',
          minHeight: undefined,
          fontSize: 14,
        }}
      >
        Loading…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
