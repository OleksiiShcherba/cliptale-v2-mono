/**
 * Integration smoke tests for migration 002 — caption_tracks table.
 *
 * Requires a live MySQL instance. Uses APP_DB_* env vars with docker-compose
 * defaults as fallbacks so the test runs out-of-the-box after `docker compose up`.
 *
 * Run:  APP_DB_PASSWORD=cliptale vitest run src/__tests__/integration/migration-002.test.ts
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
  '../../db/migrations/002_caption_tracks.sql',
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

describe('migration 002 — caption_tracks', () => {
  describe('table existence', () => {
    it('should create the caption_tracks table', async () => {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT TABLE_NAME
         FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'caption_tracks'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!['TABLE_NAME']).toBe('caption_tracks');
    });

    it('should be idempotent — re-running the migration does not throw', async () => {
      const sql = readFileSync(MIGRATION_PATH, 'utf-8');
      await expect(conn.query(sql)).resolves.not.toThrow();
    });
  });

  describe('column schema', () => {
    it('should have all required columns with correct types', async () => {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, CHARACTER_MAXIMUM_LENGTH
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'caption_tracks'
         ORDER BY ORDINAL_POSITION`,
      );

      const columns = Object.fromEntries(
        rows.map((r) => [r['COLUMN_NAME'] as string, r]),
      );

      // Primary key
      expect(columns['caption_track_id']!['DATA_TYPE']).toBe('char');
      expect(columns['caption_track_id']!['IS_NULLABLE']).toBe('NO');
      expect(columns['caption_track_id']!['CHARACTER_MAXIMUM_LENGTH']).toBe(36);

      // Foreign-key-like identifiers
      // asset_id was renamed to file_id in migration 023/024 (Files-as-Root refactor)
      expect(columns['file_id']!['DATA_TYPE']).toBe('char');
      expect(columns['file_id']!['IS_NULLABLE']).toBe('NO');
      expect(columns['file_id']!['CHARACTER_MAXIMUM_LENGTH']).toBe(36);

      expect(columns['project_id']!['DATA_TYPE']).toBe('char');
      expect(columns['project_id']!['IS_NULLABLE']).toBe('NO');
      expect(columns['project_id']!['CHARACTER_MAXIMUM_LENGTH']).toBe(36);

      // Language with default
      expect(columns['language']!['DATA_TYPE']).toBe('varchar');
      expect(columns['language']!['IS_NULLABLE']).toBe('NO');
      expect(columns['language']!['COLUMN_DEFAULT']).toBe('en');

      // Segments stored as JSON, not nullable
      expect(columns['segments_json']!['DATA_TYPE']).toBe('json');
      expect(columns['segments_json']!['IS_NULLABLE']).toBe('NO');

      // Timestamp with auto-default
      expect(columns['created_at']!['DATA_TYPE']).toBe('datetime');
      expect(columns['created_at']!['IS_NULLABLE']).toBe('NO');
    });
  });

  describe('INSERT behaviour', () => {
    const testTrackId = randomUUID();
    const testAssetId = randomUUID();
    const testProjectId = randomUUID();

    afterAll(async () => {
      await conn.query(
        'DELETE FROM caption_tracks WHERE caption_track_id = ?',
        [testTrackId],
      );
    });

    it('should accept an INSERT with language defaulting to "en"', async () => {
      await conn.query(
        `INSERT INTO caption_tracks
           (caption_track_id, file_id, project_id, segments_json)
         VALUES (?, ?, ?, ?)`,
        [
          testTrackId,
          testAssetId,
          testProjectId,
          JSON.stringify([{ start: 0.0, end: 2.5, text: 'Hello world' }]),
        ],
      );

      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT language, segments_json FROM caption_tracks WHERE caption_track_id = ?',
        [testTrackId],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!['language']).toBe('en');
    });

    it('should accept an INSERT with an explicit language', async () => {
      const trackId2 = randomUUID();

      await conn.query(
        `INSERT INTO caption_tracks
           (caption_track_id, file_id, project_id, language, segments_json)
         VALUES (?, ?, ?, ?, ?)`,
        [
          trackId2,
          testAssetId,
          testProjectId,
          'fr',
          JSON.stringify([{ start: 0.0, end: 1.5, text: 'Bonjour' }]),
        ],
      );

      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT language FROM caption_tracks WHERE caption_track_id = ?',
        [trackId2],
      );
      expect(rows[0]!['language']).toBe('fr');

      await conn.query(
        'DELETE FROM caption_tracks WHERE caption_track_id = ?',
        [trackId2],
      );
    });

    it('should store and retrieve segments_json correctly', async () => {
      const segments = [
        { start: 0.0, end: 2.5, text: 'Hello world' },
        { start: 2.6, end: 5.0, text: 'Goodbye world' },
      ];

      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT segments_json FROM caption_tracks WHERE caption_track_id = ?',
        [testTrackId],
      );
      expect(rows).toHaveLength(1);
      // MySQL returns JSON columns as parsed objects
      const stored =
        typeof rows[0]!['segments_json'] === 'string'
          ? JSON.parse(rows[0]!['segments_json'] as string)
          : rows[0]!['segments_json'];
      expect(stored[0]['text']).toBe('Hello world');
      void segments; // ensure segments var is used
    });

    it('should enforce NOT NULL on segments_json', async () => {
      await expect(
        conn.query(
          `INSERT INTO caption_tracks
             (caption_track_id, file_id, project_id, segments_json)
           VALUES (?, ?, ?, NULL)`,
          [randomUUID(), randomUUID(), randomUUID()],
        ),
      ).rejects.toThrow();
    });
  });

  describe('composite index', () => {
    it('should NOT have the legacy idx_caption_tracks_asset_project index (dropped in migration 024)', async () => {
      // Migration 024 (step 8) dropped this index when asset_id was renamed to file_id.
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT INDEX_NAME
         FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'caption_tracks'
           AND INDEX_NAME = 'idx_caption_tracks_asset_project'`,
      );
      expect(rows).toHaveLength(0);
    });
  });
});
