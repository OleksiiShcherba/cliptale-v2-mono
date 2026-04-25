/**
 * Integration tests for the migration runner against a live MySQL instance.
 *
 * Requires Docker Compose db service to be running.
 * Run: APP_DB_PASSWORD=cliptale vitest run src/__tests__/integration/migrate.integration.test.ts
 *
 * These tests run against a live DB that already has the full schema applied
 * (from a prior docker-entrypoint-initdb.d boot or from the runner itself).
 * They pre-seed schema_migrations to simulate a "fully applied" state so we
 * can test the three live paths without re-running DDL that is not idempotent.
 *
 * Covers:
 *   1. All-applied path — every migration file is in schema_migrations with correct
 *      checksums; schema_migrations row count equals the file count on disk.
 *   2. Re-run path — calling runPendingMigrations() with a fully-applied state
 *      is a no-op (no new rows, no DDL executed).
 *   3. Checksum-drift detection — writing a wrong checksum and calling
 *      runPendingMigrations() throws MigrationChecksumMismatchError naming the
 *      drifted file; does not silently skip.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql, { type Connection } from 'mysql2/promise';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  runPendingMigrations,
  MigrationChecksumMismatchError,
  computeChecksum,
  sortedMigrationFiles,
  MIGRATIONS_DIR,
} from '@/db/migrate.js';
import { pool } from '@/db/connection.js';

// ── Connection helpers ─────────────────────────────────────────────────────────

function dbConfig() {
  return {
    host: process.env['APP_DB_HOST'] ?? 'localhost',
    port: Number(process.env['APP_DB_PORT'] ?? 3306),
    database: process.env['APP_DB_NAME'] ?? 'cliptale',
    user: process.env['APP_DB_USER'] ?? 'cliptale',
    password: process.env['APP_DB_PASSWORD'] ?? 'cliptale',
    multipleStatements: true,
  };
}

let conn: Connection;

/** Pre-seeds schema_migrations with correct checksums for every migration file. */
async function seedAllMigrations(c: Connection): Promise<void> {
  const allFiles = sortedMigrationFiles(MIGRATIONS_DIR);
  for (const filename of allFiles) {
    const content = readFileSync(join(MIGRATIONS_DIR, filename), 'utf8');
    const checksum = computeChecksum(content);
    await c.execute(
      'INSERT IGNORE INTO schema_migrations (filename, checksum) VALUES (?, ?)',
      [filename, checksum],
    );
  }
}

beforeAll(async () => {
  conn = await mysql.createConnection(dbConfig());

  // Ensure the bookkeeping table exists before we try to write to it.
  await conn.execute(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      filename    VARCHAR(255) PRIMARY KEY,
      checksum    CHAR(64)     NOT NULL,
      applied_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  );

  // Guard: before seeding schema_migrations as "all applied", verify the
  // actual live schema is in the correct post-migration state. The
  // migration-014 test drops+recreates ai_generation_jobs with the OLD schema,
  // which can leave the live DB broken if this beforeAll runs after that test.
  //
  // If the schema_migrations rows for post-014 migrations are present but the
  // actual DDL columns are missing, it means they were registered without their
  // DDL running. Delete those stale rows and run the migration runner first so
  // the real DDL applies, restoring the correct schema before we proceed with
  // the test-specific seeding below.
  const [capabilityRows] = await conn.execute<mysql.RowDataPacket[]>(
    `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = 'ai_generation_jobs'
        AND COLUMN_NAME  = 'capability'`,
  );
  const capabilityType = (capabilityRows[0] as { COLUMN_TYPE?: string } | undefined)?.COLUMN_TYPE ?? '';
  const schemaIsBroken = !capabilityType.includes('text_to_speech');

  if (schemaIsBroken) {
    // The schema was broken by migration-014.test.ts (which drops+recreates
    // ai_generation_jobs with the old 010/012/014 shape). The migration-014
    // afterAll should have repaired the schema, but if it ran concurrently or
    // partially failed, we repair here by directly applying the idempotent DDL
    // for the migrations that touch ai_generation_jobs and project_assets_current.
    // We do NOT try to re-run migrations 016/017/018/019/020/021/022 because:
    // - They don't touch ai_generation_jobs
    // - Migration 017 is not idempotent (plain ADD COLUMN without IF NOT EXISTS)
    // - project_assets_current was already dropped by migration 024
    const repairSqlFiles = [
      join(MIGRATIONS_DIR, '015_ai_jobs_audio_capabilities.sql'),
      join(MIGRATIONS_DIR, '023_downstream_file_id_columns.sql'),
      join(MIGRATIONS_DIR, '024_backfill_file_ids.sql'),
      join(MIGRATIONS_DIR, '025_drop_ai_job_project_id.sql'),
      join(MIGRATIONS_DIR, '026_ai_jobs_draft_id.sql'),
      join(MIGRATIONS_DIR, '027_drop_project_assets_current.sql'),
    ];
    for (const filePath of repairSqlFiles) {
      await conn.query(readFileSync(filePath, 'utf8'));
    }
    // Ensure schema_migrations entries for files 015–027 are present and correct.
    const allMigFiles = sortedMigrationFiles(MIGRATIONS_DIR);
    for (const filename of allMigFiles) {
      const num = parseInt(filename.split('_')[0]!, 10);
      if (num < 15) continue;
      const content = readFileSync(join(MIGRATIONS_DIR, filename), 'utf8');
      const checksum = computeChecksum(content);
      await conn.query(
        `INSERT INTO schema_migrations (filename, checksum)
           VALUES (?, ?)
           ON DUPLICATE KEY UPDATE checksum = VALUES(checksum)`,
        [filename, checksum],
      );
    }
  }

  // Seed all migration files as already applied (simulates a drifted volume
  // where the schema exists but schema_migrations was empty).
  await conn.execute('DELETE FROM schema_migrations');
  await seedAllMigrations(conn);
});

