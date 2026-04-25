/**
 * Integration tests for `asset.repository.ts` after the Files-as-Root migration.
 *
 * These tests verify that every exported function operates correctly against
 * the `files` + `project_files` tables (not the dropped `project_assets_current`).
 *
 * Prerequisites: Docker Compose `db` service must be running.
 * Run:
 *   APP_DB_PASSWORD=cliptale vitest run src/__tests__/integration/asset-repository.integration.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql, { type Connection } from 'mysql2/promise';
import { randomUUID } from 'node:crypto';

// ── Env bootstrap (must happen before any app import) ─────────────────────────
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
  APP_JWT_SECRET:           'integration-test-jwt-secret-exactly-32ch!',
  APP_DEV_AUTH_BYPASS:      'true',
});

import {
  insertPendingAsset,
  getAssetById,
  getAssetsByProjectId,
  isAssetReferencedByClip,
  deleteAssetById,
  updateAssetStatus,
  updateAssetDisplayName,
  findReadyForUser,
  getReadyTotalsForUser,
} from '../../repositories/asset.repository.js';

// ── Test fixtures ─────────────────────────────────────────────────────────────

let conn: Connection;

/** User IDs used by this suite — isolated from other suites. */
const TEST_USER_A = 'ar-integ-user-a';
const TEST_USER_B = 'ar-integ-user-b';
/** Project ID used for project-scoped tests. */
const TEST_PROJECT = 'ar-integ-project-001';

/**
 * All file IDs inserted during this suite.
 * Tracked so afterAll can clean them up in FK-safe order.
 */
const trackedFileIds: string[] = [];

/** Generates a unique file ID and records it for cleanup. */
function newFileId(): string {
  const id = `ar-integ-${randomUUID().slice(0, 12)}`;
  trackedFileIds.push(id);
  return id;
}

beforeAll(async () => {
  conn = await mysql.createConnection({
    host:     process.env['APP_DB_HOST']     ?? 'localhost',
    port:     Number(process.env['APP_DB_PORT'] ?? 3306),
    database: process.env['APP_DB_NAME']     ?? 'cliptale',
    user:     process.env['APP_DB_USER']     ?? 'cliptale',
    password: process.env['APP_DB_PASSWORD'] ?? 'cliptale',
  });

  // Create test users so files FK constraint is satisfied
  await conn.execute(
    `INSERT IGNORE INTO users (user_id, email, display_name) VALUES (?, ?, ?)`,
    [TEST_USER_A, `${TEST_USER_A}@test.local`, 'Test User A'],
  );
  await conn.execute(
    `INSERT IGNORE INTO users (user_id, email, display_name) VALUES (?, ?, ?)`,
    [TEST_USER_B, `${TEST_USER_B}@test.local`, 'Test User B'],
  );
  // Create test project so project_files FK constraint is satisfied
  await conn.execute(
    `INSERT IGNORE INTO projects (project_id, owner_user_id, title) VALUES (?, ?, ?)`,
    [TEST_PROJECT, TEST_USER_A, 'Test Project'],
  );
});

afterAll(async () => {
  if (trackedFileIds.length) {
    const ph = trackedFileIds.map(() => '?').join(',');
    // FK-safe order: project_clips_current → project_files → files
    await conn.query(
      `DELETE FROM project_clips_current WHERE file_id IN (${ph})`,
      trackedFileIds,
    );
    await conn.query(
      `DELETE FROM project_files WHERE file_id IN (${ph})`,
      trackedFileIds,
    );
    await conn.query(
      `DELETE FROM files WHERE file_id IN (${ph})`,
      trackedFileIds,
    );
  }
  // Clean up test users and project
  await conn.query(`DELETE FROM projects WHERE project_id = ?`, [TEST_PROJECT]);
  await conn.query(`DELETE FROM users WHERE user_id IN (?, ?)`, [TEST_USER_A, TEST_USER_B]);
  await conn.end();
});

