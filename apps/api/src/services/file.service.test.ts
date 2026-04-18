/**
 * Integration tests for file.service.ts
 *
 * These tests run against a real MySQL instance (docker compose up db).
 * S3 and BullMQ are mocked to avoid external I/O.
 *
 * Run:
 *   APP_DB_PASSWORD=cliptale vitest run src/services/file.service.test.ts
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import mysql, { type Connection } from 'mysql2/promise';

// ── Mock S3 ───────────────────────────────────────────────────────────────────
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/presigned-url'),
}));

const mockS3Send = vi.fn().mockResolvedValue({});
const mockS3: import('@aws-sdk/client-s3').S3Client = {
  send: mockS3Send,
} as unknown as import('@aws-sdk/client-s3').S3Client;

// ── Mock BullMQ enqueue ───────────────────────────────────────────────────────
vi.mock('@/queues/jobs/enqueue-ingest.js', () => ({
  enqueueIngestJob: vi.fn().mockResolvedValue(undefined),
}));

// ── Mock config so the pool is created with test DB credentials ───────────────
Object.assign(process.env, {
  APP_DB_HOST:             process.env['APP_DB_HOST']             ?? 'localhost',
  APP_DB_PORT:             process.env['APP_DB_PORT']             ?? '3306',
  APP_DB_NAME:             process.env['APP_DB_NAME']             ?? 'cliptale',
  APP_DB_USER:             process.env['APP_DB_USER']             ?? 'cliptale',
  APP_DB_PASSWORD:         process.env['APP_DB_PASSWORD']         ?? 'cliptale',
  APP_REDIS_URL:           process.env['APP_REDIS_URL']           ?? 'redis://localhost:6379',
  APP_S3_BUCKET:           'test-bucket',
  APP_S3_REGION:           'us-east-1',
  APP_S3_ACCESS_KEY_ID:    'test-key-id',
  APP_S3_SECRET_ACCESS_KEY:'test-secret-key',
  APP_JWT_SECRET:          'integration-test-jwt-secret-exactly32!',
  APP_FAL_KEY:             'test-fal-key',
  APP_ELEVENLABS_API_KEY:  'test-elevenlabs-key',
});

// ── Fixtures ──────────────────────────────────────────────────────────────────
import {
  FILE_TEST_USER_ID,
  OTHER_USER_ID,
  insertedFileIds,
  seedFile,
  ensureUser,
  cleanupFiles,
} from './file.service.fixtures.js';

// ── Service under test ────────────────────────────────────────────────────────
import {
  createUploadUrl,
  finalizeFile,
  listFiles,
  streamUrl,
} from './file.service.js';

import { ValidationError, NotFoundError } from '@/lib/errors.js';

// ── Setup / teardown ──────────────────────────────────────────────────────────

let conn: Connection;

beforeAll(async () => {
  conn = await mysql.createConnection({
    host:     process.env['APP_DB_HOST']     ?? 'localhost',
    port:     Number(process.env['APP_DB_PORT'] ?? 3306),
    database: process.env['APP_DB_NAME']     ?? 'cliptale',
    user:     process.env['APP_DB_USER']     ?? 'cliptale',
    password: process.env['APP_DB_PASSWORD'] ?? 'cliptale',
  });
  await ensureUser(conn, FILE_TEST_USER_ID);
  await ensureUser(conn, OTHER_USER_ID);
});

afterAll(async () => {
  await cleanupFiles(conn, insertedFileIds);
  await conn.end();
});

beforeEach(() => {
  vi.clearAllMocks();
  mockS3Send.mockResolvedValue({});
});

// ── createUploadUrl ───────────────────────────────────────────────────────────

describe('file.service.createUploadUrl', () => {
  it('returns fileId, uploadUrl, storageUri, expiresAt on happy path', async () => {
    const result = await createUploadUrl(
      { userId: FILE_TEST_USER_ID, filename: 'clip.mp4', mimeType: 'video/mp4', fileSizeBytes: 1_000 },
      mockS3,
      'test-bucket',
    );

    expect(result.fileId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.uploadUrl).toBe('https://s3.example.com/presigned-url');
    expect(result.storageUri).toContain('s3://test-bucket/users/');
    expect(result.expiresAt).toBeTruthy();

    insertedFileIds.push(result.fileId);

    // Verify row in DB
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT status, mime_type FROM files WHERE file_id = ?',
      [result.fileId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!['status']).toBe('pending');
    expect(rows[0]!['mime_type']).toBe('video/mp4');
  });

  it('throws ValidationError for a disallowed MIME type', async () => {
    await expect(
      createUploadUrl(
        { userId: FILE_TEST_USER_ID, filename: 'malware.exe', mimeType: 'application/octet-stream', fileSizeBytes: 1_000 },
        mockS3,
        'test-bucket',
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws ValidationError for fileSizeBytes = 0', async () => {
    await expect(
      createUploadUrl(
        { userId: FILE_TEST_USER_ID, filename: 'empty.mp4', mimeType: 'video/mp4', fileSizeBytes: 0 },
        mockS3,
        'test-bucket',
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws ValidationError when filename reduces to only underscores after sanitization', async () => {
    await expect(
      createUploadUrl(
        { userId: FILE_TEST_USER_ID, filename: '!!!', mimeType: 'video/mp4', fileSizeBytes: 100 },
        mockS3,
        'test-bucket',
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

// ── finalizeFile ──────────────────────────────────────────────────────────────

describe('file.service.finalizeFile', () => {
  it('transitions pending → processing and enqueues ingest job', async () => {
    const fileId = await seedFile(conn, {
      userId: FILE_TEST_USER_ID,
      status: 'pending',
      storageUri: 's3://test-bucket/users/file-svc-test-user-001/files/finalize-test/clip.mp4',
    });

    const result = await finalizeFile(fileId, FILE_TEST_USER_ID, mockS3);
    expect(result.status).toBe('processing');

    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT status FROM files WHERE file_id = ?',
      [fileId],
    );
    expect(rows[0]!['status']).toBe('processing');

    const { enqueueIngestJob } = await import('@/queues/jobs/enqueue-ingest.js');
    expect(enqueueIngestJob).toHaveBeenCalledOnce();
  });

  it('is idempotent when file is already processing', async () => {
    const fileId = await seedFile(conn, { userId: FILE_TEST_USER_ID, status: 'processing' });

    const result = await finalizeFile(fileId, FILE_TEST_USER_ID, mockS3);
    expect(result.status).toBe('processing');
    const { enqueueIngestJob } = await import('@/queues/jobs/enqueue-ingest.js');
    expect(enqueueIngestJob).not.toHaveBeenCalled();
  });

  it('is idempotent when file is already ready', async () => {
    const fileId = await seedFile(conn, { userId: FILE_TEST_USER_ID, status: 'ready' });

    const result = await finalizeFile(fileId, FILE_TEST_USER_ID, mockS3);
    expect(result.status).toBe('ready');
  });

  it('throws NotFoundError when file does not exist', async () => {
    await expect(
      finalizeFile('00000000-0000-0000-0000-000000000099', FILE_TEST_USER_ID, mockS3),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws NotFoundError when file belongs to another user', async () => {
    const fileId = await seedFile(conn, { userId: OTHER_USER_ID, status: 'pending' });
    await expect(
      finalizeFile(fileId, FILE_TEST_USER_ID, mockS3),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws ValidationError when object is absent from S3', async () => {
    const fileId = await seedFile(conn, { userId: FILE_TEST_USER_ID, status: 'pending' });
    const notFoundErr = Object.assign(new Error('Not Found'), { name: 'NotFound' });
    mockS3Send.mockRejectedValueOnce(notFoundErr);

    await expect(
      finalizeFile(fileId, FILE_TEST_USER_ID, mockS3),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

// ── listFiles ─────────────────────────────────────────────────────────────────

describe('file.service.listFiles', () => {
  it('returns ready files for the user', async () => {
    await seedFile(conn, { userId: FILE_TEST_USER_ID, status: 'ready', mimeType: 'video/mp4' });

    const result = await listFiles({
      userId: FILE_TEST_USER_ID,
      type: 'all',
      limit: 10,
    });

    expect(result.items.length).toBeGreaterThanOrEqual(1);
    expect(result.items.every((f) => f.status === 'ready')).toBe(true);
  });

  it('does not return files belonging to another user (ownership isolation)', async () => {
    const otherFileId = await seedFile(conn, { userId: OTHER_USER_ID, status: 'ready' });
    const result = await listFiles({ userId: FILE_TEST_USER_ID, type: 'all', limit: 100 });
    // The other user's file must not appear in the result.
    expect(result.items.map((f) => f.id)).not.toContain(otherFileId);
  });

  it('filters by type', async () => {
    await seedFile(conn, { userId: FILE_TEST_USER_ID, status: 'ready', mimeType: 'image/png' });
    await seedFile(conn, { userId: FILE_TEST_USER_ID, status: 'ready', mimeType: 'video/mp4' });

    const result = await listFiles({ userId: FILE_TEST_USER_ID, type: 'image', limit: 50 });

    expect(result.items.every((f) => f.mimeType?.startsWith('image/'))).toBe(true);
  });

  it('returns empty list when user has no ready files', async () => {
    const freshUserId = `list-no-files-user-${Date.now()}`;
    await ensureUser(conn, freshUserId);

    const result = await listFiles({ userId: freshUserId, type: 'all', limit: 10 });

    expect(result.items).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });

  it('cursor pagination: second page contains different items', async () => {
    // Seed 3 files so we can page with limit=2
    await seedFile(conn, { userId: FILE_TEST_USER_ID, status: 'ready' });
    await seedFile(conn, { userId: FILE_TEST_USER_ID, status: 'ready' });
    await seedFile(conn, { userId: FILE_TEST_USER_ID, status: 'ready' });

    const page1 = await listFiles({ userId: FILE_TEST_USER_ID, type: 'all', limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await listFiles({
      userId: FILE_TEST_USER_ID,
      type: 'all',
      limit: 2,
      cursor: page1.nextCursor!,
    });
    const page1Ids = new Set(page1.items.map((f) => f.id));
    expect(page2.items.every((f) => !page1Ids.has(f.id))).toBe(true);
  });
});

// ── streamUrl ─────────────────────────────────────────────────────────────────

describe('file.service.streamUrl', () => {
  it('returns a presigned GET URL for a file belonging to the caller', async () => {
    const fileId = await seedFile(conn, { userId: FILE_TEST_USER_ID, status: 'ready' });

    const url = await streamUrl(fileId, FILE_TEST_USER_ID, mockS3);

    expect(url).toBe('https://s3.example.com/presigned-url');
  });

  it('throws NotFoundError for a file belonging to another user', async () => {
    const fileId = await seedFile(conn, { userId: OTHER_USER_ID, status: 'ready' });

    await expect(
      streamUrl(fileId, FILE_TEST_USER_ID, mockS3),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws NotFoundError for a non-existent file', async () => {
    await expect(
      streamUrl('00000000-0000-0000-0000-000000099999', FILE_TEST_USER_ID, mockS3),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
