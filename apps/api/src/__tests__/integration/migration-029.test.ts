/**
 * Integration tests for migration 029 — soft_delete_columns.
 *
 * Verifies:
 *   - `deleted_at DATETIME(3) NULL` exists on all five tables:
 *     files, projects, generation_drafts, project_files, draft_files.
 *   - Indexes idx_files_deleted_at and idx_projects_deleted_at are present.
 *   - The migration is idempotent (safe to run twice without error).
 *
 * Requires a live MySQL instance. Uses APP_DB_* env vars with docker-compose
 * defaults as fallbacks so the test runs out-of-the-box after `docker compose up`.
 *
 * Run:
 *   APP_DB_PASSWORD=cliptale vitest run src/__tests__/integration/migration-029.test.ts
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql, { type Connection } from 'mysql2/promise';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MIGRATION_PATH = resolve(
  __dirname,
  '../../db/migrations/029_soft_delete_columns.sql',
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
// Idempotency
// ---------------------------------------------------------------------------

describe('migration 029 — idempotency', () => {
  it('should be idempotent — re-running the migration does not throw', async () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf-8');
    await expect(conn.query(sql)).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Helpers
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
    `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = ?
        AND COLUMN_NAME  = ?`,
    [tableName, columnName],
  );
  return rows[0];
}

/**
 * Returns true if an index with the given name exists on the given table.
 */
async function indexExists(
  connection: Connection,
  tableName: string,
  indexName: string,
): Promise<boolean> {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = ?
        AND INDEX_NAME   = ?`,
    [tableName, indexName],
  );
  return (rows[0]!['cnt'] as number) > 0;
}

// ---------------------------------------------------------------------------
// files.deleted_at
// ---------------------------------------------------------------------------

describe('migration 029 — files.deleted_at', () => {
  it('should exist with DATETIME type and be nullable', async () => {
    const col = await getColumn(conn, 'files', 'deleted_at');
    expect(col).toBeDefined();
    expect(col!['DATA_TYPE']).toBe('datetime');
    expect(col!['IS_NULLABLE']).toBe('YES');
  });

  it('should default to NULL', async () => {
    const col = await getColumn(conn, 'files', 'deleted_at');
    expect(col!['COLUMN_DEFAULT']).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// projects.deleted_at
// ---------------------------------------------------------------------------

describe('migration 029 — projects.deleted_at', () => {
  it('should exist with DATETIME type and be nullable', async () => {
    const col = await getColumn(conn, 'projects', 'deleted_at');
    expect(col).toBeDefined();
    expect(col!['DATA_TYPE']).toBe('datetime');
    expect(col!['IS_NULLABLE']).toBe('YES');
  });

  it('should default to NULL', async () => {
    const col = await getColumn(conn, 'projects', 'deleted_at');
    expect(col!['COLUMN_DEFAULT']).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// generation_drafts.deleted_at
// ---------------------------------------------------------------------------

describe('migration 029 — generation_drafts.deleted_at', () => {
  it('should exist with DATETIME type and be nullable', async () => {
    const col = await getColumn(conn, 'generation_drafts', 'deleted_at');
    expect(col).toBeDefined();
    expect(col!['DATA_TYPE']).toBe('datetime');
    expect(col!['IS_NULLABLE']).toBe('YES');
  });

  it('should default to NULL', async () => {
    const col = await getColumn(conn, 'generation_drafts', 'deleted_at');
    expect(col!['COLUMN_DEFAULT']).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// project_files.deleted_at
// ---------------------------------------------------------------------------

describe('migration 029 — project_files.deleted_at', () => {
  it('should exist with DATETIME type and be nullable', async () => {
    const col = await getColumn(conn, 'project_files', 'deleted_at');
    expect(col).toBeDefined();
    expect(col!['DATA_TYPE']).toBe('datetime');
    expect(col!['IS_NULLABLE']).toBe('YES');
  });

  it('should default to NULL', async () => {
    const col = await getColumn(conn, 'project_files', 'deleted_at');
    expect(col!['COLUMN_DEFAULT']).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// draft_files.deleted_at
// ---------------------------------------------------------------------------

describe('migration 029 — draft_files.deleted_at', () => {
  it('should exist with DATETIME type and be nullable', async () => {
    const col = await getColumn(conn, 'draft_files', 'deleted_at');
    expect(col).toBeDefined();
    expect(col!['DATA_TYPE']).toBe('datetime');
    expect(col!['IS_NULLABLE']).toBe('YES');
  });

  it('should default to NULL', async () => {
    const col = await getColumn(conn, 'draft_files', 'deleted_at');
    expect(col!['COLUMN_DEFAULT']).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

describe('migration 029 — indexes', () => {
  it('should create idx_files_deleted_at on files(deleted_at)', async () => {
    const exists = await indexExists(conn, 'files', 'idx_files_deleted_at');
    expect(exists).toBe(true);
  });

  it('should create idx_projects_deleted_at on projects(deleted_at)', async () => {
    const exists = await indexExists(conn, 'projects', 'idx_projects_deleted_at');
    expect(exists).toBe(true);
  });
});
