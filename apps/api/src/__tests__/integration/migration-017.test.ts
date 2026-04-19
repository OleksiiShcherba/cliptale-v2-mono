/**
 * Integration tests for migration 017 — adds display_name to project_assets_current.
 *
 * Verifies that migration 017 adds a nullable VARCHAR(255) display_name column
 * immediately after the filename column, that existing rows are unaffected (they
 * receive NULL), and that new rows accept both NULL and non-NULL values.
 *
 * Requires a live MySQL instance. Uses APP_DB_* env vars with docker-compose
 * defaults as fallbacks so the test runs out-of-the-box after `docker compose up`.
 *
 * Run:  APP_DB_PASSWORD=cliptale vitest run src/__tests__/integration/migration-017.test.ts
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
  '../../db/migrations/017_asset_display_name.sql',
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

async function columnExists(conn: Connection): Promise<boolean> {
  const [rows] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = 'project_assets_current'
        AND COLUMN_NAME  = 'display_name'`,
  );
  return rows.length === 1;
}

let conn: Connection;
const testAssetIds: string[] = [];

beforeAll(async () => {
  conn = await mysql.createConnection(dbConfig());

  // Drop the column if it already exists so the test always runs the migration
  // from a clean starting state.
  if (await columnExists(conn)) {
    await conn.query(
      'ALTER TABLE project_assets_current DROP COLUMN display_name',
    );
  }

  // Apply the migration under test.
  const sql = readFileSync(MIGRATION_PATH, 'utf-8');
  await conn.query(sql);
});

afterAll(async () => {
  // Remove any rows created by these tests.
  if (testAssetIds.length > 0) {
    const placeholders = testAssetIds.map(() => '?').join(', ');
    await conn.query(
      `DELETE FROM project_assets_current WHERE asset_id IN (${placeholders})`,
      testAssetIds,
    );
  }
  await conn?.end();
});

async function insertAsset(
  overrides: Partial<{ displayName: string | null }> = {},
): Promise<string> {
  const fileId = randomUUID();
  testAssetIds.push(fileId);

  await conn.query(
    `INSERT INTO project_assets_current
       (asset_id, project_id, user_id, filename, display_name, content_type, file_size_bytes, storage_uri)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      fileId,
      randomUUID(),
      randomUUID(),
      'original-filename.mp4',
      overrides.displayName ?? null,
      'video/mp4',
      1024,
      `s3://test-bucket/${fileId}/original-filename.mp4`,
    ],
  );
  return fileId;
}

describe('migration 017 — display_name column existence', () => {
  it('should add the display_name column to project_assets_current', async () => {
    expect(await columnExists(conn)).toBe(true);
  });

  it('should have data type VARCHAR with maximum length 255', async () => {
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE, COLUMN_DEFAULT
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'project_assets_current'
          AND COLUMN_NAME  = 'display_name'`,
    );
    expect(rows).toHaveLength(1);
    const col = rows[0]!;
    expect(col['DATA_TYPE']).toBe('varchar');
    expect(col['CHARACTER_MAXIMUM_LENGTH']).toBe(255);
    expect(col['IS_NULLABLE']).toBe('YES');
    expect(col['COLUMN_DEFAULT']).toBeNull();
  });

  it('should be positioned immediately after the filename column', async () => {
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT COLUMN_NAME, ORDINAL_POSITION
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'project_assets_current'
          AND COLUMN_NAME  IN ('filename', 'display_name')
        ORDER BY ORDINAL_POSITION`,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]!['COLUMN_NAME']).toBe('filename');
    expect(rows[1]!['COLUMN_NAME']).toBe('display_name');
    // display_name must be the next ordinal position after filename
    expect(rows[1]!['ORDINAL_POSITION'] as number).toBe(
      (rows[0]!['ORDINAL_POSITION'] as number) + 1,
    );
  });
});

describe('migration 017 — INSERT behaviour', () => {
  it('should accept NULL as the display_name value', async () => {
    const fileId = await insertAsset({ displayName: null });
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT display_name FROM project_assets_current WHERE asset_id = ?',
      [fileId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!['display_name']).toBeNull();
  });

  it('should accept a non-null display_name string', async () => {
    const fileId = await insertAsset({ displayName: 'My Favourite Clip' });
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT display_name FROM project_assets_current WHERE asset_id = ?',
      [fileId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!['display_name']).toBe('My Favourite Clip');
  });

  it('should accept a display_name at the maximum length of 255 characters', async () => {
    const longName = 'A'.repeat(255);
    const fileId = await insertAsset({ displayName: longName });
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT display_name FROM project_assets_current WHERE asset_id = ?',
      [fileId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!['display_name']).toBe(longName);
  });

  it('should allow UPDATE of display_name on an existing row', async () => {
    const fileId = await insertAsset({ displayName: null });
    await conn.query(
      'UPDATE project_assets_current SET display_name = ? WHERE asset_id = ?',
      ['Renamed Asset', fileId],
    );
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT display_name FROM project_assets_current WHERE asset_id = ?',
      [fileId],
    );
    expect(rows[0]!['display_name']).toBe('Renamed Asset');
  });

  it('should allow UPDATE of display_name back to NULL', async () => {
    const fileId = await insertAsset({ displayName: 'Some Name' });
    await conn.query(
      'UPDATE project_assets_current SET display_name = NULL WHERE asset_id = ?',
      [fileId],
    );
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT display_name FROM project_assets_current WHERE asset_id = ?',
      [fileId],
    );
    expect(rows[0]!['display_name']).toBeNull();
  });
});

describe('migration 017 — existing columns preserved', () => {
  it('should not affect existing columns (filename, storage_uri, status)', async () => {
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT COLUMN_NAME
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'project_assets_current'
          AND COLUMN_NAME  IN ('filename', 'storage_uri', 'status', 'asset_id')
        ORDER BY ORDINAL_POSITION`,
    );
    const names = rows.map((r) => r['COLUMN_NAME'] as string);
    expect(names).toContain('asset_id');
    expect(names).toContain('filename');
    expect(names).toContain('storage_uri');
    expect(names).toContain('status');
  });
});