afterAll(async () => {
  await conn?.end();
  await pool.end();
});

// ── Helper ─────────────────────────────────────────────────────────────────────

async function fetchAppliedSet(c: Connection): Promise<Map<string, string>> {
  const [rows] = await c.execute<
    Array<{ filename: string; checksum: string } & mysql.RowDataPacket>
  >('SELECT filename, checksum FROM schema_migrations ORDER BY filename');
  return new Map(rows.map((r) => [r.filename, r.checksum]));
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('runPendingMigrations — integration', () => {
  it('1. all-applied path: schema_migrations contains one row per migration file with correct checksums', async () => {
    const applied = await fetchAppliedSet(conn);
    const allFiles = sortedMigrationFiles(MIGRATIONS_DIR);

    // Every file on disk must have a row in schema_migrations.
    for (const filename of allFiles) {
      expect(applied.has(filename), `Expected ${filename} in schema_migrations`).toBe(true);
    }

    // Each stored checksum must match the current file content.
    for (const filename of allFiles) {
      const content = readFileSync(join(MIGRATIONS_DIR, filename), 'utf8');
      const expected = computeChecksum(content);
      expect(applied.get(filename), `Checksum mismatch for ${filename}`).toBe(expected);
    }
  });

  it('2. re-run path: runPendingMigrations() with fully-applied state is a no-op', async () => {
    const [beforeRows] = await conn.execute<mysql.RowDataPacket[]>(
      'SELECT COUNT(*) AS cnt FROM schema_migrations',
    );
    const countBefore: number = (beforeRows[0] as { cnt: number }).cnt;

    await runPendingMigrations();

    const [afterRows] = await conn.execute<mysql.RowDataPacket[]>(
      'SELECT COUNT(*) AS cnt FROM schema_migrations',
    );
    const countAfter: number = (afterRows[0] as { cnt: number }).cnt;

    expect(countAfter).toBe(countBefore);
  });

  it('3. checksum-drift: tampered applied row throws MigrationChecksumMismatchError', async () => {
    // Pick the first non-bootstrap migration as the tampered file.
    const allFiles = sortedMigrationFiles(MIGRATIONS_DIR);
    const target = allFiles.find((f) => f !== '000_schema_migrations.sql')!;
    expect(target).toBeDefined();

    // Overwrite its stored checksum with a deliberately wrong value.
    await conn.execute(
      'UPDATE schema_migrations SET checksum = ? WHERE filename = ?',
      ['a'.repeat(64), target],
    );

    await expect(runPendingMigrations()).rejects.toThrow(MigrationChecksumMismatchError);
    await expect(runPendingMigrations()).rejects.toThrow(target);

    // Restore the correct checksum so subsequent tests remain clean.
    const content = readFileSync(join(MIGRATIONS_DIR, target), 'utf8');
    const correct = computeChecksum(content);
    await conn.execute(
      'UPDATE schema_migrations SET checksum = ? WHERE filename = ?',
      [correct, target],
    );
  });
});
