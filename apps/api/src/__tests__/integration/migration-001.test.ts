/**
 * Integration smoke tests for migration 001 — project_assets_current table.
 *
 * Requires a live MySQL instance. Uses APP_DB_* env vars with docker-compose
 * defaults as fallbacks so the test runs out-of-the-box after `docker compose up`.
 *
 * Run:  APP_DB_PASSWORD=cliptale vitest run src/__tests__/integration/migration-001.test.ts
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
  '../../db/migrations/001_project_assets_current.sql',
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
  // Apply the migration — idempotent, safe to run on an existing DB.
  const sql = readFileSync(MIGRATION_PATH, 'utf-8');
  await conn.query(sql);
});

afterAll(async () => {
  await conn?.end();
});

describe('migration 001 — project_assets_current', () => {
  describe('table existence', () => {
    it('should create the project_assets_current table', async () => {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT TABLE_NAME
         FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'project_assets_current'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!['TABLE_NAME']).toBe('project_assets_current');
    });

    it('should be idempotent — re-running the migration does not throw', async () => {
      const sql = readFileSync(MIGRATION_PATH, 'utf-8');
      await expect(conn.query(sql)).resolves.not.toThrow();
    });
  });

  describe('column schema', () => {
    it('should have all required columns with correct types', async () => {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_TYPE
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'project_assets_current'
         ORDER BY ORDINAL_POSITION`,
      );

      const columns = Object.fromEntries(
        rows.map((r) => [r['COLUMN_NAME'] as string, r]),
      );

      // Primary key
      expect(columns['asset_id']!['DATA_TYPE']).toBe('char');
      expect(columns['asset_id']!['IS_NULLABLE']).toBe('NO');

      // Required foreign-key-like identifiers
      expect(columns['project_id']!['DATA_TYPE']).toBe('char');
      expect(columns['user_id']!['DATA_TYPE']).toBe('char');

      // File metadata
      expect(columns['filename']!['DATA_TYPE']).toBe('varchar');
      expect(columns['content_type']!['DATA_TYPE']).toBe('varchar');
      expect(columns['file_size_bytes']!['DATA_TYPE']).toBe('bigint');
      expect(columns['storage_uri']!['DATA_TYPE']).toBe('varchar');

      // Status ENUM
      expect(columns['status']!['COLUMN_TYPE']).toBe(
        "enum('pending','processing','ready','error')",
      );
      expect(columns['status']!['COLUMN_DEFAULT']).toBe('pending');

      // Nullable processing metadata
      expect(columns['error_message']!['IS_NULLABLE']).toBe('YES');
      expect(columns['duration_frames']!['IS_NULLABLE']).toBe('YES');
      expect(columns['width']!['IS_NULLABLE']).toBe('YES');
      expect(columns['height']!['IS_NULLABLE']).toBe('YES');
      expect(columns['fps']!['DATA_TYPE']).toBe('decimal');
      expect(columns['fps']!['IS_NULLABLE']).toBe('YES');
      expect(columns['thumbnail_uri']!['IS_NULLABLE']).toBe('YES');

      // waveform_json stored as JSON
      expect(columns['waveform_json']!['DATA_TYPE']).toBe('json');
      expect(columns['waveform_json']!['IS_NULLABLE']).toBe('YES');

      // Timestamps with auto-defaults
      expect(columns['created_at']!['DATA_TYPE']).toBe('datetime');
      expect(columns['updated_at']!['DATA_TYPE']).toBe('datetime');
    });
  });

  describe('INSERT behaviour', () => {
    const testAssetId = randomUUID();

    afterAll(async () => {
      // Clean up the test row.
      await conn.query(
        'DELETE FROM project_assets_current WHERE asset_id = ?',
        [testAssetId],
      );
    });

    it('should accept an INSERT with status defaulting to pending', async () => {
      await conn.query(
        `INSERT INTO project_assets_current
           (asset_id, project_id, user_id, filename, content_type, file_size_bytes, storage_uri)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          testAssetId,
          randomUUID(),
          randomUUID(),
          'test-video.mp4',
          'video/mp4',
          123456789,
          `s3://test-bucket/assets/${testAssetId}/test-video.mp4`,
        ],
      );

      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT status FROM project_assets_current WHERE asset_id = ?',
        [testAssetId],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!['status']).toBe('pending');
    });

    it('should reject an INSERT with an invalid status ENUM value', async () => {
      await expect(
        conn.query(
          `INSERT INTO project_assets_current
             (asset_id, project_id, user_id, filename, content_type, file_size_bytes, storage_uri, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            randomUUID(),
            randomUUID(),
            randomUUID(),
            'bad.mp4',
            'video/mp4',
            1,
            's3://test-bucket/bad',
            'unknown', // not a valid ENUM value
          ],
        ),
      ).rejects.toThrow();
    });
  });

  describe('composite index', () => {
    it('should have the index idx_project_assets_project_status on (project_id, status)', async () => {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT INDEX_NAME, COLUMN_NAME, SEQ_IN_INDEX
         FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'project_assets_current'
           AND INDEX_NAME = 'idx_project_assets_project_status'
         ORDER BY SEQ_IN_INDEX`,
      );
      expect(rows).toHaveLength(2);
      expect(rows[0]!['COLUMN_NAME']).toBe('project_id');
      expect(rows[1]!['COLUMN_NAME']).toBe('status');
    });
  });
});
