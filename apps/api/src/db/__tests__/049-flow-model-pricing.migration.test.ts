/**
 * Integration test — migration 049_create_flow_model_pricing.sql
 *
 * RED→GREEN anchor (U3a, ADR-0008 / AC-20):
 *   1. The live migration file exists at the expected path.
 *   2. runPendingMigrations() applies it against the real localhost MySQL.
 *   3. The table `flow_model_pricing` exists in information_schema.
 *   4. PK is `model_id`; `base_amount` is DECIMAL(10,4) NOT NULL; `resolution_mult` is JSON NULL.
 *   5. Seeded with all 14 FLOW_PRICE_TABLE rows (base_amount = the flat price, factors NULL).
 *   6. Re-running runPendingMigrations() is a no-op (idempotent; seed uses INSERT IGNORE).
 *
 * Prerequisites: MySQL 8 running at localhost:3306, db=cliptale, pass=cliptale.
 *
 * Run: cd apps/api && APP_DB_PASSWORD=cliptale npx vitest run
 *       src/db/__tests__/049-flow-model-pricing.migration.test.ts
 */

import fs from 'node:fs';
import path from 'node:path';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql from 'mysql2/promise';

import { MIGRATIONS_DIR, runPendingMigrations } from '@/db/migrate.js';

const MIGRATION_FILENAME = '049_create_flow_model_pricing.sql';
const MIGRATION_PATH = path.join(MIGRATIONS_DIR, MIGRATION_FILENAME);

const TABLE_NAME = 'flow_model_pricing';
const DB_NAME = 'cliptale';

/** One spot-check row: the most expensive seeded model keeps its flat price as base. */
const SPOT_MODEL_ID = 'fal-ai/kling-video/v2.5-turbo/pro/text-to-video';
const SPOT_BASE_AMOUNT = '0.4500';
const SEED_ROW_COUNT = 14;

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

describe('migration 049 — flow_model_pricing', () => {
  it('live file exists at apps/api/src/db/migrations/049_create_flow_model_pricing.sql', () => {
    expect(fs.existsSync(MIGRATION_PATH)).toBe(true);
  });

  it('runPendingMigrations() applies the migration without error', async () => {
    await expect(runPendingMigrations()).resolves.toBeUndefined();
  });

  it('table flow_model_pricing exists in information_schema', async () => {
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

  it('PK is model_id; base_amount DECIMAL(10,4) NOT NULL; resolution_mult JSON NULL', async () => {
    const [pkRows] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT COLUMN_NAME
         FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA    = ?
          AND TABLE_NAME      = ?
          AND CONSTRAINT_NAME = 'PRIMARY'`,
      [DB_NAME, TABLE_NAME],
    );
    expect(pkRows).toHaveLength(1);
    expect(pkRows[0]!['COLUMN_NAME']).toBe('model_id');

    const [cols] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, DATA_TYPE
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ?
          AND TABLE_NAME   = ?
          AND COLUMN_NAME IN ('base_amount', 'per_second', 'per_image', 'resolution_mult')`,
      [DB_NAME, TABLE_NAME],
    );
    const byName = Object.fromEntries(cols.map((c) => [c['COLUMN_NAME'], c]));
    expect(byName['base_amount']!['COLUMN_TYPE']).toBe('decimal(10,4)');
    expect(byName['base_amount']!['IS_NULLABLE']).toBe('NO');
    expect(byName['per_second']!['COLUMN_TYPE']).toBe('decimal(10,6)');
    expect(byName['per_second']!['IS_NULLABLE']).toBe('YES');
    expect(byName['per_image']!['IS_NULLABLE']).toBe('YES');
    expect(byName['resolution_mult']!['DATA_TYPE']).toBe('json');
    expect(byName['resolution_mult']!['IS_NULLABLE']).toBe('YES');
  });

  it('seeded with all 14 FLOW_PRICE_TABLE rows, factors NULL', async () => {
    const [countRows] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM ${TABLE_NAME}`,
    );
    expect(Number(countRows[0]!['n'])).toBe(SEED_ROW_COUNT);

    const [spot] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT base_amount, currency, per_second, per_image, resolution_mult
         FROM ${TABLE_NAME}
        WHERE model_id = ?`,
      [SPOT_MODEL_ID],
    );
    expect(spot).toHaveLength(1);
    expect(String(spot[0]!['base_amount'])).toBe(SPOT_BASE_AMOUNT);
    expect(spot[0]!['currency']).toBe('USD');
    expect(spot[0]!['per_second']).toBeNull();
    expect(spot[0]!['per_image']).toBeNull();
    expect(spot[0]!['resolution_mult']).toBeNull();
  });

  it('runPendingMigrations() is idempotent (no-op on re-run; INSERT IGNORE seed)', async () => {
    await expect(runPendingMigrations()).resolves.toBeUndefined();
    const [countRows] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM ${TABLE_NAME}`,
    );
    expect(Number(countRows[0]!['n'])).toBe(SEED_ROW_COUNT);
  });
});
