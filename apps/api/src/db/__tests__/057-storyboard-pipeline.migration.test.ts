/**
 * Integration test — migration 057_storyboard_pipeline.sql
 *
 * RED→GREEN anchor (storyboard-generation-pipeline T1, AC-05 / AC-07 / AC-12 / AC-14,
 * ADR-0002 / ADR-0005 / ADR-0007):
 *   1. The live migration file exists at the expected path (staged 01_* promoted to 057).
 *   2. runPendingMigrations() applies it against the real localhost MySQL.
 *   3. storyboard_pipeline exists with PRIMARY KEY (draft_id).
 *   4. active_phase is ENUM(scene,reference_data,reference_image,scene_image) NOT NULL
 *      DEFAULT 'scene'.
 *   5. The four per-phase sub-state columns (scene_status, reference_data_status,
 *      reference_image_status, scene_image_status) are each
 *      ENUM(idle,running,awaiting_review,completed,cancelled,failed,skipped) — the
 *      7-value lifecycle — NOT NULL DEFAULT 'idle'.
 *   6. active_run_phase is the same 4-value phase ENUM, NULL DEFAULT NULL (active-run marker).
 *   7. version is INT UNSIGNED NOT NULL DEFAULT 1 (CAS guard).
 *   8. phase_started_at / heartbeat_at are DATETIME(3) NULL (stuck-release heartbeat).
 *   9. cost_estimate / actual_cost are DECIMAL(10,4) NULL.
 *  10. idx_storyboard_pipeline_active_heartbeat covers (active_run_phase, heartbeat_at)
 *      — the reaper / lazy-on-read stuck sweep.
 *  11. A FK fk_storyboard_pipeline_draft references generation_drafts(id) ON DELETE CASCADE.
 *  12. Re-running runPendingMigrations() is a no-op (CREATE TABLE IF NOT EXISTS guard).
 *
 * Revert: the staged down (DROP TABLE IF EXISTS storyboard_pipeline) is trivially clean;
 * it is NOT exercised here because the live runner is forward-only and dropping the table
 * while schema_migrations still records 057 would desync the shared dev DB (same reason the
 * 051 migration test asserts apply+idempotency only).
 *
 * Prerequisites: MySQL 8 running at localhost:3306, db=cliptale, pass=cliptale.
 *
 * Run: cd apps/api && APP_DB_PASSWORD=cliptale npx vitest run
 *       src/db/__tests__/057-storyboard-pipeline.migration.test.ts
 */

import fs from 'node:fs';
import path from 'node:path';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql from 'mysql2/promise';

import { MIGRATIONS_DIR, runPendingMigrations } from '@/db/migrate.js';

const MIGRATION_FILENAME = '057_storyboard_pipeline.sql';
const MIGRATION_PATH = path.join(MIGRATIONS_DIR, MIGRATION_FILENAME);

const TABLE_NAME = 'storyboard_pipeline';
const INDEX_NAME = 'idx_storyboard_pipeline_active_heartbeat';
const DB_NAME = 'cliptale';

const PHASE_ENUM = "enum('scene','reference_data','reference_image','scene_image')";
const STATUS_ENUM =
  "enum('idle','running','awaiting_review','completed','cancelled','failed','skipped')";
const STATUS_COLUMNS = [
  'scene_status',
  'reference_data_status',
  'reference_image_status',
  'scene_image_status',
];

let conn: mysql.Connection;