// ── insertPendingAsset ────────────────────────────────────────────────────────

describe('asset.repository integration — insertPendingAsset', () => {
  it('inserts a row into files and a pivot row into project_files', async () => {
    const fileId = newFileId();

    await insertPendingAsset({
      fileId,
      projectId: TEST_PROJECT,
      userId: TEST_USER_A,
      filename: 'test-video.mp4',
      contentType: 'video/mp4',
      fileSizeBytes: 5000,
      storageUri: `s3://test/${fileId}.mp4`,
    });

    const [fileRows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT * FROM files WHERE file_id = ?',
      [fileId],
    );
    expect(fileRows).toHaveLength(1);
    expect(fileRows[0]!['status']).toBe('pending');
    expect(fileRows[0]!['mime_type']).toBe('video/mp4');
    expect(fileRows[0]!['kind']).toBe('video');

    const [pivotRows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT * FROM project_files WHERE file_id = ? AND project_id = ?',
      [fileId, TEST_PROJECT],
    );
    expect(pivotRows).toHaveLength(1);
  });

  it('derives kind=image for image/* content types', async () => {
    const fileId = newFileId();

    await insertPendingAsset({
      fileId,
      projectId: TEST_PROJECT,
      userId: TEST_USER_A,
      filename: 'photo.png',
      contentType: 'image/png',
      fileSizeBytes: 200,
      storageUri: `s3://test/${fileId}.png`,
    });

    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT kind FROM files WHERE file_id = ?',
      [fileId],
    );
    expect(rows[0]!['kind']).toBe('image');
  });

  it('derives kind=audio for audio/* content types', async () => {
    const fileId = newFileId();

    await insertPendingAsset({
      fileId,
      projectId: TEST_PROJECT,
      userId: TEST_USER_A,
      filename: 'track.mp3',
      contentType: 'audio/mpeg',
      fileSizeBytes: 300,
      storageUri: `s3://test/${fileId}.mp3`,
    });

    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT kind FROM files WHERE file_id = ?',
      [fileId],
    );
    expect(rows[0]!['kind']).toBe('audio');
  });
});

// ── getAssetById ──────────────────────────────────────────────────────────────

describe('asset.repository integration — getAssetById', () => {
  it('returns null when the file does not exist', async () => {
    const result = await getAssetById('nonexistent-file-id');
    expect(result).toBeNull();
  });

  it('returns the Asset with projectId from the project_files pivot', async () => {
    const fileId = newFileId();

    await insertPendingAsset({
      fileId,
      projectId: TEST_PROJECT,
      userId: TEST_USER_A,
      filename: 'getbyid-test.mp4',
      contentType: 'video/mp4',
      fileSizeBytes: 1000,
      storageUri: `s3://test/${fileId}.mp4`,
    });

    const asset = await getAssetById(fileId);

    expect(asset).not.toBeNull();
    expect(asset!.fileId).toBe(fileId);
    expect(asset!.projectId).toBe(TEST_PROJECT);
    expect(asset!.userId).toBe(TEST_USER_A);
    expect(asset!.contentType).toBe('video/mp4');
    expect(asset!.status).toBe('pending');
  });

  it('returns projectId as empty string for a file with no project link', async () => {
    const fileId = newFileId();

    // Insert directly into files without a project_files pivot row.
    await conn.execute(
      `INSERT INTO files (file_id, user_id, kind, storage_uri, mime_type, display_name, bytes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [fileId, TEST_USER_A, 'video', `s3://test/${fileId}.mp4`, 'video/mp4', 'orphan.mp4', 100],
    );

    const asset = await getAssetById(fileId);

    expect(asset).not.toBeNull();
    // projectId is empty string when the file has no project_files row
    expect(asset!.projectId).toBe('');
  });
});

// ── getAssetsByProjectId ──────────────────────────────────────────────────────

