/**
 * Integration tests for GET /files/:id/stream and POST /files/stream-urls.
 *
 * Requires a live MySQL instance (docker compose up db).
 */
import { randomUUID } from 'node:crypto';
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import mysql, { type Connection } from 'mysql2/promise';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import {
  seedFixtures,
  teardownFixtures,
  type SeedResult,
} from './file-links-endpoints.fixtures.js';

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(async (_s3: unknown, command: { input?: { Key?: string } }) => (
    `https://s3.example.com/${command.input?.Key ?? 'signed'}`
  )),
}));

vi.mock('@/lib/s3.js', () => ({
  s3Client: { send: vi.fn().mockResolvedValue({}) },
}));

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
  APP_JWT_SECRET:           'file-stream-urls-test-secret-32ch!',
  APP_DEV_AUTH_BYPASS:      'false',
});

let app: Express;
let conn: Connection;
let seed: SeedResult;

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

  seed = await seedFixtures(conn);
});

beforeEach(() => {
  vi.mocked(getSignedUrl).mockClear();
});

afterAll(async () => {
  await teardownFixtures(conn, seed);
  await conn.end();
});

describe('GET /files/:id/stream', () => {
  it('keeps the single-file stream response compatible', async () => {
    const res = await request(app)
      .get(`/files/${seed.fileA}/stream`)
      .set('Authorization', `Bearer ${seed.tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ url: 'https://s3.example.com/file-a.mp4' });
  });
});

describe('POST /files/stream-urls', () => {
  it('returns URLs for multiple owned files', async () => {
    const res = await request(app)
      .post('/files/stream-urls')
      .set('Authorization', `Bearer ${seed.tokenA}`)
      .send({ fileIds: [seed.fileA, seed.fileA2] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      urls: {
        [seed.fileA]: 'https://s3.example.com/file-a.mp4',
        [seed.fileA2]: 'https://s3.example.com/file-a-2.png',
      },
      missingFileIds: [],
    });
  });

  it('deduplicates IDs before presigning', async () => {
    const res = await request(app)
      .post('/files/stream-urls')
      .set('Authorization', `Bearer ${seed.tokenA}`)
      .send({ fileIds: [seed.fileA, seed.fileA, seed.fileA] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      urls: {
        [seed.fileA]: 'https://s3.example.com/file-a.mp4',
      },
      missingFileIds: [],
    });
    expect(getSignedUrl).toHaveBeenCalledTimes(1);
  });

  it('returns missing, foreign, and deleted IDs as missing without details', async () => {
    const missingFileId = randomUUID();
    const res = await request(app)
      .post('/files/stream-urls')
      .set('Authorization', `Bearer ${seed.tokenA}`)
      .send({ fileIds: [seed.fileA, seed.fileB, seed.deletedFileA, missingFileId] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      urls: {
        [seed.fileA]: 'https://s3.example.com/file-a.mp4',
      },
      missingFileIds: [seed.fileB, seed.deletedFileA, missingFileId],
    });
  });

  it('returns 400 for invalid and empty bodies', async () => {
    const invalid = await request(app)
      .post('/files/stream-urls')
      .set('Authorization', `Bearer ${seed.tokenA}`)
      .send({ fileIds: ['not-a-uuid'] });
    expect(invalid.status).toBe(400);

    const empty = await request(app)
      .post('/files/stream-urls')
      .set('Authorization', `Bearer ${seed.tokenA}`)
      .send({ fileIds: [] });
    expect(empty.status).toBe(400);
  });

  it('returns 400 when more than 100 unique IDs are requested', async () => {
    const res = await request(app)
      .post('/files/stream-urls')
      .set('Authorization', `Bearer ${seed.tokenA}`)
      .send({ fileIds: Array.from({ length: 101 }, () => randomUUID()) });

    expect(res.status).toBe(400);
  });
});
