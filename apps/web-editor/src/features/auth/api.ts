import { apiClient } from '@/lib/api-client';
import type { AuthUser, AuthResponse, MessageResponse } from './types';

/** GET /auth/me — fetch the currently authenticated user. Returns null if not authenticated. */
export async function fetchCurrentUser(): Promise<AuthUser | null> {
  const res = await apiClient.get('/auth/me');
  if (!res.ok) return null;
  return res.json();
}

/** POST /auth/logout — invalidate the current session (fire-and-forget). */
export async function logoutUser(): Promise<void> {
  await apiClient.post('/auth/logout', {}).catch(() => {});
}

/** POST /auth/register — create a new user account. */
export async function registerUser(
  email: string,
  password: string,
  displayName: string,
): Promise<AuthResponse> {
  const res = await apiClient.post('/auth/register', { email, password, displayName });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Registration failed' }));
    throw new Error(body.error ?? 'Registration failed');
  }
  return res.json();
}

/** POST /auth/login — authenticate with email/password. */
export async function loginUser(
  email: string,
  password: string,
): Promise<AuthResponse> {
  const res = await apiClient.post('/auth/login', { email, password });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Invalid credentials' }));
    throw new Error(body.error ?? 'Invalid credentials');
  }
  return res.json();
}

/** POST /auth/forgot-password — initiate password reset. */
export async function forgotPassword(email: string): Promise<MessageResponse> {
  const res = await apiClient.post('/auth/forgot-password', { email });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(body.error ?? 'Request failed');
  }
  return res.json();
}

/** POST /auth/reset-password — reset password with token. */
export async function resetPassword(
  token: string,
  newPassword: string,
): Promise<MessageResponse> {
  const res = await apiClient.post('/auth/reset-password', { token, newPassword });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Reset failed' }));
    throw new Error(body.error ?? 'Reset failed');
  }
  return res.json();
}