describe('asset.repository integration — getAssetsByProjectId', () => {
  it('returns an empty array when the project has no files', async () => {
    const result = await getAssetsByProjectId('ar-integ-empty-project');
    expect(result).toEqual([]);
  });

  it('returns only files linked to the specified project', async () => {
    const fileId1 = newFileId();
    const fileId2 = newFileId();
    const otherProject = 'ar-integ-other-proj';

    await insertPendingAsset({
      fileId: fileId1,
      projectId: TEST_PROJECT,
      userId: TEST_USER_A,
      filename: 'proj-file-1.mp4',
      contentType: 'video/mp4',
      fileSizeBytes: 1000,
      storageUri: `s3://test/${fileId1}.mp4`,
    });

    await insertPendingAsset({
      fileId: fileId2,
      projectId: otherProject,
      userId: TEST_USER_A,
      filename: 'other-proj-file.mp4',
      contentType: 'video/mp4',
      fileSizeBytes: 2000,
      storageUri: `s3://test/${fileId2}.mp4`,
    });

    const results = await getAssetsByProjectId(TEST_PROJECT);

    const ids = results.map((a) => a.fileId);
    expect(ids).toContain(fileId1);
    expect(ids).not.toContain(fileId2);
  });
});

// ── updateAssetStatus ─────────────────────────────────────────────────────────

describe('asset.repository integration — updateAssetStatus', () => {
  it('transitions status from pending to processing', async () => {
    const fileId = newFileId();

    await insertPendingAsset({
      fileId,
      projectId: TEST_PROJECT,
      userId: TEST_USER_A,
      filename: 'status-test.mp4',
      contentType: 'video/mp4',
      fileSizeBytes: 500,
      storageUri: `s3://test/${fileId}.mp4`,
    });

    await updateAssetStatus(fileId, 'processing');

    const asset = await getAssetById(fileId);
    expect(asset!.status).toBe('processing');
    expect(asset!.errorMessage).toBeNull();
  });

  it('sets errorMessage when status is error', async () => {
    const fileId = newFileId();

    await insertPendingAsset({
      fileId,
      projectId: TEST_PROJECT,
      userId: TEST_USER_A,
      filename: 'error-test.mp4',
      contentType: 'video/mp4',
      fileSizeBytes: 500,
      storageUri: `s3://test/${fileId}.mp4`,
    });

    await updateAssetStatus(fileId, 'error', 'Ingest pipeline failed');

    const asset = await getAssetById(fileId);
    expect(asset!.status).toBe('error');
    expect(asset!.errorMessage).toBe('Ingest pipeline failed');
  });
});

// ── updateAssetDisplayName ────────────────────────────────────────────────────

describe('asset.repository integration — updateAssetDisplayName', () => {
  it('sets the display name and persists it to the files table', async () => {
    const fileId = newFileId();

    await insertPendingAsset({
      fileId,
      projectId: TEST_PROJECT,
      userId: TEST_USER_A,
      filename: 'rename-me.mp4',
      contentType: 'video/mp4',
      fileSizeBytes: 500,
      storageUri: `s3://test/${fileId}.mp4`,
    });

    await updateAssetDisplayName(fileId, 'My Renamed File');

    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT display_name FROM files WHERE file_id = ?',
      [fileId],
    );
    expect(rows[0]!['display_name']).toBe('My Renamed File');
  });

  it('clears the display name when null is passed', async () => {
    const fileId = newFileId();

    await insertPendingAsset({
      fileId,
      projectId: TEST_PROJECT,
      userId: TEST_USER_A,
      filename: 'clear-name.mp4',
      contentType: 'video/mp4',
      fileSizeBytes: 500,
      storageUri: `s3://test/${fileId}.mp4`,
    });

    await updateAssetDisplayName(fileId, 'Initial Name');
    await updateAssetDisplayName(fileId, null);

    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT display_name FROM files WHERE file_id = ?',
      [fileId],
    );
    expect(rows[0]!['display_name']).toBeNull();
  });

  it('is a silent no-op when the fileId does not exist', async () => {
    await expect(
      updateAssetDisplayName('nonexistent-file-id-xyz', 'Name'),
    ).resolves.toBeUndefined();
  });
});

