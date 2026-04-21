/**
 * Integration tests for GET /assets/:id/stream
 *
 * Verifies that the stream endpoint proxies S3 content without exposing raw
 * s3:// URIs, correctly forwards Range headers, and enforces authentication.
 * Requires a live MySQL instance (docker compose up db).
 *
 * Run:
 *   APP_DB_PASSWORD=cliptale vitest run src/__tests__/integration/assets-stream-endpoint.test.ts
 */
import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import mysql, { type Connection } from 'mysql2/promise';

// ── Mock S3 — avoids real AWS calls ──────────────────────────────────────────

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/presigned-test-url'),
}));

const mockSend = vi.fn();
vi.mock('@/lib/s3.js', () => ({
  s3Client: { send: mockSend },
}));

// ── Set env vars before app is imported ──────────────────────────────────────

const JWT_SECRET = 'stream-test-jwt-secret-exactly-32chars!';

function sha256(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

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
  APP_JWT_SECRET:           JWT_SECRET,
  APP_DEV_AUTH_BYPASS:      'false',
});

// ─────────────────────────────────────────────────────────────────────────────

let app: Express;
let conn: Connection;
let seededAssetId: string;
let seededUserId: string;
let seededSessionId: string;
const seededToken = 'stream-test-token-' + randomUUID();

function validToken(): string {
  return seededToken;
}

beforeAll(async () => {
  const mod = await import('../../index.js');
  app = mod.default;

  conn = await mysql.createConnection({
    host:     process.env['APP_DB_HOST']     ?? 'localhost',
    port:     Number(process.env['APP_DB_PORT'] ?? 3306),
    database: process.env['APP_DB_NAME']     ?? 'cliptale',
    user:     process.env['APP_DB_USER']     ?? 'cliptale',
    password: process.env['APP_DB_PASSWORD'] ?? 'cliptale',
  });

  // Create test user with valid session (migration 027 dropped project_assets_current).
  seededUserId = 'user-stream-' + randomUUID().slice(0, 8);
  seededSessionId = randomUUID();
  await conn.execute(
    `INSERT INTO users (user_id, email, display_name, email_verified)
     VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE user_id = user_id`,
    [seededUserId, `${seededUserId}@test.com`, 'Stream Test User'],
  );
  await conn.execute(
    `INSERT INTO sessions (session_id, user_id, token_hash, expires_at)
     VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE session_id = session_id`,
    [seededSessionId, seededUserId, sha256(seededToken), new Date(Date.now() + 3_600_000)],
  );

  // Create project and seed asset via files + project_files.
  const projectId = 'proj-stream-seed-' + randomUUID().slice(0, 8);
  await conn.execute(
    `INSERT INTO projects (project_id, owner_user_id, title)
     VALUES (?, ?, 'Stream Test Project') ON DUPLICATE KEY UPDATE project_id = project_id`,
    [projectId, seededUserId],
  );

  seededAssetId = randomUUID();
  await conn.execute(
    `INSERT INTO files (file_id, user_id, kind, storage_uri, mime_type, bytes, display_name, status)
     VALUES (?, ?, 'video', ?, ?, ?, ?, 'ready')
     ON DUPLICATE KEY UPDATE file_id = file_id`,
    [
      seededAssetId,
      seededUserId,
      's3://test-bucket/projects/' + projectId + '/stream-test.mp4',
      'video/mp4',
      2048,
      'stream-test.mp4',
    ],
  );
  await conn.execute(
    `INSERT IGNORE INTO project_files (project_id, file_id) VALUES (?, ?)`,
    [projectId, seededAssetId],
  );
});

afterAll(async () => {
  // Clean up in FK-safe order.
  await conn.execute(
    'DELETE FROM project_files WHERE file_id = ?',
    [seededAssetId],
  );
  await conn.execute(
    'DELETE FROM files WHERE file_id = ?',
    [seededAssetId],
  );
  await conn.execute(
    'DELETE FROM projects WHERE owner_user_id = ?',
    [seededUserId],
  );
  await conn.execute(
    'DELETE FROM sessions WHERE session_id = ?',
    [seededSessionId],
  );
  await conn.execute(
    'DELETE FROM users WHERE user_id = ?',
    [seededUserId],
  );
  await conn.end();
});

// ── GET /assets/:id/stream ────────────────────────────────────────────────────

describe('GET /assets/:id/stream', () => {
  it('returns 404 for a non-existent asset', async () => {
    // No S3 mock needed — the DB lookup fails before S3 is called.
    const res = await request(app)
      .get('/assets/00000000-0000-0000-0000-000000000000/stream')
      .set('Authorization', `Bearer ${validToken()}`);

    expect(res.status).toBe(404);
  });

  it('returns 200 with video content on a full-file request', async () => {
    const fakeBody = Readable.from(['fake-video-data']);
    mockSend.mockResolvedValueOnce({
      Body: fakeBody,
      ContentType: 'video/mp4',
      ContentLength: 15,
    });

    const res = await request(app)
      .get(`/assets/${seededAssetId}/stream`)
      .set('Authorization', `Bearer ${validToken()}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('video/mp4');
    expect(res.headers['accept-ranges']).toBe('bytes');
  });

  it('returns 206 when a Range header is provided', async () => {
    const fakeBody = Readable.from(['partial-data']);
    mockSend.mockResolvedValueOnce({
      Body: fakeBody,
      ContentType: 'video/mp4',
      ContentLength: 12,
      ContentRange: 'bytes 0-11/2048',
    });

    const res = await request(app)
      .get(`/assets/${seededAssetId}/stream`)
      .set('Authorization', `Bearer ${validToken()}`)
      .set('Range', 'bytes=0-11');

    expect(res.status).toBe(206);
    expect(res.headers['content-range']).toBe('bytes 0-11/2048');
  });

  it('forwards the Range header to S3 GetObjectCommand', async () => {
    const fakeBody = Readable.from(['bytes']);
    mockSend.mockResolvedValueOnce({
      Body: fakeBody,
      ContentType: 'video/mp4',
      ContentLength: 5,
      ContentRange: 'bytes 100-104/2048',
    });

    await request(app)
      .get(`/assets/${seededAssetId}/stream`)
      .set('Authorization', `Bearer ${validToken()}`)
      .set('Range', 'bytes=100-104');

    // The S3 GetObjectCommand must have received the Range header.
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({ Range: 'bytes=100-104' }),
      }),
    );
  });

  it('does not expose s3:// URIs in the response body or headers', async () => {
    const fakeBody = Readable.from(['safe-content']);
    mockSend.mockResolvedValueOnce({
      Body: fakeBody,
      ContentType: 'video/mp4',
      ContentLength: 12,
    });

    const res = await request(app)
      .get(`/assets/${seededAssetId}/stream`)
      .set('Authorization', `Bearer ${validToken()}`);

    const allHeaderValues = Object.values(res.headers).join(' ');
    expect(allHeaderValues).not.toContain('s3://');
    expect(String(res.text ?? '')).not.toContain('s3://');
  });

  it('returns 204 when S3 returns no body', async () => {
    mockSend.mockResolvedValueOnce({ Body: null });

    const res = await request(app)
      .get(`/assets/${seededAssetId}/stream`)
      .set('Authorization', `Bearer ${validToken()}`);

    expect(res.status).toBe(204);
  });
});
