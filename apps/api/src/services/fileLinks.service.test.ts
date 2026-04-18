/**
 * Integration tests for fileLinks.service.ts.
 *
 * Calls the service functions directly and verifies business logic:
 *   - linkFileToProject / linkFileToDraft: ownership checks + idempotency.
 *   - getFilesForProject / getFilesForDraft: returns correct rows via pivot JOIN.
 *
 * Requires a live MySQL instance (docker compose up db).
 * No mocks for the database layer — all SQL hits a real MySQL database.
 *
 * Run:
 *   APP_DB_PASSWORD=cliptale vitest run src/services/fileLinks.service.test.ts
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
  APP_JWT_SECRET:           'file-links-svc-test-secret-32chars!!',
  APP_DEV_AUTH_BYPASS:      'false',
});

// ─────────────────────────────────────────────────────────────────────────────

let conn: Connection;

const USER_A = `fsva-${randomUUID().slice(0, 8)}`;
const USER_B = `fsvb-${randomUUID().slice(0, 8)}`;

let projectA: string;
let projectB: string;
let draftA: string;
let fileA: string;
let fileB: string;

const cleanupFiles: string[] = [];
const cleanupProjects: string[] = [];
const cleanupDrafts: string[] = [];

beforeAll(async () => {
  conn = await mysql.createConnection({
    host:     process.env['APP_DB_HOST']     ?? 'localhost',
    port:     Number(process.env['APP_DB_PORT'] ?? 3306),
    database: process.env['APP_DB_NAME']     ?? 'cliptale',
    user:     process.env['APP_DB_USER']     ?? 'cliptale',
    password: process.env['APP_DB_PASSWORD'] ?? 'cliptale',
  });

  // Seed users
  for (const [uid, email] of [
    [USER_A, `${USER_A}@test.com`],
    [USER_B, `${USER_B}@test.com`],
  ]) {
    await conn.execute(
      `INSERT INTO users (user_id, email, display_name, email_verified) VALUES (?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE user_id = user_id`,
      [uid, email, uid],
    );
  }

  // Seed projects
  projectA = randomUUID();
  projectB = randomUUID();
  cleanupProjects.push(projectA, projectB);

  await conn.execute(
    'INSERT INTO projects (project_id, owner_user_id, title) VALUES (?, ?, ?)',
    [projectA, USER_A, 'Svc Test Project A'],
  );
  await conn.execute(
    'INSERT INTO projects (project_id, owner_user_id, title) VALUES (?, ?, ?)',
    [projectB, USER_B, 'Svc Test Project B'],
  );

  // Seed draft
  draftA = randomUUID();
  cleanupDrafts.push(draftA);
  await conn.execute(
    `INSERT INTO generation_drafts (id, user_id, prompt_doc) VALUES (?, ?, ?)`,
    [draftA, USER_A, JSON.stringify({ schemaVersion: 1, blocks: [] })],
  );

  // Seed files
  fileA = randomUUID();
  fileB = randomUUID();
  cleanupFiles.push(fileA, fileB);

  await conn.execute(
    `INSERT INTO files (file_id, user_id, kind, storage_uri, mime_type, display_name)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [fileA, USER_A, 'video', 's3://test-bucket/a.mp4', 'video/mp4', 'a.mp4'],
  );
  await conn.execute(
    `INSERT INTO files (file_id, user_id, kind, storage_uri, mime_type, display_name)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [fileB, USER_B, 'image', 's3://test-bucket/b.png', 'image/png', 'b.png'],
  );
});

afterAll(async () => {
  // Remove pivots first
  if (cleanupFiles.length) {
    await conn.query(
      `DELETE FROM project_files WHERE file_id IN (${cleanupFiles.map(() => '?').join(',')})`,
      cleanupFiles,
    );
    await conn.query(
      `DELETE FROM draft_files WHERE file_id IN (${cleanupFiles.map(() => '?').join(',')})`,
      cleanupFiles,
    );
  }
  if (cleanupDrafts.length) {
    await conn.query(
      `DELETE FROM generation_drafts WHERE id IN (${cleanupDrafts.map(() => '?').join(',')})`,
      cleanupDrafts,
    );
  }
  if (cleanupFiles.length) {
    await conn.query(
      `DELETE FROM files WHERE file_id IN (${cleanupFiles.map(() => '?').join(',')})`,
      cleanupFiles,
    );
  }
  if (cleanupProjects.length) {
    await conn.query(
      `DELETE FROM projects WHERE project_id IN (${cleanupProjects.map(() => '?').join(',')})`,
      cleanupProjects,
    );
  }
  await conn.query(`DELETE FROM users WHERE user_id IN (?, ?)`, [USER_A, USER_B]);
  await conn.end();
});

// ── Lazy import of the service (after env vars are set) ───────────────────────
async function svc() {
  return import('./fileLinks.service.js');
}

// ── linkFileToProject ─────────────────────────────────────────────────────────

describe('fileLinks.service', () => {
  describe('linkFileToProject', () => {
    it('links a file to a project and returns { created: true }', async () => {
      const service = await svc();
      const result = await service.linkFileToProject(USER_A, projectA, fileA);
      expect(result).toEqual({ created: true });
    });

    it('is idempotent — double-link returns { created: false }', async () => {
      const service = await svc();
      // First link (already done above or may not be — ensure link exists)
      await service.linkFileToProject(USER_A, projectA, fileA);
      // Second link
      const result = await service.linkFileToProject(USER_A, projectA, fileA);
      expect(result).toEqual({ created: false });
    });

    it('throws ForbiddenError when the project is owned by another user', async () => {
      const service = await svc();
      await expect(
        service.linkFileToProject(USER_A, projectB, fileA),
      ).rejects.toMatchObject({ name: 'ForbiddenError' });
    });

    it('throws ForbiddenError when the file is owned by another user', async () => {
      const service = await svc();
      await expect(
        service.linkFileToProject(USER_A, projectA, fileB),
      ).rejects.toMatchObject({ name: 'ForbiddenError' });
    });

    it('throws NotFoundError when the project does not exist', async () => {
      const service = await svc();
      await expect(
        service.linkFileToProject(USER_A, randomUUID(), fileA),
      ).rejects.toMatchObject({ name: 'NotFoundError' });
    });

    it('throws NotFoundError when the file does not exist', async () => {
      const service = await svc();
      await expect(
        service.linkFileToProject(USER_A, projectA, randomUUID()),
      ).rejects.toMatchObject({ name: 'NotFoundError' });
    });
  });

  describe('getFilesForProject', () => {
    it('returns files linked via project_files pivot', async () => {
      const service = await svc();
      // Ensure fileA is linked to projectA
      await service.linkFileToProject(USER_A, projectA, fileA);

      const files = await service.getFilesForProject(projectA);
      const found = files.find((f) => f.fileId === fileA);
      expect(found).toBeDefined();
      expect(found!.userId).toBe(USER_A);
      expect(found!.mimeType).toBe('video/mp4');
    });

    it('returns an empty array when no files are linked', async () => {
      const service = await svc();
      const files = await service.getFilesForProject(projectB);
      expect(files).toEqual([]);
    });
  });

  describe('linkFileToDraft', () => {
    it('links a file to a draft and returns { created: true }', async () => {
      const service = await svc();
      const result = await service.linkFileToDraft(USER_A, draftA, fileA);
      expect(result).toEqual({ created: true });
    });

    it('is idempotent — double-link returns { created: false }', async () => {
      const service = await svc();
      await service.linkFileToDraft(USER_A, draftA, fileA);
      const result = await service.linkFileToDraft(USER_A, draftA, fileA);
      expect(result).toEqual({ created: false });
    });

    it('throws ForbiddenError when the draft is owned by another user', async () => {
      const service = await svc();
      await expect(
        service.linkFileToDraft(USER_B, draftA, fileB),
      ).rejects.toMatchObject({ name: 'ForbiddenError' });
    });

    it('throws ForbiddenError when the file is owned by another user', async () => {
      const service = await svc();
      await expect(
        service.linkFileToDraft(USER_A, draftA, fileB),
      ).rejects.toMatchObject({ name: 'ForbiddenError' });
    });

    it('throws NotFoundError when the draft does not exist', async () => {
      const service = await svc();
      await expect(
        service.linkFileToDraft(USER_A, randomUUID(), fileA),
      ).rejects.toMatchObject({ name: 'NotFoundError' });
    });
  });

  describe('getFilesForDraft', () => {
    it('returns files linked via draft_files pivot', async () => {
      const service = await svc();
      // Ensure fileA is linked to draftA
      await service.linkFileToDraft(USER_A, draftA, fileA);

      const files = await service.getFilesForDraft(draftA);
      const found = files.find((f) => f.fileId === fileA);
      expect(found).toBeDefined();
      expect(found!.userId).toBe(USER_A);
    });

    it('returns an empty array when no files are linked to the draft', async () => {
      const service = await svc();
      const emptyDraftId = randomUUID();
      await conn.execute(
        `INSERT INTO generation_drafts (id, user_id, prompt_doc) VALUES (?, ?, ?)`,
        [emptyDraftId, USER_A, JSON.stringify({ schemaVersion: 1, blocks: [] })],
      );
      cleanupDrafts.push(emptyDraftId);

      const files = await service.getFilesForDraft(emptyDraftId);
      expect(files).toEqual([]);
    });
  });
});