// ── deleteAssetById ───────────────────────────────────────────────────────────

describe('asset.repository integration — deleteAssetById', () => {
  it('removes the file and its project_files pivot row', async () => {
    const fileId = newFileId();

    await insertPendingAsset({
      fileId,
      projectId: TEST_PROJECT,
      userId: TEST_USER_A,
      filename: 'delete-me.mp4',
      contentType: 'video/mp4',
      fileSizeBytes: 500,
      storageUri: `s3://test/${fileId}.mp4`,
    });

    await deleteAssetById(fileId);

    const [fileRows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT * FROM files WHERE file_id = ?',
      [fileId],
    );
    expect(fileRows).toHaveLength(0);

    const [pivotRows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT * FROM project_files WHERE file_id = ?',
      [fileId],
    );
    expect(pivotRows).toHaveLength(0);

    // Remove from tracking since already deleted
    const idx = trackedFileIds.indexOf(fileId);
    if (idx !== -1) trackedFileIds.splice(idx, 1);
  });

  it('is a silent no-op when the fileId does not exist', async () => {
    await expect(deleteAssetById('nonexistent-file-id-delete')).resolves.toBeUndefined();
  });
});

// ── isAssetReferencedByClip ───────────────────────────────────────────────────

describe('asset.repository integration — isAssetReferencedByClip', () => {
  it('returns false when no clip references the file', async () => {
    const fileId = newFileId();

    await insertPendingAsset({
      fileId,
      projectId: TEST_PROJECT,
      userId: TEST_USER_A,
      filename: 'unreferenced.mp4',
      contentType: 'video/mp4',
      fileSizeBytes: 500,
      storageUri: `s3://test/${fileId}.mp4`,
    });

    const result = await isAssetReferencedByClip(fileId);
    expect(result).toBe(false);
  });

  it('returns true when a project_clips_current row references the file via file_id', async () => {
    const fileId = newFileId();
    const clipId = `ar-integ-clip-${randomUUID().slice(0, 8)}`;
    const trackId = `ar-integ-track-${randomUUID().slice(0, 8)}`;

    await insertPendingAsset({
      fileId,
      projectId: TEST_PROJECT,
      userId: TEST_USER_A,
      filename: 'referenced.mp4',
      contentType: 'video/mp4',
      fileSizeBytes: 500,
      storageUri: `s3://test/${fileId}.mp4`,
    });

    // Insert a clip row referencing this file via file_id (new schema column).
    await conn.execute(
      `INSERT INTO project_clips_current
         (clip_id, project_id, track_id, type, file_id, start_frame, duration_frames)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [clipId, TEST_PROJECT, trackId, 'video', fileId, 0, 30],
    );

    const result = await isAssetReferencedByClip(fileId);
    expect(result).toBe(true);

    // Clean up clip row before afterAll teardown attempts to clean the file.
    await conn.execute('DELETE FROM project_clips_current WHERE clip_id = ?', [clipId]);
  });
});

// ── findReadyForUser ──────────────────────────────────────────────────────────

describe('asset.repository integration — findReadyForUser', () => {
  it('returns only ready files owned by the specified user', async () => {
    const fileId = newFileId();

    // Insert directly with status=ready to test the list query.
    await conn.execute(
      `INSERT INTO files
         (file_id, user_id, kind, storage_uri, mime_type, bytes, status, display_name)
       VALUES (?, ?, ?, ?, ?, ?, 'ready', ?)`,
      [fileId, TEST_USER_B, 'image', `s3://test/${fileId}.png`, 'image/png', 1000, 'gallery.png'],
    );

    const results = await findReadyForUser({ userId: TEST_USER_B, limit: 50 });

    const ids = results.map((a) => a.fileId);
    expect(ids).toContain(fileId);
    // All returned items should be ready and owned by TEST_USER_B
    results.forEach((a) => {
      expect(a.status).toBe('ready');
      expect(a.userId).toBe(TEST_USER_B);
    });
  });

  it('filters by MIME prefix when mimePrefix is provided', async () => {
    const videoFileId = newFileId();
    const imageFileId = newFileId();

    await conn.execute(
      `INSERT INTO files
         (file_id, user_id, kind, storage_uri, mime_type, bytes, status, display_name)
       VALUES (?, ?, ?, ?, ?, ?, 'ready', ?)`,
      [videoFileId, TEST_USER_B, 'video', `s3://test/${videoFileId}.mp4`, 'video/mp4', 2000, 'v.mp4'],
    );
    await conn.execute(
      `INSERT INTO files
         (file_id, user_id, kind, storage_uri, mime_type, bytes, status, display_name)
       VALUES (?, ?, ?, ?, ?, ?, 'ready', ?)`,
      [imageFileId, TEST_USER_B, 'image', `s3://test/${imageFileId}.jpg`, 'image/jpeg', 500, 'i.jpg'],
    );

    const videoResults = await findReadyForUser({ userId: TEST_USER_B, mimePrefix: 'video/', limit: 50 });
    const videoIds = videoResults.map((a) => a.fileId);
    expect(videoIds).toContain(videoFileId);
    expect(videoIds).not.toContain(imageFileId);
  });

  it('returns thumbnailUri as null for all rows (no thumbnail_uri on files)', async () => {
    const fileId = newFileId();

    await conn.execute(
      `INSERT INTO files
         (file_id, user_id, kind, storage_uri, mime_type, bytes, status, display_name)
       VALUES (?, ?, ?, ?, ?, ?, 'ready', ?)`,
      [fileId, TEST_USER_B, 'video', `s3://test/${fileId}.mp4`, 'video/mp4', 100, 'null-thumb.mp4'],
    );

    const results = await findReadyForUser({ userId: TEST_USER_B, limit: 50 });
    results.forEach((a) => {
      expect(a.thumbnailUri).toBeNull();
    });
  });
});

