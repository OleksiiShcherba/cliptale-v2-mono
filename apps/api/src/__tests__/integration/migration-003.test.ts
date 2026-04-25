/**
 * Integration smoke tests for migration 003 — part 1: projects and project_versions tables.
 *
 * Requires a live MySQL instance. Uses APP_DB_* env vars with docker-compose
 * defaults as fallbacks so the test runs out-of-the-box after `docker compose up`.
 *
 * Run:  APP_DB_PASSWORD=cliptale vitest run src/__tests__/integration/migration-003.test.ts
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
  '../../db/migrations/003_project_versions.sql',
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
  const sql = readFileSync(MIGRATION_PATH, 'utf-8');
  await conn.query(sql);
});

afterAll(async () => {
  await conn?.end();
});

// ---------------------------------------------------------------------------
// projects table
// ---------------------------------------------------------------------------

describe('migration 003 — projects table', () => {
  describe('table existence', () => {
    it('should create the projects table', async () => {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT TABLE_NAME
         FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'projects'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!['TABLE_NAME']).toBe('projects');
    });

    it('should be idempotent — re-running the migration does not throw', async () => {
      const sql = readFileSync(MIGRATION_PATH, 'utf-8');
      await expect(conn.query(sql)).resolves.not.toThrow();
    });
  });

  describe('column schema', () => {
    it('should have all required columns with correct types', async () => {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, CHARACTER_MAXIMUM_LENGTH
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'projects'
         ORDER BY ORDINAL_POSITION`,
      );

      const columns = Object.fromEntries(
        rows.map((r) => [r['COLUMN_NAME'] as string, r]),
      );

      expect(columns['project_id']!['DATA_TYPE']).toBe('char');
      expect(columns['project_id']!['IS_NULLABLE']).toBe('NO');
      expect(columns['project_id']!['CHARACTER_MAXIMUM_LENGTH']).toBe(36);

      expect(columns['latest_version_id']!['DATA_TYPE']).toBe('bigint');
      expect(columns['latest_version_id']!['IS_NULLABLE']).toBe('YES');

      expect(columns['created_at']!['DATA_TYPE']).toBe('datetime');
      expect(columns['updated_at']!['DATA_TYPE']).toBe('datetime');
    });
  });

  describe('INSERT behaviour', () => {
    const testProjectId = randomUUID();

    afterAll(async () => {
      await conn.query('DELETE FROM projects WHERE project_id = ?', [
        testProjectId,
      ]);
    });

    it('should accept an INSERT with latest_version_id defaulting to NULL', async () => {
      await conn.query(`INSERT INTO projects (project_id) VALUES (?)`, [
        testProjectId,
      ]);

      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT latest_version_id FROM projects WHERE project_id = ?',
        [testProjectId],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!['latest_version_id']).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// project_versions table
// ---------------------------------------------------------------------------

describe('migration 003 — project_versions table', () => {
  describe('table existence', () => {
    it('should create the project_versions table', async () => {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT TABLE_NAME
         FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'project_versions'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!['TABLE_NAME']).toBe('project_versions');
    });
  });

  describe('column schema', () => {
    it('should have all required columns with correct types', async () => {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'project_versions'
         ORDER BY ORDINAL_POSITION`,
      );

      const columns = Object.fromEntries(
        rows.map((r) => [r['COLUMN_NAME'] as string, r]),
      );

      expect(columns['version_id']!['DATA_TYPE']).toBe('bigint');
      expect(columns['version_id']!['IS_NULLABLE']).toBe('NO');

      expect(columns['project_id']!['DATA_TYPE']).toBe('char');
      expect(columns['project_id']!['IS_NULLABLE']).toBe('NO');

      expect(columns['doc_json']!['DATA_TYPE']).toBe('json');
      expect(columns['doc_json']!['IS_NULLABLE']).toBe('NO');

      expect(columns['doc_schema_version']!['DATA_TYPE']).toBe('int');
      expect(columns['doc_schema_version']!['IS_NULLABLE']).toBe('NO');

      expect(columns['created_by_user_id']!['IS_NULLABLE']).toBe('YES');
      expect(columns['created_at']!['DATA_TYPE']).toBe('datetime');

      expect(columns['parent_version_id']!['DATA_TYPE']).toBe('bigint');
      expect(columns['parent_version_id']!['IS_NULLABLE']).toBe('YES');
    });
  });

  describe('INSERT behaviour', () => {
    const testProjectId = randomUUID();
    let insertedVersionId: number;

    beforeAll(async () => {
      await conn.query(`INSERT INTO projects (project_id) VALUES (?)`, [
        testProjectId,
      ]);
    });

    afterAll(async () => {
      if (insertedVersionId) {
        await conn.query(
          'DELETE FROM project_versions WHERE version_id = ?',
          [insertedVersionId],
        );
      }
      await conn.query('DELETE FROM projects WHERE project_id = ?', [
        testProjectId,
      ]);
    });

    it('should accept an INSERT and auto-increment version_id', async () => {
      const doc = { title: 'Test Project', tracks: [] };
      const [result] = await conn.query<mysql.ResultSetHeader>(
        `INSERT INTO project_versions
           (project_id, doc_json, doc_schema_version, created_by_user_id, parent_version_id)
         VALUES (?, ?, ?, ?, ?)`,
        [testProjectId, JSON.stringify(doc), 1, 'user-001', null],
      );
      insertedVersionId = result.insertId;
      expect(insertedVersionId).toBeGreaterThan(0);
    });

    it('should store and retrieve doc_json correctly', async () => {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT doc_json, doc_schema_version FROM project_versions WHERE version_id = ?',
        [insertedVersionId],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!['doc_schema_version']).toBe(1);

      const stored =
        typeof rows[0]!['doc_json'] === 'string'
          ? JSON.parse(rows[0]!['doc_json'] as string)
          : rows[0]!['doc_json'];
      expect(stored['title']).toBe('Test Project');
    });

    it('should enforce NOT NULL on doc_json', async () => {
      await expect(
        conn.query(
          `INSERT INTO project_versions (project_id, doc_json, doc_schema_version)
           VALUES (?, NULL, 1)`,
          [testProjectId],
        ),
      ).rejects.toThrow();
    });
  });

  describe('composite index', () => {
    it('should have the index idx_project_versions_project_created on (project_id, created_at)', async () => {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT INDEX_NAME, COLUMN_NAME, SEQ_IN_INDEX
         FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'project_versions'
           AND INDEX_NAME = 'idx_project_versions_project_created'
         ORDER BY SEQ_IN_INDEX`,
      );
      expect(rows).toHaveLength(2);
      expect(rows[0]!['COLUMN_NAME']).toBe('project_id');
      expect(rows[1]!['COLUMN_NAME']).toBe('created_at');
    });
  });
});
