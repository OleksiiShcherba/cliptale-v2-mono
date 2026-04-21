/**
 * Integration tests for `findProjectsByUserId` thumbnail derivation (C3).
 *
 * Verifies that the correlated subquery correctly returns:
 *   1. The thumbnail_uri of the earliest (by start_frame) visual clip's file.
 *   2. Falls back to the first project-linked file when no clip is placed.
 *   3. Returns null thumbnailUrl/thumbnailFileId when no clips AND no linked files exist.
 *   4. Excludes soft-deleted files from the thumbnail pick.
 *
 * Requires a running MySQL instance (docker compose up db).
 * Run:
 *   APP_DB_PASSWORD=cliptale vitest run src/__tests__/integration/project-thumbnail.integration.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql, { type Connection } from 'mysql2/promise';
import { randomUUID } from 'node:crypto';

// ── Env bootstrap (before any app import) ─────────────────────────────────────
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
  APP_JWT_SECRET:           'project-thumbnail-integ-test-32chars!!',
  APP_DEV_AUTH_BYPASS:      'true',
});

import { findProjectsByUserId } from '../../repositories/project.repository.js';

// ── Test state ────────────────────────────────────────────────────────────────

let conn: Connection;

/** Unique user ID for this test suite — prevents collision with other suites. */
const USER_ID = `pt-user-${randomUUID().slice(0, 8)}`;

/** All project IDs, file IDs, and clip IDs created by this suite — cleaned up in afterAll. */
const projectIds: string[] = [];
const fileIds: string[] = [];
const clipIds: string[] = [];

// ── Helpers ───────────────────────────────────────────────────────────────────

async function insertUser(): Promise<void> {
  await conn.execute(
    `INSERT INTO users (user_id, email, display_name, email_verified)
     VALUES (?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE user_id = user_id`,
    [USER_ID, `${USER_ID}@test.com`, USER_ID],
  );
}

async function insertProject(id: string): Promise<void> {
  projectIds.push(id);
  await conn.execute(
    `INSERT INTO projects (project_id, owner_user_id, title) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE project_id = project_id`,
    [id, USER_ID, `Project ${id}`],
  );
}

async function insertFile(id: string, thumbnailUri: string | null = null, deletedAt: Date | null = null): Promise<void> {
  fileIds.push(id);
  await conn.execute(
    `INSERT INTO files
       (file_id, user_id, kind, storage_uri, mime_type, bytes, thumbnail_uri, deleted_at)
     VALUES (?, ?, 'video', ?, 'video/mp4', 1000, ?, ?)
     ON DUPLICATE KEY UPDATE file_id = file_id`,
    [id, USER_ID, `s3://bucket/${id}.mp4`, thumbnailUri, deletedAt],
  );
}

async function linkFileToProject(projectId: string, fileId: string): Promise<void> {
  await conn.execute(
    `INSERT INTO project_files (project_id, file_id)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE project_id = project_id`,
    [projectId, fileId],
  );
}