// ── getReadyTotalsForUser ─────────────────────────────────────────────────────

describe('asset.repository integration — getReadyTotalsForUser', () => {
  it('returns an empty array when the user has no ready files', async () => {
    const result = await getReadyTotalsForUser('ar-integ-no-files-user');
    expect(result).toEqual([]);
  });

  it('returns per-bucket counts and bytes summed from the files table', async () => {
    const videoId = newFileId();
    const imageId = newFileId();

    await conn.execute(
      `INSERT INTO files
         (file_id, user_id, kind, storage_uri, mime_type, bytes, status, display_name)
       VALUES (?, ?, ?, ?, ?, ?, 'ready', ?)`,
      [videoId, TEST_USER_B, 'video', `s3://test/${videoId}.mp4`, 'video/mp4', 3000, 'totals-v.mp4'],
    );
    await conn.execute(
      `INSERT INTO files
         (file_id, user_id, kind, storage_uri, mime_type, bytes, status, display_name)
       VALUES (?, ?, ?, ?, ?, ?, 'ready', ?)`,
      [imageId, TEST_USER_B, 'image', `s3://test/${imageId}.jpg`, 'image/jpeg', 700, 'totals-i.jpg'],
    );

    const totals = await getReadyTotalsForUser(TEST_USER_B);

    const videoRow = totals.find((r) => r.mimePrefix === 'video/');
    const imageRow = totals.find((r) => r.mimePrefix === 'image/');
    expect(videoRow).toBeDefined();
    expect(imageRow).toBeDefined();
    expect(typeof videoRow!.count).toBe('number');
    expect(typeof videoRow!.bytes).toBe('number');
  });
});