async function columns(): Promise<Record<string, mysql.RowDataPacket>> {
  const [rows] = await conn.execute<mysql.RowDataPacket[]>(
    `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_KEY
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [DB_NAME, TABLE_NAME],
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

describe('migration 057 — storyboard_pipeline', () => {
  it('live file exists at apps/api/src/db/migrations/057_storyboard_pipeline.sql', () => {
    expect(fs.existsSync(MIGRATION_PATH)).toBe(true);
  });

  it('runPendingMigrations() applies the migration without error', async () => {
    await expect(runPendingMigrations()).resolves.toBeUndefined();
  });

  it('storyboard_pipeline has PRIMARY KEY (draft_id)', async () => {
    const cols = await columns();
    expect(cols['draft_id']).toBeDefined();
    expect(cols['draft_id']!['COLUMN_TYPE']).toBe('char(36)');
    expect(cols['draft_id']!['COLUMN_KEY']).toBe('PRI');
  });

  it('active_phase is the 4-value phase ENUM NOT NULL DEFAULT scene', async () => {
    const cols = await columns();
    expect(cols['active_phase']!['COLUMN_TYPE']).toBe(PHASE_ENUM);
    expect(cols['active_phase']!['IS_NULLABLE']).toBe('NO');
    expect(cols['active_phase']!['COLUMN_DEFAULT']).toBe('scene');
  });

  it('the four per-phase sub-state columns are ENUM(7) NOT NULL DEFAULT idle', async () => {
    const cols = await columns();
    for (const name of STATUS_COLUMNS) {
      expect(cols[name], name).toBeDefined();
      expect(cols[name]!['COLUMN_TYPE'], name).toBe(STATUS_ENUM);
      expect(cols[name]!['IS_NULLABLE'], name).toBe('NO');
      expect(cols[name]!['COLUMN_DEFAULT'], name).toBe('idle');
    }
  });

  it('active_run_phase is the phase ENUM, NULL DEFAULT NULL (active-run marker)', async () => {
    const cols = await columns();
    expect(cols['active_run_phase']!['COLUMN_TYPE']).toBe(PHASE_ENUM);
    expect(cols['active_run_phase']!['IS_NULLABLE']).toBe('YES');
    expect(cols['active_run_phase']!['COLUMN_DEFAULT']).toBeNull();
  });

  it('version is INT UNSIGNED NOT NULL DEFAULT 1 (CAS guard)', async () => {
    const cols = await columns();
    expect(cols['version']!['COLUMN_TYPE']).toBe('int unsigned');
    expect(cols['version']!['IS_NULLABLE']).toBe('NO');
    expect(cols['version']!['COLUMN_DEFAULT']).toBe('1');
  });

  it('phase_started_at / heartbeat_at are DATETIME(3) NULL', async () => {
    const cols = await columns();
    for (const name of ['phase_started_at', 'heartbeat_at']) {
      expect(cols[name]!['COLUMN_TYPE'], name).toBe('datetime(3)');
      expect(cols[name]!['IS_NULLABLE'], name).toBe('YES');
    }
  });

  it('cost_estimate / actual_cost are DECIMAL(10,4) NULL', async () => {
    const cols = await columns();
    for (const name of ['cost_estimate', 'actual_cost']) {
      expect(cols[name]!['COLUMN_TYPE'], name).toBe('decimal(10,4)');
      expect(cols[name]!['IS_NULLABLE'], name).toBe('YES');
    }
  });

  it('idx_storyboard_pipeline_active_heartbeat covers (active_run_phase, heartbeat_at)', async () => {
    const [idx] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT COLUMN_NAME, SEQ_IN_INDEX
         FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?
        ORDER BY SEQ_IN_INDEX`,
      [DB_NAME, TABLE_NAME, INDEX_NAME],
    );
    expect(idx.map((r) => r['COLUMN_NAME'])).toEqual(['active_run_phase', 'heartbeat_at']);
  });

  it('FK fk_storyboard_pipeline_draft references generation_drafts(id) ON DELETE CASCADE', async () => {
    const [fk] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT k.REFERENCED_TABLE_NAME, k.REFERENCED_COLUMN_NAME, r.DELETE_RULE
         FROM information_schema.KEY_COLUMN_USAGE k
         JOIN information_schema.REFERENTIAL_CONSTRAINTS r
           ON r.CONSTRAINT_SCHEMA = k.TABLE_SCHEMA
          AND r.CONSTRAINT_NAME   = k.CONSTRAINT_NAME
        WHERE k.TABLE_SCHEMA = ? AND k.TABLE_NAME = ?
          AND k.CONSTRAINT_NAME = 'fk_storyboard_pipeline_draft'`,
      [DB_NAME, TABLE_NAME],
    );
    expect(fk).toHaveLength(1);
    expect(fk[0]!['REFERENCED_TABLE_NAME']).toBe('generation_drafts');
    expect(fk[0]!['REFERENCED_COLUMN_NAME']).toBe('id');
    expect(fk[0]!['DELETE_RULE']).toBe('CASCADE');
  });

  it('runPendingMigrations() is idempotent (CREATE TABLE IF NOT EXISTS makes re-run a no-op)', async () => {
    await expect(runPendingMigrations()).resolves.toBeUndefined();
    const cols = await columns();
    expect(cols['draft_id']).toBeDefined();
  });
});
