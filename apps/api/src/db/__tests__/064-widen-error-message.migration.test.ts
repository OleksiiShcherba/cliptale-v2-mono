/**
 * Integration test — migration 064_widen_error_message_columns.sql
 *
 * RED→GREEN anchor for the "Generating reference images" infinite-loader bug:
 * a fal.ai 422 content_policy_violation payload (~720 chars) overflowed the
 * VARCHAR(512) error_message column on the reference-block failure path, which
 * raised "Data too long" BEFORE the block reached a terminal state, leaving it
 * window_status='running' forever and hanging the reference_image phase.
 *
 * This migration widens error_message → TEXT NULL on every storyboard job/state
 * table that persists provider failure text. The test asserts:
 *   1. The live migration file exists at the expected path.
 *   2. runPendingMigrations() applies it without error.
 *   3. error_message is DATA_TYPE='text', NULLABLE on all five tables.
 *   4. Re-running runPendingMigrations() is a no-op (INFORMATION_SCHEMA guard).
 *
 * Prerequisites: MySQL 8 running at localhost:3306, db=cliptale, pass=cliptale.
 *
 * Run: cd apps/api && APP_DB_PASSWORD=cliptale npx vitest run
 *       src/db/__tests__/064-widen-error-message.migration.test.ts
 */

import fs from 'node:fs';
import path from 'node:path';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql from 'mysql2/promise';

import { MIGRATIONS_DIR, runPendingMigrations } from '@/db/migrate.js';

const MIGRATION_FILENAME = '064_widen_error_message_columns.sql';
const MIGRATION_PATH = path.join(MIGRATIONS_DIR, MIGRATION_FILENAME);

const DB_NAME = 'cliptale';

const TABLES = [
  'storyboard_reference_blocks',
  'storyboard_scene_video_jobs',
  'storyboard_music_generation_jobs',
  'storyboard_scene_illustration_jobs',
  'storyboard_pipeline',
];

let conn: mysql.Connection;

async function errorMessageColumn(table: string): Promise<mysql.RowDataPacket | undefined> {
  const [rows] = await conn.execute<mysql.RowDataPacket[]>(
    `SELECT DATA_TYPE, IS_NULLABLE
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = 'error_message'`,
    [DB_NAME, table],
  );
  return rows[0];
}

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
  await conn.end();
});

describe('migration 064 — widen error_message columns', () => {
  it('live file exists at apps/api/src/db/migrations/064_widen_error_message_columns.sql', () => {
    expect(fs.existsSync(MIGRATION_PATH)).toBe(true);
  });

  it('runPendingMigrations() applies the migration without error', async () => {
    await expect(runPendingMigrations()).resolves.toBeUndefined();
  });

  it('error_message is TEXT NULL on every storyboard job/state table', async () => {
    for (const table of TABLES) {
      const col = await errorMessageColumn(table);
      expect(col, table).toBeDefined();
      expect(col!['DATA_TYPE'], table).toBe('text');
      expect(col!['IS_NULLABLE'], table).toBe('YES');
    }
  });

  it('runPendingMigrations() is idempotent (INFORMATION_SCHEMA guard makes re-run a no-op)', async () => {
    await expect(runPendingMigrations()).resolves.toBeUndefined();
    const col = await errorMessageColumn('storyboard_reference_blocks');
    expect(col!['DATA_TYPE']).toBe('text');
  });
});
