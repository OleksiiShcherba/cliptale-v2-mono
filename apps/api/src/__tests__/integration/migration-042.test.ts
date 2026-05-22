/**
 * Integration tests for migration 042 — generation draft created project pointers.
 *
 * Requires a live MySQL instance.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql, { type Connection } from 'mysql2/promise';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = resolve(
  __dirname,
  '../../db/migrations/042_generation_draft_created_project.sql',
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
  await conn.query(readFileSync(MIGRATION_PATH, 'utf-8'));
});

afterAll(async () => {
  await conn?.end();
});

async function getColumn(columnName: string): Promise<mysql.RowDataPacket | undefined> {
  const [rows] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'generation_drafts'
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
        AND TABLE_NAME = 'generation_drafts'
        AND INDEX_NAME = ?
      ORDER BY SEQ_IN_INDEX ASC`,
    [indexName],
  );
  return rows.map((row) => String(row['COLUMN_NAME']));
}

describe('migration 042 — idempotency', () => {
  it('can be applied more than once', async () => {
    await expect(conn.query(readFileSync(MIGRATION_PATH, 'utf-8'))).resolves.not.toThrow();
  });
});

describe('migration 042 — created project pointers', () => {
  it('adds nullable created_project_id', async () => {
    const column = await getColumn('created_project_id');

    expect(column).toBeDefined();
    expect(column!['DATA_TYPE']).toBe('char');
    expect(column!['IS_NULLABLE']).toBe('YES');
  });

  it('adds nullable created_project_version_id', async () => {
    const column = await getColumn('created_project_version_id');

    expect(column).toBeDefined();
    expect(column!['DATA_TYPE']).toBe('bigint');
    expect(column!['COLUMN_TYPE']).toContain('unsigned');
    expect(column!['IS_NULLABLE']).toBe('YES');
  });

  it('creates an index for created project lookup', async () => {
    await expect(
      getIndexColumns('idx_generation_drafts_created_project'),
    ).resolves.toEqual(['created_project_id']);
  });
});
