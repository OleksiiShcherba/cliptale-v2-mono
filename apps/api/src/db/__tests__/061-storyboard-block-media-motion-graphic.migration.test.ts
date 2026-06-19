/**
 * Integration test — migration 061 (storyboard_block_media motion_graphic alter)
 *
 * RED→GREEN anchor (ai-motion-graphic T2, AC-04 / AC-10, ADR-0009):
 *   Promote staged 04 → live 061. EXPAND-only alter of the storyboard_block_media pivot (033):
 *     1. media_type ENUM gains the additive 'motion_graphic' value.
 *     2. file_id relaxes NOT NULL → NULL (a motion_graphic row has no file row).
 *     3. motion_graphic_snapshot_id CHAR(36) NULL column is added.
 *     4. idx_storyboard_block_media_mg_snapshot indexes it.
 *     5. fk_storyboard_block_media_mg_snapshot → motion_graphic_block_snapshots(id) CASCADE.
 *   The original fk_storyboard_block_media_file → files(file_id) is preserved (dropped + re-added).
 *
 * EXPAND-only: nothing is narrowed or removed, so existing image/video/audio rows are untouched
 * (no backfill). The runner is forward-only; the staged down is the manual rollback reference.
 *
 * Prerequisites: MySQL 8 at localhost:3306, db=cliptale, pass=cliptale.
 *
 * Run: cd apps/api && APP_DB_PASSWORD=cliptale npx vitest run
 *       src/db/__tests__/061-storyboard-block-media-motion-graphic.migration.test.ts
 */

import fs from 'node:fs';
import path from 'node:path';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql from 'mysql2/promise';

import { MIGRATIONS_DIR, runPendingMigrations } from '@/db/migrate.js';

const DB_NAME = 'cliptale';
const TABLE = 'storyboard_block_media';
const MIGRATION_FILENAME = '061_alter_storyboard_block_media_motion_graphic.sql';

let conn: mysql.Connection;

async function columns(): Promise<Record<string, mysql.RowDataPacket>> {
  const [rows] = await conn.execute<mysql.RowDataPacket[]>(
    `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [DB_NAME, TABLE],
  );
  return Object.fromEntries(rows.map((c) => [c['COLUMN_NAME'], c]));
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

describe('migration 061 — storyboard_block_media motion_graphic alter', () => {
  it('live file exists at the promoted path', () => {
    expect(fs.existsSync(path.join(MIGRATIONS_DIR, MIGRATION_FILENAME))).toBe(true);
  });

  it('runPendingMigrations() applies the alter without error', async () => {
    await expect(runPendingMigrations()).resolves.toBeUndefined();
  });

  it('media_type ENUM gains the additive motion_graphic value', async () => {
    const cols = await columns();
    expect(cols['media_type']!['COLUMN_TYPE']).toBe(
      "enum('image','video','audio','motion_graphic')",
    );
  });

  it('file_id is relaxed to NULLABLE (a motion_graphic row has no file)', async () => {
    const cols = await columns();
    expect(cols['file_id']!['COLUMN_TYPE']).toBe('char(36)');
    expect(cols['file_id']!['IS_NULLABLE']).toBe('YES');
  });

  it('motion_graphic_snapshot_id CHAR(36) NULL column is added', async () => {
    const cols = await columns();
    expect(cols['motion_graphic_snapshot_id']!['COLUMN_TYPE']).toBe('char(36)');
    expect(cols['motion_graphic_snapshot_id']!['IS_NULLABLE']).toBe('YES');
  });

  it('idx_storyboard_block_media_mg_snapshot indexes the snapshot column', async () => {
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT COLUMN_NAME
         FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
          AND INDEX_NAME = 'idx_storyboard_block_media_mg_snapshot'`,
      [DB_NAME, TABLE],
    );
    expect(rows.map((r) => r['COLUMN_NAME'])).toEqual(['motion_graphic_snapshot_id']);
  });

  it('fk_storyboard_block_media_mg_snapshot → motion_graphic_block_snapshots(id) CASCADE', async () => {
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT k.REFERENCED_TABLE_NAME, k.REFERENCED_COLUMN_NAME, r.DELETE_RULE
         FROM information_schema.KEY_COLUMN_USAGE k
         JOIN information_schema.REFERENTIAL_CONSTRAINTS r
           ON r.CONSTRAINT_SCHEMA = k.TABLE_SCHEMA
          AND r.CONSTRAINT_NAME   = k.CONSTRAINT_NAME
        WHERE k.TABLE_SCHEMA = ? AND k.TABLE_NAME = ?
          AND k.CONSTRAINT_NAME = 'fk_storyboard_block_media_mg_snapshot'`,
      [DB_NAME, TABLE],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!['REFERENCED_TABLE_NAME']).toBe('motion_graphic_block_snapshots');
    expect(rows[0]!['REFERENCED_COLUMN_NAME']).toBe('id');
    expect(rows[0]!['DELETE_RULE']).toBe('CASCADE');
  });

  it('the original fk_storyboard_block_media_file → files(file_id) is preserved', async () => {
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT k.REFERENCED_TABLE_NAME, k.REFERENCED_COLUMN_NAME
         FROM information_schema.KEY_COLUMN_USAGE k
        WHERE k.TABLE_SCHEMA = ? AND k.TABLE_NAME = ?
          AND k.CONSTRAINT_NAME = 'fk_storyboard_block_media_file'`,
      [DB_NAME, TABLE],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!['REFERENCED_TABLE_NAME']).toBe('files');
    expect(rows[0]!['REFERENCED_COLUMN_NAME']).toBe('file_id');
  });

  it('is idempotent — re-running the alter is a no-op', async () => {
    await expect(runPendingMigrations()).resolves.toBeUndefined();
    const cols = await columns();
    expect(cols['motion_graphic_snapshot_id']).toBeDefined();
  });
});
