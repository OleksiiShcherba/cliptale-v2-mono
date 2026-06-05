/**
 * API calls for the per-account settings feature
 * (storyboard-autosave-checkpoints, US-06).
 *
 * All HTTP calls go through `apiClient` — never call `fetch` directly.
 */

import { apiClient } from '@/lib/api-client';

/** Effective settings returned by GET/PUT /users/me/settings (UserSettings). */
export type UserSettings = {
  autosaveIntervalSeconds: number;
  /** ISO 8601, or null when no row exists yet (values are app-layer defaults). */
  updatedAt: string | null;
};

/** Preset whitelist for the checkpoint interval (ADR-0004) — keep in sync with the API. */
export const AUTOSAVE_INTERVAL_PRESETS = [30, 60, 120, 300, 600] as const;

/** Session fallback when the read fails (AC-11b: 1 minute, editing never blocked). */
export const DEFAULT_AUTOSAVE_INTERVAL_SECONDS = 60;

/**
 * Reads the effective account settings.
 * Maps to GET /users/me/settings — always 200 for an authenticated user
 * (defaults with updatedAt null when no row exists yet).
 */
export async function fetchMySettings(): Promise<UserSettings> {
  const res = await apiClient.get('/users/me/settings');
  if (!res.ok) {
    throw new Error(`GET /users/me/settings failed: ${res.status}`);
  }
  return res.json() as Promise<UserSettings>;
}

/**
 * Stores a new autosave interval (lazy single-row upsert server-side).
 * Maps to PUT /users/me/settings; non-preset values are a 400.
 */
export async function updateMySettings(
  autosaveIntervalSeconds: number,
): Promise<UserSettings> {
  const res = await apiClient.put('/users/me/settings', { autosaveIntervalSeconds });
  if (!res.ok) {
    throw new Error(`PUT /users/me/settings failed: ${res.status}`);
  }
  return res.json() as Promise<UserSettings>;
}
