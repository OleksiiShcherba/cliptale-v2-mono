/**
 * Integration tests for caption.service — file-referenced caption track creation.
 *
 * Verifies that:
 *   - insertCaptionTrack stores a track with the correct file_id.
 *   - getCaptionTrackByFileId retrieves the stored track.
 *   - getCaptions returns segments when a track exists.
 *   - transcribeAsset returns NotFoundError for an unknown file_id.
 *
 * Runs against a real MySQL instance (docker compose up db).
 *
 * Run:
 *   APP_DB_PASSWORD=cliptale vitest run src/services/caption.service.integration.test.ts
 */
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mysql, { type Connection } from 'mysql2/promise';

// ── Env vars before any app module import ────────────────────────────────────
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
  APP_JWT_SECRET:           'caption-svc-int-test-secret-32chars!!',
  APP_DEV_AUTH_BYPASS:      'false',
});

// Mock BullMQ to avoid Redis dependency.
vi.mock('@/queues/bullmq.js', () => ({
  QUEUE_MEDIA_INGEST: 'media-ingest',
  QUEUE_RENDER: 'render',
  QUEUE_TRANSCRIPTION: 'transcription',
  connection: {},
  transcriptionQueue: {
    add: vi.fn().mockResolvedValue({ id: 'mock-transcription-job' }),
    getJob: vi.fn().mockResolvedValue(null),
    on: vi.fn(),
  },
  mediaIngestQueue: {
    add: vi.fn().mockResolvedValue({ id: 'mock-job-id' }),
    getJob: vi.fn().mockResolvedValue(null),
    on: vi.fn(),
  },
  renderQueue: {
    add: vi.fn().mockResolvedValue({ id: 'mock-job-id' }),
    getJob: vi.fn().mockResolvedValue(null),
    on: vi.fn(),
  },
}));

// ─────────────────────────────────────────────────────────────────────────────

let conn: Connection;
const CAPT_INT_USER = `csvi-${randomUUID().slice(0, 8)}`;

let seededFileId: string;
let seededFileId2: string;
const cleanupTrackIds: string[] = [];

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
    [CAPT_INT_USER, `${CAPT_INT_USER}@test.com`, CAPT_INT_USER],
  );

  // Seed file 1 — no caption track
  seededFileId = randomUUID();
  await conn.execute(
    `INSERT INTO files (file_id, user_id, kind, storage_uri, mime_type, display_name, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      seededFileId,
      CAPT_INT_USER,
      'video',
      `s3://test-bucket/files/${seededFileId}/video.mp4`,
      'video/mp4',
      'video.mp4',
      'ready',
    ],
  );

  // Seed file 2 — for duplicate-track test
  seededFileId2 = randomUUID();
  await conn.execute(
    `INSERT INTO files (file_id, user_id, kind, storage_uri, mime_type, display_name, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      seededFileId2,
      CAPT_INT_USER,
      'video',
      `s3://test-bucket/files/${seededFileId2}/video2.mp4`,
      'video/mp4',
      'video2.mp4',
      'ready',
    ],
  );
});

afterAll(async () => {
  if (cleanupTrackIds.length) {
    await conn.query(
      `DELETE FROM caption_tracks WHERE caption_track_id IN (${cleanupTrackIds.map(() => '?').join(',')})`,
      cleanupTrackIds,
    );
  }
  await conn.execute('DELETE FROM files WHERE file_id IN (?, ?)', [seededFileId, seededFileId2]);
  await conn.execute('DELETE FROM users WHERE user_id = ?', [CAPT_INT_USER]);
  await conn.end();
});

// Lazy imports after env vars and mocks are in place.
async function captionRepo() {
  return import('@/repositories/caption.repository.js');
}
async function captionSvc() {
  return import('./caption.service.js');
}

describe('caption.service + caption.repository integration', () => {
  describe('insertCaptionTrack + getCaptionTrackByFileId', () => {
    it('stores a caption track referencing a files.file_id and retrieves it', async () => {
      const repo = await captionRepo();
      const trackId = randomUUID();
      cleanupTrackIds.push(trackId);

      const segments = [
        { start: 0.0, end: 1.5, text: 'Test segment one' },
        { start: 1.5, end: 3.0, text: 'Test segment two' },
      ];

      await repo.insertCaptionTrack({
        captionTrackId: trackId,
        fileId: seededFileId,
        projectId: 'proj-int-test',
        language: 'en',
        segmentsJson: segments,
      });

      const retrieved = await repo.getCaptionTrackByFileId(seededFileId);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.captionTrackId).toBe(trackId);
      expect(retrieved!.fileId).toBe(seededFileId);
      expect(retrieved!.segments).toEqual(segments);
    });

    it('returns null when no caption track exists for the file', async () => {
      const repo = await captionRepo();
      const result = await repo.getCaptionTrackByFileId(randomUUID());
      expect(result).toBeNull();
    });

    it('INSERT IGNORE silently ignores a duplicate caption_track_id (same UUID inserted twice)', async () => {
      const repo = await captionRepo();
      const trackId = randomUUID();
      cleanupTrackIds.push(trackId);

      const segments = [{ start: 0.0, end: 1.0, text: 'First writer wins' }];

      await repo.insertCaptionTrack({
        captionTrackId: trackId,
        fileId: seededFileId2,
        projectId: 'proj-int-dup',
        language: 'en',
        segmentsJson: segments,
      });

      // Second insert with the same captionTrackId PK should be silently ignored.
      await expect(
        repo.insertCaptionTrack({
          captionTrackId: trackId,
          fileId: seededFileId2,
          projectId: 'proj-int-dup',
          language: 'en',
          segmentsJson: [{ start: 0.0, end: 1.0, text: 'Second writer loses' }],
        }),
      ).resolves.toBeUndefined();

      // Confirm original track is unchanged.
      const retrieved = await repo.getCaptionTrackByFileId(seededFileId2);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.captionTrackId).toBe(trackId);
      expect(retrieved!.segments[0]?.text).toBe('First writer wins');
    });
  });

  describe('getCaptions', () => {
    it('returns segments when a caption track exists for the file', async () => {
      const svc = await captionSvc();

      // seededFileId already has a track from the first test above.
      const result = await svc.getCaptions(seededFileId);
      expect(result.segments).toEqual([
        { start: 0.0, end: 1.5, text: 'Test segment one' },
        { start: 1.5, end: 3.0, text: 'Test segment two' },
      ]);
    });
  });

  describe('transcribeAsset', () => {
    it('throws NotFoundError when file_id does not exist in files table', async () => {
      const svc = await captionSvc();
      const { NotFoundError } = await import('@/lib/errors.js');

      await expect(svc.transcribeAsset(randomUUID())).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
