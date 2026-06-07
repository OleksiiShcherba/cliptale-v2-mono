/**
 * Integration tests — settings.service + settings.repository on live MySQL.
 *
 * storyboard-autosave-checkpoints T3 (AC-09, AC-10, AC-11b):
 *   - missing user_settings row → effective defaults (60 s, updatedAt null) — AC-11b
 *   - first write lazily CREATES the single row; second write UPDATES it
 *     (never a second row) — lazy upsert per ADR-0004
 *   - the stored value is read back account-wide (AC-09 / AC-10 at the DB level)
 *   - a row whose settings_json lacks the key still yields the default value
 *
 * Prerequisites: MySQL 8 at localhost:3306, db=cliptale (migration 050 applied).
 *
 * Run: cd apps/api && APP_DB_PASSWORD=cliptale npx vitest run
 *       src/__tests__/integration/settings-service.integration.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql from 'mysql2/promise';

import { getMySettings, updateMySettings } from '@/services/settings.service.js';
import { pool } from '@/db/connection.js';

const DB_NAME = 'cliptale';
const USER_ID = '00000000-0000-4000-8000-t3settings00';
const OTHER_USER_ID = '00000000-0000-4000-8000-t3settings01';

let conn: mysql.Connection;

beforeAll(async () => {
  conn = await mysql.createConnection({
    host: 'localhost',
    port: 3306,
    database: DB_NAME,
    user: 'cliptale',
    password: process.env['APP_DB_PASSWORD'] ?? 'cliptale',
  });
  // FK user_settings → users requires real user rows.
  await conn.execute('DELETE FROM users WHERE user_id IN (?, ?)', [USER_ID, OTHER_USER_ID]);
  await conn.execute(
    `INSERT INTO users (user_id, email, display_name, email_verified)
     VALUES (?, ?, ?, 1), (?, ?, ?, 1)`,
    [
      USER_ID, 't3-settings@example.test', 'T3 Settings',
      OTHER_USER_ID, 't3-settings-other@example.test', 'T3 Other',
    ],
  );
});

afterAll(async () => {
  // CASCADE removes the user_settings rows.
  await conn.execute('DELETE FROM users WHERE user_id IN (?, ?)', [USER_ID, OTHER_USER_ID]);
  await conn.end();
  await pool.end();
});

describe('settings.service — effective read with defaults (AC-11b)', () => {
  it('missing row yields autosaveIntervalSeconds=60 and updatedAt=null', async () => {
    const result = await getMySettings(USER_ID);
    expect(result).toEqual({ autosaveIntervalSeconds: 60, concurrencyLimit: 4, updatedAt: null });
  });

  it('a row whose settings_json lacks the key still yields the default 60', async () => {
    await conn.execute(
      `INSERT INTO user_settings (user_id, settings_json) VALUES (?, JSON_OBJECT())`,
      [OTHER_USER_ID],
    );
    const result = await getMySettings(OTHER_USER_ID);
    expect(result.autosaveIntervalSeconds).toBe(60);
    expect(result.updatedAt).not.toBeNull();
  });
});

describe('settings.service — lazy upsert (AC-09 / AC-10)', () => {
  it('first write creates the single row lazily and returns the stored value', async () => {
    const result = await updateMySettings(USER_ID, { autosaveIntervalSeconds: 120 });
    expect(result.autosaveIntervalSeconds).toBe(120);
    expect(typeof result.updatedAt).toBe('string');

    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      'SELECT COUNT(*) AS n FROM user_settings WHERE user_id = ?',
      [USER_ID],
    );
    expect(Number(rows[0]!['n'])).toBe(1);
  });

  it('second write updates the same row — never a second one', async () => {
    const result = await updateMySettings(USER_ID, { autosaveIntervalSeconds: 300 });
    expect(result.autosaveIntervalSeconds).toBe(300);

    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      'SELECT COUNT(*) AS n FROM user_settings WHERE user_id = ?',
      [USER_ID],
    );
    expect(Number(rows[0]!['n'])).toBe(1);
  });

  it('the stored value is read back for the account (AC-10: follows the account)', async () => {
    const result = await getMySettings(USER_ID);
    expect(result.autosaveIntervalSeconds).toBe(300);
    expect(result.updatedAt).not.toBeNull();
    // DATETIME(3) → ISO 8601 string per the OpenAPI contract.
    expect(() => new Date(result.updatedAt!)).not.toThrow();
  });
});
