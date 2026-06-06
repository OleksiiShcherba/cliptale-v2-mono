/**
 * Integration test — migration 050_create_user_settings.sql
 *
 * RED→GREEN anchor (storyboard-autosave-checkpoints T1, AC-09 / AC-10, ADR-0004):
 *   1. The live migration file exists at the expected path.
 *   2. runPendingMigrations() applies it against the real localhost MySQL.
 *   3. The table `user_settings` exists in information_schema.
 *   4. PK is `user_id`; `settings_json` is JSON NOT NULL; `updated_at` is
 *      DATETIME(3) NOT NULL with ON UPDATE CURRENT_TIMESTAMP(3).
 *   5. FK fk_user_settings_user → users(user_id) with ON DELETE CASCADE,
 *      verified behaviourally: deleting a user removes their settings row.
 *   6. Re-running runPendingMigrations() is a no-op (CREATE TABLE IF NOT EXISTS).
 *
 * Prerequisites: MySQL 8 running at localhost:3306, db=cliptale, pass=cliptale.
 *
 * Run: cd apps/api && APP_DB_PASSWORD=cliptale npx vitest run
 *       src/db/__tests__/050-user-settings.migration.test.ts
 */

import fs from 'node:fs';
import path from 'node:path';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql from 'mysql2/promise';

import { MIGRATIONS_DIR, runPendingMigrations } from '@/db/migrate.js';

const MIGRATION_FILENAME = '050_create_user_settings.sql';
const MIGRATION_PATH = path.join(MIGRATIONS_DIR, MIGRATION_FILENAME);

const TABLE_NAME = 'user_settings';
const DB_NAME = 'cliptale';

/** Throwaway user for the FK CASCADE behavioural check. */
const CASCADE_USER_ID = '00000000-0000-4000-8000-t1cascade050';

let conn: mysql.Connection;

beforeAll(async () => {
  conn = await mysql.createConnection({
    host: 'localhost',
    port: 3306,
    database: DB_NAME,
    user: 'cliptale',
    password: process.env['APP_DB_PASSWORD'] ?? 'cliptale',
  });
});

afterAll(async () => {
  // Idempotent cleanup in case the CASCADE test failed mid-way.
  await conn.execute('DELETE FROM users WHERE user_id = ?', [CASCADE_USER_ID]);
  await conn.end();
});

describe('migration 050 — user_settings', () => {
  it('live file exists at apps/api/src/db/migrations/050_create_user_settings.sql', () => {
    expect(fs.existsSync(MIGRATION_PATH)).toBe(true);
  });

  it('runPendingMigrations() applies the migration without error', async () => {
    await expect(runPendingMigrations()).resolves.toBeUndefined();
  });

  it('table user_settings exists in information_schema', async () => {
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT TABLE_NAME
         FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = ?
          AND TABLE_NAME   = ?`,
      [DB_NAME, TABLE_NAME],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!['TABLE_NAME']).toBe(TABLE_NAME);
  });

  it('PK is user_id; settings_json JSON NOT NULL; updated_at DATETIME(3) ON UPDATE', async () => {
    const [pkRows] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT COLUMN_NAME
         FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA    = ?
          AND TABLE_NAME      = ?
          AND CONSTRAINT_NAME = 'PRIMARY'`,
      [DB_NAME, TABLE_NAME],
    );
    expect(pkRows).toHaveLength(1);
    expect(pkRows[0]!['COLUMN_NAME']).toBe('user_id');

    const [cols] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT COLUMN_NAME, COLUMN_TYPE, DATA_TYPE, IS_NULLABLE, EXTRA
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ?
          AND TABLE_NAME   = ?`,
      [DB_NAME, TABLE_NAME],
    );
    const byName = Object.fromEntries(cols.map((c) => [c['COLUMN_NAME'], c]));

    expect(byName['user_id']!['COLUMN_TYPE']).toBe('char(36)');
    expect(byName['user_id']!['IS_NULLABLE']).toBe('NO');

    expect(byName['settings_json']!['DATA_TYPE']).toBe('json');
    expect(byName['settings_json']!['IS_NULLABLE']).toBe('NO');

    expect(byName['updated_at']!['COLUMN_TYPE']).toBe('datetime(3)');
    expect(byName['updated_at']!['IS_NULLABLE']).toBe('NO');
    expect(String(byName['updated_at']!['EXTRA']).toUpperCase()).toContain(
      'ON UPDATE CURRENT_TIMESTAMP',
    );
  });

  it('FK fk_user_settings_user references users(user_id) with ON DELETE CASCADE', async () => {
    const [fkRows] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT rc.DELETE_RULE, kcu.REFERENCED_TABLE_NAME, kcu.REFERENCED_COLUMN_NAME
         FROM information_schema.REFERENTIAL_CONSTRAINTS rc
         JOIN information_schema.KEY_COLUMN_USAGE kcu
           ON kcu.CONSTRAINT_SCHEMA = rc.CONSTRAINT_SCHEMA
          AND kcu.CONSTRAINT_NAME   = rc.CONSTRAINT_NAME
        WHERE rc.CONSTRAINT_SCHEMA = ?
          AND rc.CONSTRAINT_NAME   = 'fk_user_settings_user'`,
      [DB_NAME],
    );
    expect(fkRows).toHaveLength(1);
    expect(fkRows[0]!['DELETE_RULE']).toBe('CASCADE');
    expect(fkRows[0]!['REFERENCED_TABLE_NAME']).toBe('users');
    expect(fkRows[0]!['REFERENCED_COLUMN_NAME']).toBe('user_id');
  });

  it('deleting a user CASCADE-deletes their user_settings row', async () => {
    // Mirror the minimal users insert used by other integration tests.
    await conn.execute(
      `INSERT INTO users (user_id, email, display_name, email_verified)
       VALUES (?, ?, ?, 1)`,
      [CASCADE_USER_ID, 't1-cascade-050@test.local', 'T1 Cascade'],
    );
    await conn.execute(
      `INSERT INTO user_settings (user_id, settings_json)
       VALUES (?, JSON_OBJECT('storyboardCheckpointIntervalSeconds', 60))`,
      [CASCADE_USER_ID],
    );

    await conn.execute('DELETE FROM users WHERE user_id = ?', [CASCADE_USER_ID]);

    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      'SELECT user_id FROM user_settings WHERE user_id = ?',
      [CASCADE_USER_ID],
    );
    expect(rows).toHaveLength(0);
  });

  it('runPendingMigrations() is idempotent (no-op on re-run)', async () => {
    await expect(runPendingMigrations()).resolves.toBeUndefined();
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT TABLE_NAME
         FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = ?
          AND TABLE_NAME   = ?`,
      [DB_NAME, TABLE_NAME],
    );
    expect(rows).toHaveLength(1);
  });
});
