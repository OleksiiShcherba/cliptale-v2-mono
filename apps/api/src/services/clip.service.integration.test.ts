/**
 * Integration tests for clip.service.ts — linked vs unlinked file validation.
 *
 * These tests run against a real MySQL instance (docker compose up db).
 * They verify that:
 *   - createClip succeeds when the file is linked to the project via project_files.
 *   - createClip throws ValidationError when the file is NOT linked to the project.
 *
 * Run:
 *   APP_DB_PASSWORD=cliptale vitest run src/services/clip.service.integration.test.ts
 */
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql, { type Connection } from 'mysql2/promise';

// ── Set env vars before any app module is imported ────────────────────────────
Object.assign(process.env, {
  APP_DB_HOST:              process.env['APP_DB_HOST']              ?? 'localhost',
  APP_DB_PORT:              process.env['APP_DB_PORT']              ?? '3306',
  APP_DB_NAME:              process.env['APP_DB_NAME']              ?? 'cliptale',
  APP_DB_USER:              process.env['APP_DB_USER']              ?? 'cliptale',
  APP_DB_PASSWORD:          process.env['APP_DB_PASSWORD']          ?? 'cliptale',
  APP_REDIS_URL:            process.env['APP_REDIS_URL']            ?? 'redis://localhost:6379',
  APP_S3_BUCKET:            process.env['APP_S3_BUCKET']            ?? 'test-bucket',
  APP_S3_REGION:            process.env['APP_S3_REGION']            ?? 'us-east-1',
  APP_S3_ACCESS_KEY_ID:     process.env['APP_S3_ACCESS_KEY_ID']     ?? 'test-access-key-id',
  APP_S3_SECRET_ACCESS_KEY: process.env['APP_S3_SECRET_ACCESS_KEY'] ?? 'test-secret-key-value',
  APP_JWT_SECRET:           'clip-svc-integration-test-secret32!!',
  APP_DEV_AUTH_BYPASS:      'false',
});

// ─────────────────────────────────────────────────────────────────────────────

let conn: Connection;

const CLIP_INT_USER = `csvi-${randomUUID().slice(0, 8)}`;

let projectId: string;
let linkedFileId: string;
let unlinkedFileId: string;
const cleanupClipIds: string[] = [];

beforeAll(async () => {
  conn = await mysql.createConnection({
    host:     process.env['APP_DB_HOST']     ?? 'localhost',
    port:     Number(process.env['APP_DB_PORT'] ?? 3306),
    database: process.env['APP_DB_NAME']     ?? 'cliptale',
    user:     process.env['APP_DB_USER']     ?? 'cliptale',
    password: process.env['APP_DB_PASSWORD'] ?? 'cliptale',
  });

  // Seed user
  await conn.execute(
    `INSERT INTO users (user_id, email, display_name, email_verified)
     VALUES (?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE user_id = user_id`,
    [CLIP_INT_USER, `${CLIP_INT_USER}@test.com`, CLIP_INT_USER],
  );

  // Seed project
  projectId = randomUUID();
  await conn.execute(
    'INSERT INTO projects (project_id, owner_user_id, title) VALUES (?, ?, ?)',
    [projectId, CLIP_INT_USER, 'Clip Integration Test Project'],
  );

  // Seed a file that IS linked to the project
  linkedFileId = randomUUID();
  await conn.execute(
    `INSERT INTO files (file_id, user_id, kind, storage_uri, mime_type, display_name, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [linkedFileId, CLIP_INT_USER, 'video', `s3://test-bucket/${linkedFileId}.mp4`,
     'video/mp4', 'linked.mp4', 'ready'],
  );
  // Link the file to the project via project_files
  await conn.execute(
    'INSERT INTO project_files (project_id, file_id) VALUES (?, ?)',
    [projectId, linkedFileId],
  );

  // Seed a file that is NOT linked to the project
  unlinkedFileId = randomUUID();
  await conn.execute(
    `INSERT INTO files (file_id, user_id, kind, storage_uri, mime_type, display_name, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [unlinkedFileId, CLIP_INT_USER, 'video', `s3://test-bucket/${unlinkedFileId}.mp4`,
     'video/mp4', 'unlinked.mp4', 'ready'],
  );
  // NOTE: no project_files row for unlinkedFileId — intentionally unlinked
});

afterAll(async () => {
  // Remove clips
  if (cleanupClipIds.length) {
    await conn.query(
      `DELETE FROM project_clips_current WHERE clip_id IN (${cleanupClipIds.map(() => '?').join(',')})`,
      cleanupClipIds,
    );
  }
  // Remove pivot rows
  await conn.execute(
    'DELETE FROM project_files WHERE project_id = ?', [projectId],
  );
  // Remove files
  await conn.execute(
    `DELETE FROM files WHERE file_id IN (?, ?)`, [linkedFileId, unlinkedFileId],
  );
  // Remove project
  await conn.execute('DELETE FROM projects WHERE project_id = ?', [projectId]);
  // Remove user
  await conn.execute('DELETE FROM users WHERE user_id = ?', [CLIP_INT_USER]);
  await conn.end();
});

// Lazy import after env vars are set
async function svc() {
  return import('./clip.service.js');
}

describe('clip.service integration', () => {
  describe('createClip — file-link validation', () => {
    it('inserts a clip successfully when file is linked to the project via project_files', async () => {
      const service = await svc();
      const clipId = randomUUID();
      cleanupClipIds.push(clipId);

      await expect(
        service.createClip({
          clipId,
          projectId,
          trackId: randomUUID(),
          type: 'video',
          fileId: linkedFileId,
          startFrame: 0,
          durationFrames: 30,
        }),
      ).resolves.toBeUndefined();

      // Verify the row was actually written
      const [rows] = await conn.execute<import('mysql2/promise').RowDataPacket[]>(
        'SELECT clip_id, file_id FROM project_clips_current WHERE clip_id = ?',
        [clipId],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!['file_id']).toBe(linkedFileId);
    });

    it('throws ValidationError when file is not linked to the project', async () => {
      const service = await svc();

      await expect(
        service.createClip({
          clipId: randomUUID(),
          projectId,
          trackId: randomUUID(),
          type: 'video',
          fileId: unlinkedFileId,
          startFrame: 0,
          durationFrames: 30,
        }),
      ).rejects.toMatchObject({ name: 'ValidationError' });
    });

    it('inserts a clip without a file reference (text-overlay / caption)', async () => {
      const service = await svc();
      const clipId = randomUUID();
      cleanupClipIds.push(clipId);

      await expect(
        service.createClip({
          clipId,
          projectId,
          trackId: randomUUID(),
          type: 'caption',
          fileId: null,
          startFrame: 10,
          durationFrames: 60,
        }),
      ).resolves.toBeUndefined();

      const [rows] = await conn.execute<import('mysql2/promise').RowDataPacket[]>(
        'SELECT clip_id, file_id FROM project_clips_current WHERE clip_id = ?',
        [clipId],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!['file_id']).toBeNull();
    });

    it('throws ValidationError when fileId references a completely unknown file', async () => {
      const service = await svc();
      const phantomFileId = randomUUID();

      await expect(
        service.createClip({
          clipId: randomUUID(),
          projectId,
          trackId: randomUUID(),
          type: 'video',
          fileId: phantomFileId,
          startFrame: 0,
          durationFrames: 30,
        }),
      ).rejects.toMatchObject({ name: 'ValidationError' });
    });
  });
});
