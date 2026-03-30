import { config } from './config.js';

/**
 * Configured fetch wrapper.
 * Feature-level api.ts files call this — never call fetch directly.
 */
export const apiClient = {
  get: (path: string) =>
    fetch(`${config.apiBaseUrl}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    }),

  post: (path: string, body: unknown) =>
    fetch(`${config.apiBaseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    }),

  patch: (path: string, body: unknown) =>
    fetch(`${config.apiBaseUrl}${path}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    }),

  delete: (path: string) =>
    fetch(`${config.apiBaseUrl}${path}`, {
      method: 'DELETE',
      credentials: 'include',
    }),
};
