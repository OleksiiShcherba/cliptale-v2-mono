/**
 * Integration tests for migration 039 — storyboard illustration active lock.
 *
 * Requires a live MySQL instance.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql, { type Connection } from 'mysql2/promise';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_038_PATH = resolve(
  __dirname,
  '../../db/migrations/038_storyboard_scene_illustration_jobs.sql',
);
const MIGRATION_039_PATH = resolve(
  __dirname,
  '../../db/migrations/039_storyboard_scene_illustration_active_lock.sql',
);

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

beforeAll(async () => {
  conn = await mysql.createConnection(dbConfig());
  await conn.query(readFileSync(MIGRATION_038_PATH, 'utf-8'));
  await conn.query(readFileSync(MIGRATION_039_PATH, 'utf-8'));
});

afterAll(async () => {
  await conn?.end();
});

async function getColumn(columnName: string): Promise<mysql.RowDataPacket | undefined> {
  const [rows] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'storyboard_scene_illustration_jobs'
        AND COLUMN_NAME = ?`,
    [columnName],
  );
  return rows[0];
}

async function getIndexColumns(indexName: string): Promise<string[]> {
  const [rows] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT COLUMN_NAME
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'storyboard_scene_illustration_jobs'
        AND INDEX_NAME = ?
      ORDER BY SEQ_IN_INDEX ASC`,
    [indexName],
  );
  return rows.map((row) => String(row['COLUMN_NAME']));
}

describe('migration 039 — idempotency', () => {
  it('can be applied more than once', async () => {
    await expect(conn.query(readFileSync(MIGRATION_039_PATH, 'utf-8'))).resolves.not.toThrow();
  });
});

describe('migration 039 — active illustration guard', () => {
  it('adds the active lock column', async () => {
    const column = await getColumn('active_lock');

    expect(column).toBeDefined();
    expect(column!['DATA_TYPE']).toBe('tinyint');
    expect(column!['IS_NULLABLE']).toBe('YES');
  });

  it('creates a unique draft/block/active-lock index', async () => {
    await expect(
      getIndexColumns('uq_storyboard_scene_illustration_active_block'),
    ).resolves.toEqual(['draft_id', 'block_id', 'active_lock']);
  });
});
