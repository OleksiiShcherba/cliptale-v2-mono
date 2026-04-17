/**
 * Integration tests for migration 020 — adds owner_user_id + title + index to projects.
 *
 * Verifies that:
 * - owner_user_id column exists with the correct type, length, and NOT NULL constraint.
 * - title column exists with the correct type, length, NOT NULL constraint, and default.
 * - Composite index idx_projects_owner_updated exists on (owner_user_id, updated_at DESC).
 * - Every pre-existing projects row has owner_user_id populated (non-null, non-empty).
 * - The migration is idempotent — re-running it does not throw.
 *
 * Requires a live MySQL instance. Uses APP_DB_* env vars with docker-compose
 * defaults as fallbacks so the test runs out-of-the-box after `docker compose up`.
 *
 * Run:  APP_DB_PASSWORD=cliptale vitest run src/__tests__/integration/projects-schema.test.ts
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql, { type Connection } from 'mysql2/promise';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MIGRATION_PATH = resolve(
  __dirname,
  '../../db/migrations/020_projects_owner_title.sql',
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

/** Project ids inserted by this test suite — cleaned up in afterAll. */
const testProjectIds: string[] = [];

beforeAll(async () => {
  conn = await mysql.createConnection(dbConfig());
  // Apply the migration under test (idempotent — safe to re-run on an already-migrated DB).
  const sql = readFileSync(MIGRATION_PATH, 'utf-8');
  await conn.query(sql);
});

afterAll(async () => {
  if (testProjectIds.length > 0) {
    const placeholders = testProjectIds.map(() => '?').join(', ');
    await conn.query(
      `DELETE FROM projects WHERE project_id IN (${placeholders})`,
      testProjectIds,
    );
  }
  await conn?.end();
});

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

describe('migration 020 — column: owner_user_id', () => {
  it('should exist on the projects table', async () => {
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT COLUMN_NAME
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'projects'
          AND COLUMN_NAME  = 'owner_user_id'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!['COLUMN_NAME']).toBe('owner_user_id');
  });

  it('should be CHAR(36)', async () => {
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'projects'
          AND COLUMN_NAME  = 'owner_user_id'`,
    );
    expect(rows[0]!['DATA_TYPE']).toBe('char');
    expect(rows[0]!['CHARACTER_MAXIMUM_LENGTH']).toBe(36);
  });

  it('should be NOT NULL', async () => {
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT IS_NULLABLE
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'projects'
          AND COLUMN_NAME  = 'owner_user_id'`,
    );
    expect(rows[0]!['IS_NULLABLE']).toBe('NO');
  });
});

describe('migration 020 — column: title', () => {
  it('should exist on the projects table', async () => {
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT COLUMN_NAME
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'projects'
          AND COLUMN_NAME  = 'title'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!['COLUMN_NAME']).toBe('title');
  });

  it('should be VARCHAR(255)', async () => {
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'projects'
          AND COLUMN_NAME  = 'title'`,
    );
    expect(rows[0]!['DATA_TYPE']).toBe('varchar');
    expect(rows[0]!['CHARACTER_MAXIMUM_LENGTH']).toBe(255);
  });

  it('should be NOT NULL', async () => {
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT IS_NULLABLE
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'projects'
          AND COLUMN_NAME  = 'title'`,
    );
    expect(rows[0]!['IS_NULLABLE']).toBe('NO');
  });

  it('should have default value of Untitled project', async () => {
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT COLUMN_DEFAULT
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'projects'
          AND COLUMN_NAME  = 'title'`,
    );
    expect(rows[0]!['COLUMN_DEFAULT']).toBe('Untitled project');
  });
});

// ---------------------------------------------------------------------------
// Index
// ---------------------------------------------------------------------------

describe('migration 020 — index: idx_projects_owner_updated', () => {
  it('should exist on the projects table', async () => {
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT INDEX_NAME
         FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'projects'
          AND INDEX_NAME   = 'idx_projects_owner_updated'
        GROUP BY INDEX_NAME`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!['INDEX_NAME']).toBe('idx_projects_owner_updated');
  });

  it('should have owner_user_id as the first key part', async () => {
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT COLUMN_NAME, SEQ_IN_INDEX
         FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'projects'
          AND INDEX_NAME   = 'idx_projects_owner_updated'
        ORDER BY SEQ_IN_INDEX`,
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]!['COLUMN_NAME']).toBe('owner_user_id');
    expect(rows[0]!['SEQ_IN_INDEX']).toBe(1);
  });

  it('should have updated_at as the second key part', async () => {
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT COLUMN_NAME, SEQ_IN_INDEX
         FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'projects'
          AND INDEX_NAME   = 'idx_projects_owner_updated'
        ORDER BY SEQ_IN_INDEX`,
    );
    expect(rows).toHaveLength(2);
    expect(rows[1]!['COLUMN_NAME']).toBe('updated_at');
    expect(rows[1]!['SEQ_IN_INDEX']).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Backfill — every pre-existing row must have owner_user_id populated
// ---------------------------------------------------------------------------

describe('migration 020 — backfill', () => {
  it('should have no rows with a null or empty owner_user_id', async () => {
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS cnt
         FROM projects
        WHERE owner_user_id IS NULL
           OR owner_user_id = ''`,
    );
    expect(rows[0]!['cnt']).toBe(0);
  });

  it('should have no rows with a null or empty title', async () => {
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS cnt
         FROM projects
        WHERE title IS NULL
           OR title = ''`,
    );
    expect(rows[0]!['cnt']).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

describe('migration 020 — idempotency', () => {
  it('should not throw when re-applied to an already-migrated database', async () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf-8');
    await expect(conn.query(sql)).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// INSERT behaviour with new columns
// ---------------------------------------------------------------------------

describe('migration 020 — INSERT behaviour', () => {
  it('should accept an INSERT supplying owner_user_id and title', async () => {
    const projectId = randomUUID();
    testProjectIds.push(projectId);

    await conn.query(
      `INSERT INTO projects (project_id, owner_user_id, title) VALUES (?, ?, ?)`,
      [projectId, 'dev-user-001', 'My Test Project'],
    );

    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT owner_user_id, title FROM projects WHERE project_id = ?`,
      [projectId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!['owner_user_id']).toBe('dev-user-001');
    expect(rows[0]!['title']).toBe('My Test Project');
  });

  it('should use Untitled project as the default title when not supplied', async () => {
    const projectId = randomUUID();
    testProjectIds.push(projectId);

    await conn.query(
      `INSERT INTO projects (project_id, owner_user_id) VALUES (?, ?)`,
      [projectId, 'dev-user-001'],
    );

    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT title FROM projects WHERE project_id = ?`,
      [projectId],
    );
    expect(rows[0]!['title']).toBe('Untitled project');
  });
});
