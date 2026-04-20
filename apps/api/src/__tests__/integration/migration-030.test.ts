/**
 * Integration tests for migration 030 — files_thumbnail_uri.
 *
 * Verifies:
 *   - `thumbnail_uri VARCHAR(1024) NULL` column exists on the `files` table.
 *   - The column is nullable.
 *   - The column has the correct character maximum length (1024).
 *   - The column defaults to NULL.
 *   - The migration is idempotent (safe to run twice without error).
 *
 * Requires a live MySQL instance. Uses APP_DB_* env vars with docker-compose
 * defaults as fallbacks so the test runs out-of-the-box after `docker compose up`.
 *
 * Run:
 *   APP_DB_PASSWORD=cliptale vitest run src/__tests__/integration/migration-030.test.ts
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql, { type Connection } from 'mysql2/promise';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MIGRATION_PATH = resolve(
  __dirname,
  '../../db/migrations/030_files_thumbnail_uri.sql',
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
  // Apply the migration (idempotent — safe to run on an existing DB).
  const sql = readFileSync(MIGRATION_PATH, 'utf-8');
  await conn.query(sql);
});

afterAll(async () => {
  await conn?.end();
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/**
 * Returns the INFORMATION_SCHEMA.COLUMNS row for a given table + column, or
 * undefined if the column does not exist.
 */
async function getColumn(
  connection: Connection,
  tableName: string,
  columnName: string,
): Promise<mysql.RowDataPacket | undefined> {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT,
            CHARACTER_MAXIMUM_LENGTH
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = ?
        AND COLUMN_NAME  = ?`,
    [tableName, columnName],
  );
  return rows[0];
}

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

describe('migration 030 — idempotency', () => {
  it('should be idempotent — re-running the migration does not throw', async () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf-8');
    await expect(conn.query(sql)).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// files.thumbnail_uri — column shape
// ---------------------------------------------------------------------------

describe('migration 030 — files.thumbnail_uri column shape', () => {
  it('should exist on the files table', async () => {
    const col = await getColumn(conn, 'files', 'thumbnail_uri');
    expect(col).toBeDefined();
  });

  it('should have VARCHAR data type', async () => {
    const col = await getColumn(conn, 'files', 'thumbnail_uri');
    expect(col!['DATA_TYPE']).toBe('varchar');
  });

  it('should have CHARACTER_MAXIMUM_LENGTH of 1024', async () => {
    const col = await getColumn(conn, 'files', 'thumbnail_uri');
    expect(Number(col!['CHARACTER_MAXIMUM_LENGTH'])).toBe(1024);
  });

  it('should be nullable', async () => {
    const col = await getColumn(conn, 'files', 'thumbnail_uri');
    expect(col!['IS_NULLABLE']).toBe('YES');
  });

  it('should default to NULL', async () => {
    const col = await getColumn(conn, 'files', 'thumbnail_uri');
    expect(col!['COLUMN_DEFAULT']).toBeNull();
  });
});
