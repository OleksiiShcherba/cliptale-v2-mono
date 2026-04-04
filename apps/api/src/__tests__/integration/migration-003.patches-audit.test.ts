/**
 * Integration smoke tests for migration 003 — part 2:
 * project_version_patches and project_audit_log tables.
 *
 * Requires a live MySQL instance. Uses APP_DB_* env vars with docker-compose
 * defaults as fallbacks so the test runs out-of-the-box after `docker compose up`.
 *
 * Run:  APP_DB_PASSWORD=cliptale vitest run src/__tests__/integration/migration-003.patches-audit.test.ts
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
// project_version_patches table
// ---------------------------------------------------------------------------

describe('migration 003 — project_version_patches table', () => {
  describe('table existence', () => {
    it('should create the project_version_patches table', async () => {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT TABLE_NAME
         FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'project_version_patches'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!['TABLE_NAME']).toBe('project_version_patches');
    });
  });

  describe('column schema', () => {
    it('should have all required columns with correct types', async () => {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'project_version_patches'
         ORDER BY ORDINAL_POSITION`,
      );

      const columns = Object.fromEntries(
        rows.map((r) => [r['COLUMN_NAME'] as string, r]),
      );

      expect(columns['patch_id']!['DATA_TYPE']).toBe('bigint');
      expect(columns['patch_id']!['IS_NULLABLE']).toBe('NO');

      expect(columns['version_id']!['DATA_TYPE']).toBe('bigint');
      expect(columns['version_id']!['IS_NULLABLE']).toBe('NO');

      expect(columns['patches_json']!['DATA_TYPE']).toBe('json');
      expect(columns['patches_json']!['IS_NULLABLE']).toBe('NO');

      expect(columns['inverse_patches_json']!['DATA_TYPE']).toBe('json');
      expect(columns['inverse_patches_json']!['IS_NULLABLE']).toBe('NO');
    });
  });

  describe('INSERT behaviour', () => {
    const testProjectId = randomUUID();
    let versionId: number;
    let patchId: number;

    beforeAll(async () => {
      await conn.query(`INSERT INTO projects (project_id) VALUES (?)`, [
        testProjectId,
      ]);
      const [result] = await conn.query<mysql.ResultSetHeader>(
        `INSERT INTO project_versions (project_id, doc_json, doc_schema_version)
         VALUES (?, ?, ?)`,
        [testProjectId, JSON.stringify({ tracks: [] }), 1],
      );
      versionId = result.insertId;
    });

    afterAll(async () => {
      if (patchId) {
        await conn.query(
          'DELETE FROM project_version_patches WHERE patch_id = ?',
          [patchId],
        );
      }
      if (versionId) {
        await conn.query(
          'DELETE FROM project_versions WHERE version_id = ?',
          [versionId],
        );
      }
      await conn.query('DELETE FROM projects WHERE project_id = ?', [
        testProjectId,
      ]);
    });

    it('should accept an INSERT and auto-increment patch_id', async () => {
      const patches = [{ op: 'replace', path: '/title', value: 'New Title' }];
      const inversePatches = [
        { op: 'replace', path: '/title', value: 'Old Title' },
      ];

      const [result] = await conn.query<mysql.ResultSetHeader>(
        `INSERT INTO project_version_patches
           (version_id, patches_json, inverse_patches_json)
         VALUES (?, ?, ?)`,
        [versionId, JSON.stringify(patches), JSON.stringify(inversePatches)],
      );
      patchId = result.insertId;
      expect(patchId).toBeGreaterThan(0);
    });

    it('should retrieve patches_json and inverse_patches_json correctly', async () => {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT patches_json, inverse_patches_json
         FROM project_version_patches WHERE patch_id = ?`,
        [patchId],
      );
      expect(rows).toHaveLength(1);

      const patches =
        typeof rows[0]!['patches_json'] === 'string'
          ? JSON.parse(rows[0]!['patches_json'] as string)
          : rows[0]!['patches_json'];
      expect(patches[0]['path']).toBe('/title');

      const inversePatches =
        typeof rows[0]!['inverse_patches_json'] === 'string'
          ? JSON.parse(rows[0]!['inverse_patches_json'] as string)
          : rows[0]!['inverse_patches_json'];
      expect(inversePatches[0]['value']).toBe('Old Title');
    });
  });

  describe('index', () => {
    it('should have the index idx_version_patches_version_id on version_id', async () => {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT INDEX_NAME, COLUMN_NAME
         FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'project_version_patches'
           AND INDEX_NAME = 'idx_version_patches_version_id'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!['COLUMN_NAME']).toBe('version_id');
    });
  });
});

// ---------------------------------------------------------------------------
// project_audit_log table
// ---------------------------------------------------------------------------

describe('migration 003 — project_audit_log table', () => {
  describe('table existence', () => {
    it('should create the project_audit_log table', async () => {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT TABLE_NAME
         FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'project_audit_log'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!['TABLE_NAME']).toBe('project_audit_log');
    });
  });

  describe('column schema', () => {
    it('should have all required columns with correct types', async () => {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, CHARACTER_MAXIMUM_LENGTH
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'project_audit_log'
         ORDER BY ORDINAL_POSITION`,
      );

      const columns = Object.fromEntries(
        rows.map((r) => [r['COLUMN_NAME'] as string, r]),
      );

      expect(columns['log_id']!['DATA_TYPE']).toBe('bigint');
      expect(columns['log_id']!['IS_NULLABLE']).toBe('NO');

      expect(columns['project_id']!['DATA_TYPE']).toBe('char');
      expect(columns['project_id']!['IS_NULLABLE']).toBe('NO');
      expect(columns['project_id']!['CHARACTER_MAXIMUM_LENGTH']).toBe(36);

      expect(columns['event_type']!['DATA_TYPE']).toBe('varchar');
      expect(columns['event_type']!['IS_NULLABLE']).toBe('NO');

      expect(columns['version_id']!['DATA_TYPE']).toBe('bigint');
      expect(columns['version_id']!['IS_NULLABLE']).toBe('YES');

      expect(columns['user_id']!['IS_NULLABLE']).toBe('YES');

      expect(columns['created_at']!['DATA_TYPE']).toBe('datetime');
      expect(columns['created_at']!['IS_NULLABLE']).toBe('NO');
    });
  });

  describe('INSERT behaviour', () => {
    const testProjectId = randomUUID();
    let logId: number;

    afterAll(async () => {
      if (logId) {
        await conn.query('DELETE FROM project_audit_log WHERE log_id = ?', [
          logId,
        ]);
      }
    });

    it('should accept an INSERT with nullable version_id and user_id', async () => {
      const [result] = await conn.query<mysql.ResultSetHeader>(
        `INSERT INTO project_audit_log
           (project_id, event_type, version_id, user_id)
         VALUES (?, ?, ?, ?)`,
        [testProjectId, 'project.save', null, null],
      );
      logId = result.insertId;
      expect(logId).toBeGreaterThan(0);
    });

    it('should store event_type and retrieve it correctly', async () => {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT event_type, version_id, user_id FROM project_audit_log WHERE log_id = ?',
        [logId],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!['event_type']).toBe('project.save');
      expect(rows[0]!['version_id']).toBeNull();
      expect(rows[0]!['user_id']).toBeNull();
    });

    it('should accept a project.restore event with a version_id', async () => {
      const [result] = await conn.query<mysql.ResultSetHeader>(
        `INSERT INTO project_audit_log
           (project_id, event_type, version_id, user_id)
         VALUES (?, ?, ?, ?)`,
        [testProjectId, 'project.restore', 42, 'user-999'],
      );
      const restoreLogId = result.insertId;
      expect(restoreLogId).toBeGreaterThan(0);

      await conn.query('DELETE FROM project_audit_log WHERE log_id = ?', [
        restoreLogId,
      ]);
    });
  });

  describe('composite index', () => {
    it('should have the index idx_audit_log_project_created on (project_id, created_at)', async () => {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT INDEX_NAME, COLUMN_NAME, SEQ_IN_INDEX
         FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'project_audit_log'
           AND INDEX_NAME = 'idx_audit_log_project_created'
         ORDER BY SEQ_IN_INDEX`,
      );
      expect(rows).toHaveLength(2);
      expect(rows[0]!['COLUMN_NAME']).toBe('project_id');
      expect(rows[1]!['COLUMN_NAME']).toBe('created_at');
    });
  });
});
