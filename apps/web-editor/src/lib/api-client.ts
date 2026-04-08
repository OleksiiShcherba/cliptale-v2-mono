import { config } from './config.js';

const TOKEN_KEY = 'auth_token';

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
