/**
 * Service for per-account user settings (storyboard-autosave-checkpoints, ADR-0004;
 * storyboard-reference-flows concurrencyLimit, T6).
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

import { ValidationError } from '@/lib/errors.js';
import * as settingsRepository from '@/repositories/settings.repository.js';

/** Preset whitelist for the storyboard checkpoint interval (ADR-0004). */
export const AUTOSAVE_INTERVAL_PRESETS = [30, 60, 120, 300, 600] as const;

/** App-layer default when no row / no key exists (AC-11b: 1 minute). */
export const DEFAULT_AUTOSAVE_INTERVAL_SECONDS = 60;

/** Default concurrency limit for reference-flow auto-dispatch (T6, migration 050). */
export const DEFAULT_CONCURRENCY_LIMIT = 4;

/** Minimum / maximum concurrency limit bounds (T6, openapi.yaml). */
export const CONCURRENCY_LIMIT_MIN = 1;
export const CONCURRENCY_LIMIT_MAX = 12;

/** Shape returned by GET/PUT /users/me/settings (OpenAPI UserSettings). */
export type UserSettingsResponse = {
  autosaveIntervalSeconds: number;
  /** Number of reference-flow generations that may run concurrently (default 4). */
  concurrencyLimit: number;
  /** ISO 8601, or null when no row exists yet (values are defaults). */
  updatedAt: string | null;
};

/** Fields accepted by PUT /users/me/settings (OpenAPI UserSettingsUpdate). */
export type UserSettingsUpdate = {
  autosaveIntervalSeconds?: number;
  /** If present, must be in range [1, 12]. */
  concurrencyLimit?: number;
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

/** Extracts a valid concurrencyLimit from the stored blob, else the default. */
function effectiveConcurrencyLimit(settings: unknown): number {
  if (typeof settings === 'object' && settings !== null) {
    const value = (settings as Record<string, unknown>)['concurrencyLimit'];
    if (
      typeof value === 'number' &&
      Number.isInteger(value) &&
      value >= CONCURRENCY_LIMIT_MIN &&
      value <= CONCURRENCY_LIMIT_MAX
    ) {
      return value;
    }
  }
  return DEFAULT_CONCURRENCY_LIMIT;
}

/**
 * Returns the effective settings for the user: stored values when a row
 * exists, app-layer defaults when it does not (AC-11b).
 */
export async function getMySettings(userId: string): Promise<UserSettingsResponse> {
  const record = await settingsRepository.getByUserId(userId);
  if (!record) {
    return {
      autosaveIntervalSeconds: DEFAULT_AUTOSAVE_INTERVAL_SECONDS,
      concurrencyLimit: DEFAULT_CONCURRENCY_LIMIT,
      updatedAt: null,
    };
  }
  return {
    autosaveIntervalSeconds: effectiveInterval(record.settings),
    concurrencyLimit: effectiveConcurrencyLimit(record.settings),
    updatedAt: record.updatedAt.toISOString(),
  };
}

/**
 * Upserts the user's settings row (created lazily on first write — AC-09) and
 * returns the persisted effective settings. Existing unknown keys in the blob
 * are preserved so future preferences survive a change.
 *
 * Throws ValidationError when concurrencyLimit is outside [1, 12].
 */
export async function updateMySettings(
  userId: string,
  update: UserSettingsUpdate,
): Promise<UserSettingsResponse> {
  // Validate concurrencyLimit bounds before touching the DB.
  if (update.concurrencyLimit !== undefined) {
    if (
      !Number.isInteger(update.concurrencyLimit) ||
      update.concurrencyLimit < CONCURRENCY_LIMIT_MIN ||
      update.concurrencyLimit > CONCURRENCY_LIMIT_MAX
    ) {
      throw new ValidationError(
        `concurrencyLimit must be an integer between ${CONCURRENCY_LIMIT_MIN} and ${CONCURRENCY_LIMIT_MAX}`,
      );
    }
  }

  const existing = await settingsRepository.getByUserId(userId);
  const base =
    existing && typeof existing.settings === 'object' && existing.settings !== null
      ? (existing.settings as Record<string, unknown>)
      : {};

  const merged: Record<string, unknown> = { ...base };
  if (update.autosaveIntervalSeconds !== undefined) {
    merged['autosaveIntervalSeconds'] = update.autosaveIntervalSeconds;
  }
  if (update.concurrencyLimit !== undefined) {
    merged['concurrencyLimit'] = update.concurrencyLimit;
  }

  const record = await settingsRepository.upsertByUserId(userId, merged);

  return {
    autosaveIntervalSeconds: effectiveInterval(record.settings),
    concurrencyLimit: effectiveConcurrencyLimit(record.settings),
    updatedAt: record.updatedAt.toISOString(),
  };
}
