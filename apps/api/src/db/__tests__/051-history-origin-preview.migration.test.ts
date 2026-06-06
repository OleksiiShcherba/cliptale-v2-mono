/**
 * Integration test — migration 051_add_history_origin_preview.sql
 *
 * RED→GREEN anchor (storyboard-autosave-checkpoints T2, AC-08 / AC-04, ADR-0003):
 *   1. The live migration file exists at the expected path.
 *   2. runPendingMigrations() applies it against the real localhost MySQL.
 *   3. storyboard_history gains:
 *      - origin ENUM('legacy','checkpoint') NOT NULL DEFAULT 'legacy'
 *      - preview_kind ENUM('screenshot','minimap') NULL DEFAULT NULL
 *   4. A row inserted without origin/preview_kind reads origin='legacy',
 *      preview_kind NULL — the DEFAULT that "backfills" all pre-existing rows.
 *   5. idx_storyboard_history_draft_origin (draft_id, origin, id) exists and the
 *      History-panel query (WHERE draft_id=? AND origin='checkpoint'
 *      ORDER BY id DESC LIMIT 50) EXPLAIN-uses it.
 *   6. Re-running runPendingMigrations() is a no-op (INFORMATION_SCHEMA guards).
 *
 * The ALTERs are INSTANT-capable (ADD COLUMN with DEFAULT, MySQL 8) — asserted
 * by design in the migration file, not re-verified here (no reliable post-hoc
 * introspection of the algorithm used).
 *
 * Prerequisites: MySQL 8 running at localhost:3306, db=cliptale, pass=cliptale.
 *
 * Run: cd apps/api && APP_DB_PASSWORD=cliptale npx vitest run
 *       src/db/__tests__/051-history-origin-preview.migration.test.ts
 */

import fs from 'node:fs';
import path from 'node:path';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql from 'mysql2/promise';

import { MIGRATIONS_DIR, runPendingMigrations } from '@/db/migrate.js';

const MIGRATION_FILENAME = '051_add_history_origin_preview.sql';
const MIGRATION_PATH = path.join(MIGRATIONS_DIR, MIGRATION_FILENAME);

const TABLE_NAME = 'storyboard_history';
const INDEX_NAME = 'idx_storyboard_history_draft_origin';
const DB_NAME = 'cliptale';

/** Throwaway draft id for the default-value + EXPLAIN checks (no FK on draft_id). */
const TEST_DRAFT_ID = '00000000-0000-4000-8000-t2origin0051';

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
  await conn.execute('DELETE FROM storyboard_history WHERE draft_id = ?', [TEST_DRAFT_ID]);
  await conn.end();
});

describe('migration 051 — storyboard_history origin/preview_kind', () => {
  it('live file exists at apps/api/src/db/migrations/051_add_history_origin_preview.sql', () => {
    expect(fs.existsSync(MIGRATION_PATH)).toBe(true);
  });

  it('runPendingMigrations() applies the migration without error', async () => {
    await expect(runPendingMigrations()).resolves.toBeUndefined();
  });

  it('origin is ENUM(legacy,checkpoint) NOT NULL DEFAULT legacy; preview_kind is ENUM(screenshot,minimap) NULL', async () => {
    const [cols] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ?
          AND TABLE_NAME   = ?
          AND COLUMN_NAME IN ('origin', 'preview_kind')`,
      [DB_NAME, TABLE_NAME],
    );
    const byName = Object.fromEntries(cols.map((c) => [c['COLUMN_NAME'], c]));

    expect(byName['origin']!['COLUMN_TYPE']).toBe("enum('legacy','checkpoint')");
    expect(byName['origin']!['IS_NULLABLE']).toBe('NO');
    expect(byName['origin']!['COLUMN_DEFAULT']).toBe('legacy');

    expect(byName['preview_kind']!['COLUMN_TYPE']).toBe("enum('screenshot','minimap')");
    expect(byName['preview_kind']!['IS_NULLABLE']).toBe('YES');
    expect(byName['preview_kind']!['COLUMN_DEFAULT']).toBeNull();
  });

  it('a row inserted without origin/preview_kind reads origin=legacy, preview_kind NULL', async () => {
    await conn.execute(
      `INSERT INTO storyboard_history (draft_id, snapshot) VALUES (?, JSON_OBJECT())`,
      [TEST_DRAFT_ID],
    );
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT origin, preview_kind FROM storyboard_history WHERE draft_id = ?`,
      [TEST_DRAFT_ID],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!['origin']).toBe('legacy');
    expect(rows[0]!['preview_kind']).toBeNull();
  });

  it('idx_storyboard_history_draft_origin covers (draft_id, origin, id)', async () => {
    const [idx] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT COLUMN_NAME, SEQ_IN_INDEX
         FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = ?
          AND TABLE_NAME   = ?
          AND INDEX_NAME   = ?
        ORDER BY SEQ_IN_INDEX`,
      [DB_NAME, TABLE_NAME, INDEX_NAME],
    );
    expect(idx.map((r) => r['COLUMN_NAME'])).toEqual(['draft_id', 'origin', 'id']);
  });

  it('History-panel query EXPLAIN uses idx_storyboard_history_draft_origin', async () => {
    // Seed a realistic mixed-origin history (50 checkpoint + 10 legacy rows) so
    // the optimizer has real statistics — on a near-empty table it may pick the
    // older idx_storyboard_history_draft_created arbitrarily.
    const values: string[] = [];
    for (let i = 0; i < 60; i++) {
      const origin = i % 6 === 0 ? 'legacy' : 'checkpoint';
      const previewKind = origin === 'checkpoint' ? "'screenshot'" : 'NULL';
      values.push(`('${TEST_DRAFT_ID}', JSON_OBJECT(), '${origin}', ${previewKind})`);
    }
    await conn.query(
      `INSERT INTO storyboard_history (draft_id, snapshot, origin, preview_kind)
       VALUES ${values.join(', ')}`,
    );
    await conn.query('ANALYZE TABLE storyboard_history');

    const [plan] = await conn.execute<mysql.RowDataPacket[]>(
      `EXPLAIN SELECT id, snapshot, preview_kind, created_at
         FROM storyboard_history
        WHERE draft_id = ? AND origin = 'checkpoint'
        ORDER BY id DESC
        LIMIT 50`,
      [TEST_DRAFT_ID],
    );
    expect(plan.length).toBeGreaterThan(0);
    expect(plan[0]!['key']).toBe(INDEX_NAME);
  });

  it('runPendingMigrations() is idempotent (guards make re-run a no-op)', async () => {
    await expect(runPendingMigrations()).resolves.toBeUndefined();
    const [cols] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT COLUMN_NAME
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ?
          AND TABLE_NAME   = ?
          AND COLUMN_NAME IN ('origin', 'preview_kind')`,
      [DB_NAME, TABLE_NAME],
    );
    expect(cols).toHaveLength(2);
  });
});
