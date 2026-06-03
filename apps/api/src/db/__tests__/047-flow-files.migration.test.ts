/**
 * Integration test — migration 047_create_flow_files.sql
 *
 * RED→GREEN anchor (T2):
 *   1. The live migration file exists at the expected path.
 *   2. runPendingMigrations() applies it against the real localhost MySQL.
 *   3. The table `flow_files` exists in information_schema.
 *   4. FK fk_flow_files_flow → generation_flows uses ON DELETE CASCADE.
 *   5. FK fk_flow_files_file → files uses ON DELETE RESTRICT.
 *   6. The index `idx_flow_files_file` exists.
 *   7. Re-running runPendingMigrations() is a no-op (idempotent).
 *
 * Prerequisites: MySQL 8 running at localhost:3306, db=cliptale, pass=cliptale.
 * Migrations 001–046 must already be applied (migration 046 creates generation_flows,
 * which flow_files references).
 *
 * Run: cd apps/api && APP_DB_PASSWORD=cliptale npx vitest run
 *       src/db/__tests__/047-flow-files.migration.test.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql from 'mysql2/promise';

import { MIGRATIONS_DIR, runPendingMigrations } from '@/db/migrate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MIGRATION_FILENAME = '047_create_flow_files.sql';
const MIGRATION_PATH = path.join(MIGRATIONS_DIR, MIGRATION_FILENAME);

const TABLE_NAME = 'flow_files';
const INDEX_NAME = 'idx_flow_files_file';
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

describe('migration 047 — flow_files', () => {
  it('live file exists at apps/api/src/db/migrations/047_create_flow_files.sql', () => {
    expect(fs.existsSync(MIGRATION_PATH)).toBe(true);
  });

  it('runPendingMigrations() applies the migration without error', async () => {
    await expect(runPendingMigrations()).resolves.toBeUndefined();
  });

  it('table flow_files exists in information_schema', async () => {
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

  it('FK fk_flow_files_flow → generation_flows uses ON DELETE CASCADE', async () => {
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT DELETE_RULE
         FROM information_schema.REFERENTIAL_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = ?
          AND CONSTRAINT_NAME   = 'fk_flow_files_flow'`,
      [DB_NAME],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!['DELETE_RULE']).toBe('CASCADE');
  });

  it('FK fk_flow_files_file → files uses ON DELETE RESTRICT', async () => {
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT DELETE_RULE
         FROM information_schema.REFERENTIAL_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = ?
          AND CONSTRAINT_NAME   = 'fk_flow_files_file'`,
      [DB_NAME],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!['DELETE_RULE']).toBe('RESTRICT');
  });

  it('index idx_flow_files_file exists in information_schema', async () => {
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
