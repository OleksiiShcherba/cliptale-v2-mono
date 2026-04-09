import { config } from './config.js';

const TOKEN_KEY = 'auth_token';

/**
 * Returns the stored auth token, or null if none is stored.
 * Used by media stream URLs that need to pass the token as a query parameter
 * since browser media elements (`<img>`, `<video>`) cannot attach headers.
 */
export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * Appends the auth token as a `?token=` query parameter to a URL.
 * Returns the URL unchanged if no token is stored.
 */
export function buildAuthenticatedUrl(url: string): string {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}token=${encodeURIComponent(token)}`;
}

/** Builds headers including Authorization if a token is stored. */
function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/** Handles 401 responses by clearing the token and redirecting to /login. */
function handleUnauthorized(res: Response): Response {
  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    // Only redirect if not already on an auth page
    if (!window.location.pathname.startsWith('/login')
      && !window.location.pathname.startsWith('/register')
      && !window.location.pathname.startsWith('/forgot-password')
      && !window.location.pathname.startsWith('/reset-password')) {
      window.location.href = '/login';
    }
  }
  return res;
}

/**
 * Configured fetch wrapper.
 * Feature-level api.ts files call this — never call fetch directly.
 * Attaches Bearer token from localStorage and redirects on 401.
 */
export const apiClient = {
  get: (path: string) =>
    fetch(`${config.apiBaseUrl}${path}`, {
      headers: buildHeaders(),
    }).then(handleUnauthorized),

  post: (path: string, body: unknown) =>
    fetch(`${config.apiBaseUrl}${path}`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(body),
    }).then(handleUnauthorized),

  patch: (path: string, body: unknown) =>
    fetch(`${config.apiBaseUrl}${path}`, {
      method: 'PATCH',
      headers: buildHeaders(),
      body: JSON.stringify(body),
    }).then(handleUnauthorized),

  delete: (path: string) =>
    fetch(`${config.apiBaseUrl}${path}`, {
      method: 'DELETE',
      headers: buildHeaders(),
    }).then(handleUnauthorized),
};
