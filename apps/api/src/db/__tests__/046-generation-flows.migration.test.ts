/**
 * Integration test — migration 046_create_generation_flows.sql
 *
 * RED→GREEN anchor (T1):
 *   1. The live migration file exists at the expected path.
 *   2. runPendingMigrations() applies it against the real localhost MySQL.
 *   3. The table `generation_flows` exists in information_schema.
 *   4. The index `idx_generation_flows_user_active_updated` exists.
 *   5. Re-running runPendingMigrations() is a no-op (idempotent).
 *
 * Prerequisites: MySQL 8 running at localhost:3306, db=cliptale, pass=cliptale.
 * Migrations 001–045 must already be applied (live infra baseline).
 *
 * Run: cd apps/api && APP_DB_PASSWORD=cliptale npx vitest run
 *       src/db/__tests__/046-generation-flows.migration.test.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql from 'mysql2/promise';

import { MIGRATIONS_DIR, runPendingMigrations } from '@/db/migrate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MIGRATION_FILENAME = '046_create_generation_flows.sql';
const MIGRATION_PATH = path.join(MIGRATIONS_DIR, MIGRATION_FILENAME);

const TABLE_NAME = 'generation_flows';
const INDEX_NAME = 'idx_generation_flows_user_active_updated';
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

describe('migration 046 — generation_flows', () => {
  it('live file exists at apps/api/src/db/migrations/046_create_generation_flows.sql', () => {
    expect(fs.existsSync(MIGRATION_PATH)).toBe(true);
  });

  it('runPendingMigrations() applies the migration without error', async () => {
    await expect(runPendingMigrations()).resolves.toBeUndefined();
  });

  it('table generation_flows exists in information_schema', async () => {
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

  it('index idx_generation_flows_user_active_updated exists in information_schema', async () => {
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
