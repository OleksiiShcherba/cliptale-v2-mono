import React from 'react';
import { useSearchParams } from 'react-router-dom';

import { useAuth } from './useAuth';
import { fetchCurrentUser } from '@/features/auth/api';

const TOKEN_KEY = 'auth_token';

/**
 * Picks up `?token=xxx` from the URL (set by OAuth callback redirect),
 * stores it in localStorage, validates it, and cleans the URL.
 */
export function useOAuthToken(): void {
  const [searchParams, setSearchParams] = useSearchParams();
  const { setSession } = useAuth();
  const tokenFromUrl = searchParams.get('token');

  React.useEffect(() => {
    if (!tokenFromUrl) return;

    // Store the token immediately so api-client attaches it to the next request
    localStorage.setItem(TOKEN_KEY, tokenFromUrl);

    // Clean the token from the URL
    searchParams.delete('token');
    setSearchParams(searchParams, { replace: true });

    // Validate and set user in context
    fetchCurrentUser().then((user) => {
      if (user) {
        setSession(tokenFromUrl, user);
      } else {
        localStorage.removeItem(TOKEN_KEY);
      }
    }).catch(() => {
      localStorage.removeItem(TOKEN_KEY);
    });
  }, [tokenFromUrl, setSession, searchParams, setSearchParams]);
}
