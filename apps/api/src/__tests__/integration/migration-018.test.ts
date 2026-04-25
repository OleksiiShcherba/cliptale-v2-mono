/**
 * Integration tests for migration 018 — adds 'caption' to project_clips_current.type ENUM.
 *
 * Verifies that:
 * - The ENUM for project_clips_current.type includes 'caption' after the migration.
 * - INSERTs with type = 'caption' succeed.
 * - INSERTs with type = 'text-overlay', 'video', 'audio', and 'image' still succeed
 *   (existing values are preserved by the MODIFY COLUMN).
 * - INSERTs with an unknown type are rejected (ENUM constraint is enforced).
 *
 * Requires a live MySQL instance. Uses APP_DB_* env vars with docker-compose
 * defaults as fallbacks so the test runs out-of-the-box after `docker compose up`.
 *
 * Run:  APP_DB_PASSWORD=cliptale vitest run src/__tests__/integration/migration-018.test.ts
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
  '../../db/migrations/018_add_caption_clip_type.sql',
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

async function getEnumValues(conn: Connection): Promise<string[]> {
  const [rows] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT COLUMN_TYPE
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = 'project_clips_current'
        AND COLUMN_NAME  = 'type'`,
  );
  if (rows.length === 0) return [];
  // COLUMN_TYPE looks like: enum('video','audio','text-overlay','image','caption')
  const raw = rows[0]!['COLUMN_TYPE'] as string;
  const match = raw.match(/^enum\((.+)\)$/i);
  if (!match) return [];
  return match[1]!
    .split(',')
    .map((s) => s.trim().replace(/^'|'$/g, ''));
}

let conn: Connection;
const testClipIds: string[] = [];

beforeAll(async () => {
  conn = await mysql.createConnection(dbConfig());
  // Apply the migration under test (idempotent — safe to re-run).
  const sql = readFileSync(MIGRATION_PATH, 'utf-8');
  await conn.query(sql);
});

afterAll(async () => {
  if (testClipIds.length > 0) {
    const placeholders = testClipIds.map(() => '?').join(', ');
    await conn.query(
      `DELETE FROM project_clips_current WHERE clip_id IN (${placeholders})`,
      testClipIds,
    );
  }
  await conn?.end();
});

async function insertClip(type: string): Promise<string> {
  const clipId = randomUUID();
  testClipIds.push(clipId);
  await conn.query(
    `INSERT INTO project_clips_current
       (clip_id, project_id, track_id, type, start_frame, duration_frames)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [clipId, randomUUID(), randomUUID(), type, 0, 30],
  );
  return clipId;
}

describe('migration 018 — ENUM definition', () => {
  it('should include caption in the type ENUM', async () => {
    const values = await getEnumValues(conn);
    expect(values).toContain('caption');
  });

  it('should preserve all existing ENUM values', async () => {
    const values = await getEnumValues(conn);
    expect(values).toContain('video');
    expect(values).toContain('audio');
    expect(values).toContain('text-overlay');
    expect(values).toContain('image');
  });

  it('should have exactly the five expected ENUM values', async () => {
    const values = await getEnumValues(conn);
    expect(values.sort()).toEqual(
      ['audio', 'caption', 'image', 'text-overlay', 'video'].sort(),
    );
  });
});

describe('migration 018 — INSERT behaviour', () => {
  it('should accept INSERT with type = caption', async () => {
    const clipId = await insertClip('caption');
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT type FROM project_clips_current WHERE clip_id = ?',
      [clipId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!['type']).toBe('caption');
  });

  it('should still accept INSERT with type = video', async () => {
    const clipId = await insertClip('video');
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT type FROM project_clips_current WHERE clip_id = ?',
      [clipId],
    );
    expect(rows[0]!['type']).toBe('video');
  });

  it('should still accept INSERT with type = audio', async () => {
    const clipId = await insertClip('audio');
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT type FROM project_clips_current WHERE clip_id = ?',
      [clipId],
    );
    expect(rows[0]!['type']).toBe('audio');
  });

  it('should still accept INSERT with type = text-overlay', async () => {
    const clipId = await insertClip('text-overlay');
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT type FROM project_clips_current WHERE clip_id = ?',
      [clipId],
    );
    expect(rows[0]!['type']).toBe('text-overlay');
  });

  it('should still accept INSERT with type = image', async () => {
    const clipId = await insertClip('image');
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT type FROM project_clips_current WHERE clip_id = ?',
      [clipId],
    );
    expect(rows[0]!['type']).toBe('image');
  });

  it('should reject INSERT with an unknown type value', async () => {
    const clipId = randomUUID();
    await expect(
      conn.query(
        `INSERT INTO project_clips_current
           (clip_id, project_id, track_id, type, start_frame, duration_frames)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [clipId, randomUUID(), randomUUID(), 'unknown-type', 0, 30],
      ),
    ).rejects.toThrow();
  });
});
