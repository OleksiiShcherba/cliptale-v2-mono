/**
 * Integration test — migration 048_add_flow_columns_to_ai_generation_jobs.sql
 *
 * RED→GREEN anchor (T3 / AC-08b):
 *   1. The live migration file exists at the expected path.
 *   2. runPendingMigrations() applies it against the real localhost MySQL.
 *   3. Column `flow_id` is present on `ai_generation_jobs`, is NULLABLE, has no FK.
 *   4. Column `block_id` is present on `ai_generation_jobs`, is NULLABLE, has no FK.
 *   5. Index `idx_ai_generation_jobs_flow_id` exists.
 *   6. Re-running runPendingMigrations() is a no-op (idempotent).
 *
 * Prerequisites: MySQL 8 running at localhost:3306, db=cliptale, pass=cliptale.
 * Migrations 001–047 must already be applied (live infra baseline).
 *
 * Run: cd apps/api && APP_DB_PASSWORD=cliptale npx vitest run
 *       src/db/__tests__/048-add-flow-columns-to-ai-generation-jobs.migration.test.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql from 'mysql2/promise';

import { MIGRATIONS_DIR, runPendingMigrations } from '@/db/migrate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MIGRATION_FILENAME = '048_add_flow_columns_to_ai_generation_jobs.sql';
const MIGRATION_PATH = path.join(MIGRATIONS_DIR, MIGRATION_FILENAME);

const TABLE_NAME = 'ai_generation_jobs';
const INDEX_NAME = 'idx_ai_generation_jobs_flow_id';
const DB_NAME = 'cliptale';

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
  await conn.end();
});

describe('migration 048 — ai_generation_jobs flow columns', () => {
  it('live file exists at apps/api/src/db/migrations/048_add_flow_columns_to_ai_generation_jobs.sql', () => {
    expect(fs.existsSync(MIGRATION_PATH)).toBe(true);
  });

  it('runPendingMigrations() applies the migration without error', async () => {
    await expect(runPendingMigrations()).resolves.toBeUndefined();
  });

  it('column flow_id is present and NULLABLE on ai_generation_jobs', async () => {
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT COLUMN_NAME, IS_NULLABLE, DATA_TYPE
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ?
          AND TABLE_NAME   = ?
          AND COLUMN_NAME  = 'flow_id'`,
      [DB_NAME, TABLE_NAME],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!['COLUMN_NAME']).toBe('flow_id');
    expect(rows[0]!['IS_NULLABLE']).toBe('YES');
  });

  it('column block_id is present and NULLABLE on ai_generation_jobs', async () => {
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT COLUMN_NAME, IS_NULLABLE, DATA_TYPE
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ?
          AND TABLE_NAME   = ?
          AND COLUMN_NAME  = 'block_id'`,
      [DB_NAME, TABLE_NAME],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!['COLUMN_NAME']).toBe('block_id');
    expect(rows[0]!['IS_NULLABLE']).toBe('YES');
  });

  it('flow_id has no foreign key constraint', async () => {
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT kcu.CONSTRAINT_NAME
         FROM information_schema.KEY_COLUMN_USAGE kcu
         JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
           ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
          AND rc.CONSTRAINT_NAME   = kcu.CONSTRAINT_NAME
        WHERE kcu.TABLE_SCHEMA  = ?
          AND kcu.TABLE_NAME    = ?
          AND kcu.COLUMN_NAME   = 'flow_id'`,
      [DB_NAME, TABLE_NAME],
    );
    expect(rows).toHaveLength(0);
  });

  it('block_id has no foreign key constraint', async () => {
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT kcu.CONSTRAINT_NAME
         FROM information_schema.KEY_COLUMN_USAGE kcu
         JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
           ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
          AND rc.CONSTRAINT_NAME   = kcu.CONSTRAINT_NAME
        WHERE kcu.TABLE_SCHEMA  = ?
          AND kcu.TABLE_NAME    = ?
          AND kcu.COLUMN_NAME   = 'block_id'`,
      [DB_NAME, TABLE_NAME],
    );
    expect(rows).toHaveLength(0);
  });

  it('index idx_ai_generation_jobs_flow_id exists in information_schema', async () => {
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT INDEX_NAME
         FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = ?
          AND TABLE_NAME   = ?
          AND INDEX_NAME   = ?
        LIMIT 1`,
      [DB_NAME, TABLE_NAME, INDEX_NAME],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!['INDEX_NAME']).toBe(INDEX_NAME);
  });

  it('runPendingMigrations() is idempotent (no-op on re-run)', async () => {
    // Second run must succeed without throwing or inserting duplicates.
    await expect(runPendingMigrations()).resolves.toBeUndefined();
  });
});