async function insertClip(
  clipId: string,
  projectId: string,
  fileId: string,
  startFrame: number,
  type: 'video' | 'audio' | 'image' = 'video',
): Promise<void> {
  clipIds.push(clipId);
  const trackId = `track-${randomUUID().slice(0, 8)}`;
  await conn.execute(
    `INSERT INTO project_clips_current
       (clip_id, project_id, track_id, type, file_id, start_frame, duration_frames)
     VALUES (?, ?, ?, ?, ?, ?, 30)
     ON DUPLICATE KEY UPDATE clip_id = clip_id`,
    [clipId, projectId, trackId, type, fileId, startFrame],
  );
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeAll(async () => {
  conn = await mysql.createConnection({
    host:     process.env['APP_DB_HOST']     ?? 'localhost',
    port:     Number(process.env['APP_DB_PORT'] ?? 3306),
    database: process.env['APP_DB_NAME']     ?? 'cliptale',
    user:     process.env['APP_DB_USER']     ?? 'cliptale',
    password: process.env['APP_DB_PASSWORD'] ?? 'cliptale',
  });
  await insertUser();
});

afterAll(async () => {
  if (clipIds.length) {
    await conn.query(
      `DELETE FROM project_clips_current WHERE clip_id IN (${clipIds.map(() => '?').join(',')})`,
      clipIds,
    );
  }
  if (fileIds.length) {
    await conn.query(
      `DELETE FROM project_files WHERE file_id IN (${fileIds.map(() => '?').join(',')})`,
      fileIds,
    );
    await conn.query(
      `DELETE FROM files WHERE file_id IN (${fileIds.map(() => '?').join(',')})`,
      fileIds,
    );
  }
  if (projectIds.length) {
    await conn.query(
      `DELETE FROM projects WHERE project_id IN (${projectIds.map(() => '?').join(',')})`,
      projectIds,
    );
  }
  await conn.execute('DELETE FROM users WHERE user_id = ?', [USER_ID]);
  await conn.end();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('findProjectsByUserId — thumbnail derivation (C3)', () => {
  it('returns thumbnailUrl from the earliest visual clip (lowest start_frame)', async () => {
    const projId = `pt-proj-a-${randomUUID().slice(0, 8)}`;
    const file1 = `pt-f1-${randomUUID().slice(0, 8)}`;
    const file2 = `pt-f2-${randomUUID().slice(0, 8)}`;
    const clip1 = `pt-c1-${randomUUID().slice(0, 8)}`;
    const clip2 = `pt-c2-${randomUUID().slice(0, 8)}`;

    await insertProject(projId);
    // file1 is at start_frame=10, file2 is at start_frame=0 — file2 should win
    await insertFile(file1, 's3://bucket/thumb1.jpg');
    await insertFile(file2, 's3://bucket/thumb2.jpg');
    await linkFileToProject(projId, file1);
    await linkFileToProject(projId, file2);
    await insertClip(clip1, projId, file1, 10);
    await insertClip(clip2, projId, file2, 0);

    const results = await findProjectsByUserId(USER_ID);
    const proj = results.find((r) => r.projectId === projId);

    expect(proj).toBeDefined();
    // file2 has start_frame=0 — it comes first
    expect(proj!.thumbnailUrl).toBe('s3://bucket/thumb2.jpg');
    expect(proj!.thumbnailFileId).toBe(file2);
  });

  it('ignores audio clips — only video and image clips count for thumbnail', async () => {
    const projId = `pt-proj-b-${randomUUID().slice(0, 8)}`;
    const fileAudio = `pt-fa-${randomUUID().slice(0, 8)}`;
    const fileVideo = `pt-fv-${randomUUID().slice(0, 8)}`;
    const clipAudio = `pt-ca-${randomUUID().slice(0, 8)}`;
    const clipVideo = `pt-cv-${randomUUID().slice(0, 8)}`;

    await insertProject(projId);
    // audio clip at start_frame=0, video clip at start_frame=5 — video should win
    await insertFile(fileAudio, 's3://bucket/audio-thumb.jpg');
    await insertFile(fileVideo, 's3://bucket/video-thumb.jpg');
    await linkFileToProject(projId, fileAudio);
    await linkFileToProject(projId, fileVideo);
    await insertClip(clipAudio, projId, fileAudio, 0, 'audio');
    await insertClip(clipVideo, projId, fileVideo, 5);

    const results = await findProjectsByUserId(USER_ID);
    const proj = results.find((r) => r.projectId === projId);

    expect(proj).toBeDefined();
    expect(proj!.thumbnailUrl).toBe('s3://bucket/video-thumb.jpg');
    expect(proj!.thumbnailFileId).toBe(fileVideo);
  });

  it('falls back to first linked file thumbnail when no visual clip is placed', async () => {
    const projId = `pt-proj-c-${randomUUID().slice(0, 8)}`;
    const fileId = `pt-fc-${randomUUID().slice(0, 8)}`;

    await insertProject(projId);
    await insertFile(fileId, 's3://bucket/fallback-thumb.jpg');
    await linkFileToProject(projId, fileId);
    // No clips inserted — fallback to project_files

    const results = await findProjectsByUserId(USER_ID);
    const proj = results.find((r) => r.projectId === projId);

    expect(proj).toBeDefined();
    expect(proj!.thumbnailUrl).toBe('s3://bucket/fallback-thumb.jpg');
    expect(proj!.thumbnailFileId).toBe(fileId);
  });

  it('returns null thumbnailUrl when no clips and no linked files exist', async () => {
    const projId = `pt-proj-d-${randomUUID().slice(0, 8)}`;

    await insertProject(projId);
    // No files, no clips

    const results = await findProjectsByUserId(USER_ID);
    const proj = results.find((r) => r.projectId === projId);

    expect(proj).toBeDefined();
    expect(proj!.thumbnailUrl).toBeNull();
    expect(proj!.thumbnailFileId).toBeNull();
  });

  it('returns null thumbnailUrl when the file has no thumbnail_uri set', async () => {
    const projId = `pt-proj-e-${randomUUID().slice(0, 8)}`;
    const fileId = `pt-fe-${randomUUID().slice(0, 8)}`;
    const clipId = `pt-ce-${randomUUID().slice(0, 8)}`;

    await insertProject(projId);
    // File exists and has no thumbnail_uri (null) — pre-ingest state
    await insertFile(fileId, null);
    await linkFileToProject(projId, fileId);
    await insertClip(clipId, projId, fileId, 0);

    const results = await findProjectsByUserId(USER_ID);
    const proj = results.find((r) => r.projectId === projId);

    expect(proj).toBeDefined();
    // thumbnailUrl is null because files.thumbnail_uri is null, but thumbnailFileId
    // is non-null because the file row exists — the controller will return null
    // thumbnailUrl since both must be non-null to build the proxy URL.
    expect(proj!.thumbnailUrl).toBeNull();
  });

  it('excludes soft-deleted files from the thumbnail pick (§B2 filter)', async () => {
    const projId = `pt-proj-f-${randomUUID().slice(0, 8)}`;
    const deletedFile = `pt-fdel-${randomUUID().slice(0, 8)}`;
    const activeFile  = `pt-fact-${randomUUID().slice(0, 8)}`;
    const deletedClip = `pt-cfdel-${randomUUID().slice(0, 8)}`;
    const activeClip  = `pt-cfact-${randomUUID().slice(0, 8)}`;

    await insertProject(projId);
    // Soft-deleted file at start_frame=0, active file at start_frame=5
    await insertFile(deletedFile, 's3://bucket/deleted-thumb.jpg', new Date('2024-01-01'));
    await insertFile(activeFile,  's3://bucket/active-thumb.jpg');
    await linkFileToProject(projId, deletedFile);
    await linkFileToProject(projId, activeFile);
    await insertClip(deletedClip, projId, deletedFile, 0);
    await insertClip(activeClip,  projId, activeFile,  5);

    const results = await findProjectsByUserId(USER_ID);
    const proj = results.find((r) => r.projectId === projId);

    expect(proj).toBeDefined();
    // Must NOT use the deleted file even though it has a lower start_frame
    expect(proj!.thumbnailUrl).toBe('s3://bucket/active-thumb.jpg');
    expect(proj!.thumbnailFileId).toBe(activeFile);
  });
});
