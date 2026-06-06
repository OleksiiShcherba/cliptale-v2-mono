/**
 * Repository for the user_settings table (storyboard-autosave-checkpoints, ADR-0004).
 *
 * One row per user; preferences live in an opaque-to-the-DB JSON blob
 * (settings_json). The row is created lazily on the user's first write from
 * the Settings page — no row means the app layer serves its defaults
 * (60 s autosave interval, AC-11b).
 *
 * These two functions are the sole DB surface for this table: no other file
 * in the codebase should query user_settings directly.
 */

import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';

import { pool } from '@/db/connection.js';

/** A hydrated row from user_settings. */
export type UserSettingsRecord = {
  userId: string;
  /** Parsed settings_json blob — shape is owned by the service layer (Zod). */
  settings: unknown;
  updatedAt: Date;
};

type UserSettingsRow = RowDataPacket & {
  user_id: string;
  /** mysql2 returns JSON columns as already-parsed values. */
  settings_json: unknown;
  updated_at: Date;
};

function mapRow(row: UserSettingsRow): UserSettingsRecord {
  return {
    userId: row.user_id,
    settings: row.settings_json,
    updatedAt: row.updated_at,
  };
}

/** Returns the settings row for the given user, or null when no row exists yet. */
export async function getByUserId(userId: string): Promise<UserSettingsRecord | null> {
  const [rows] = await pool.query<UserSettingsRow[]>(
    `SELECT user_id, settings_json, updated_at
       FROM user_settings
      WHERE user_id = ?`,
    [userId],
  );
  if (!rows.length) return null;
  return mapRow(rows[0]!);
}

/**
 * Inserts or replaces the settings blob for the given user (lazy single-row
 * upsert): a missing row is created on first write, an existing row is
 * overwritten. updated_at is refreshed by the ON UPDATE CURRENT_TIMESTAMP(3)
 * column default.
 *
 * Returns the persisted row (re-read to capture the server-generated updated_at).
 */
export async function upsertByUserId(
  userId: string,
  settings: unknown,
): Promise<UserSettingsRecord> {
  const settingsJson = JSON.stringify(settings);

  await pool.query<ResultSetHeader>(
    `INSERT INTO user_settings (user_id, settings_json)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE settings_json = VALUES(settings_json)`,
    [userId, settingsJson],
  );

  const [rows] = await pool.query<UserSettingsRow[]>(
    `SELECT user_id, settings_json, updated_at
       FROM user_settings
      WHERE user_id = ?`,
    [userId],
  );

  // The INSERT … ON DUPLICATE KEY UPDATE is atomic, so a row must exist now.
  return mapRow(rows[0]!);
}
