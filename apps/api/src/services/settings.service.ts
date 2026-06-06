/**
 * Service for per-account user settings (storyboard-autosave-checkpoints, ADR-0004).
 *
 * Responsibility:
 * - Serve the EFFECTIVE settings: stored values merged over app-layer defaults,
 *   so a missing row (created lazily on first write) or a missing key never
 *   surfaces as an error (AC-11b).
 * - Lazy single-row upsert on write; unknown future keys in settings_json are
 *   preserved (forward-compatible JSON blob).
 *
 * Owner-scoping (AC-11c) is structural: callers pass the authenticated user's
 * id — another account's settings are not addressable. Validation of the
 * preset whitelist (30/60/120/300/600 s) lives in the controller's Zod schema.
 * This service intentionally stays free of HTTP concerns.
 */

import * as settingsRepository from '@/repositories/settings.repository.js';

/** Preset whitelist for the storyboard checkpoint interval (ADR-0004). */
export const AUTOSAVE_INTERVAL_PRESETS = [30, 60, 120, 300, 600] as const;

/** App-layer default when no row / no key exists (AC-11b: 1 minute). */
export const DEFAULT_AUTOSAVE_INTERVAL_SECONDS = 60;

/** Shape returned by GET/PUT /users/me/settings (OpenAPI UserSettings). */
export type UserSettingsResponse = {
  autosaveIntervalSeconds: number;
  /** ISO 8601, or null when no row exists yet (values are defaults). */
  updatedAt: string | null;
};

/** Fields accepted by PUT /users/me/settings (OpenAPI UserSettingsUpdate). */
export type UserSettingsUpdate = {
  autosaveIntervalSeconds: number;
};

/** Extracts a valid interval from the stored blob, else the default. */
function effectiveInterval(settings: unknown): number {
  if (typeof settings === 'object' && settings !== null) {
    const value = (settings as Record<string, unknown>)['autosaveIntervalSeconds'];
    if (
      typeof value === 'number' &&
      (AUTOSAVE_INTERVAL_PRESETS as readonly number[]).includes(value)
    ) {
      return value;
    }
  }
  return DEFAULT_AUTOSAVE_INTERVAL_SECONDS;
}

/**
 * Returns the effective settings for the user: stored values when a row
 * exists, app-layer defaults (60 s, updatedAt null) when it does not (AC-11b).
 */
export async function getMySettings(userId: string): Promise<UserSettingsResponse> {
  const record = await settingsRepository.getByUserId(userId);
  if (!record) {
    return {
      autosaveIntervalSeconds: DEFAULT_AUTOSAVE_INTERVAL_SECONDS,
      updatedAt: null,
    };
  }
  return {
    autosaveIntervalSeconds: effectiveInterval(record.settings),
    updatedAt: record.updatedAt.toISOString(),
  };
}

/**
 * Upserts the user's settings row (created lazily on first write — AC-09) and
 * returns the persisted effective settings. Existing unknown keys in the blob
 * are preserved so future preferences survive an interval change.
 */
export async function updateMySettings(
  userId: string,
  update: UserSettingsUpdate,
): Promise<UserSettingsResponse> {
  const existing = await settingsRepository.getByUserId(userId);
  const base =
    existing && typeof existing.settings === 'object' && existing.settings !== null
      ? (existing.settings as Record<string, unknown>)
      : {};

  const merged = { ...base, autosaveIntervalSeconds: update.autosaveIntervalSeconds };
  const record = await settingsRepository.upsertByUserId(userId, merged);

  return {
    autosaveIntervalSeconds: effectiveInterval(record.settings),
    updatedAt: record.updatedAt.toISOString(),
  };
}
