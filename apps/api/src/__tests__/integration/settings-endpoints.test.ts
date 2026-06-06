/**
 * Integration tests — GET/PUT /users/me/settings.
 *
 * storyboard-autosave-checkpoints T4 (AC-09, AC-10, AC-11, AC-11c):
 *   - 401 without/with-invalid token on both verbs (AC-11c: only the owner's
 *     authenticated account is addressable — structural owner-scoping)
 *   - GET with no row → 200 { autosaveIntervalSeconds: 60, updatedAt: null }
 *   - PUT whitelist presets 30/60/120/300/600 → 200 with persisted value
 *   - PUT anything else (45, string, missing) → 400 (Zod, ADR-0004)
 *   - GET after PUT returns the stored value (AC-09/AC-10)
 *   - response shape matches the OpenAPI UserSettings schema exactly
 *
 * Requires a live MySQL instance (docker compose up db).
 *
 * Run: cd apps/api && APP_DB_PASSWORD=cliptale npx vitest run
 *       src/__tests__/integration/settings-endpoints.test.ts
 */
import { randomUUID, createHash } from 'node:crypto';

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import mysql, { type Connection } from 'mysql2/promise';

// ── Mock S3 — not used by settings endpoints; needed to load the app ─────────
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/presigned-test-url'),
}));

vi.mock('@/lib/s3.js', () => ({
  s3Client: { send: vi.fn().mockResolvedValue({}) },
}));

// ── Env vars must be set before app import ────────────────────────────────────
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
  APP_JWT_SECRET:           'settings-endpoints-test-secret-32ch!!',
  APP_DEV_AUTH_BYPASS:      'false',
});

// ─────────────────────────────────────────────────────────────────────────────

const PRESETS = [30, 60, 120, 300, 600] as const;

let app: Express;
let conn: Connection;

const userId = `t4s-${randomUUID().slice(0, 8)}`;
const token = `tok-t4s-${randomUUID()}`;

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

  await conn.execute(
    `INSERT INTO users (user_id, email, display_name, email_verified)
     VALUES (?, ?, ?, 1)`,
    [userId, `${userId}@example.test`, 'T4 Settings'],
  );
  await conn.execute(
    'INSERT INTO sessions (session_id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
    [
      randomUUID(),
      userId,
      createHash('sha256').update(token).digest('hex'),
      new Date(Date.now() + 3_600_000),
    ],
  );
});

afterAll(async () => {
  // CASCADE removes sessions + user_settings.
  await conn.execute('DELETE FROM users WHERE user_id = ?', [userId]);
  await conn.end();
});

// ── Auth (AC-11c: structural owner-scoping) ───────────────────────────────────

describe('GET/PUT /users/me/settings — auth', () => {
  it('GET returns 401 when Authorization header is absent', async () => {
    const res = await request(app).get('/users/me/settings');
    expect(res.status).toBe(401);
  });

  it('PUT returns 401 on an invalid token', async () => {
    const res = await request(app)
      .put('/users/me/settings')
      .set('Authorization', 'Bearer bad-token')
      .send({ autosaveIntervalSeconds: 120 });
    expect(res.status).toBe(401);
  });
});

// ── GET — effective defaults (AC-11b surface) ─────────────────────────────────

describe('GET /users/me/settings — effective read', () => {
  it('returns defaults (60, updatedAt null) when no row exists; exact schema shape', async () => {
    const res = await request(app)
      .get('/users/me/settings')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    // additionalProperties: false — exactly these two keys.
    expect(res.body).toEqual({ autosaveIntervalSeconds: 60, updatedAt: null });
  });
});

// ── PUT — preset whitelist (AC-09, AC-11 / ADR-0004) ──────────────────────────

describe('PUT /users/me/settings — preset whitelist', () => {
  it.each([...PRESETS])('accepts preset %d and returns the persisted settings', async (preset) => {
    const res = await request(app)
      .put('/users/me/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ autosaveIntervalSeconds: preset });
    expect(res.status).toBe(200);
    expect(res.body.autosaveIntervalSeconds).toBe(preset);
    expect(typeof res.body.updatedAt).toBe('string');
    expect(Object.keys(res.body).sort()).toEqual(['autosaveIntervalSeconds', 'updatedAt']);
  });

  it.each([45, 0, -60, 3600])('rejects non-preset interval %d with 400', async (bad) => {
    const res = await request(app)
      .put('/users/me/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ autosaveIntervalSeconds: bad });
    expect(res.status).toBe(400);
  });

  it('rejects a stringified preset ("60") with 400', async () => {
    const res = await request(app)
      .put('/users/me/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ autosaveIntervalSeconds: '60' });
    expect(res.status).toBe(400);
  });

  it('rejects a missing autosaveIntervalSeconds with 400', async () => {
    const res = await request(app)
      .put('/users/me/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });
});

// ── Read-back (AC-09 / AC-10) ─────────────────────────────────────────────────

describe('GET /users/me/settings — read-back after PUT', () => {
  it('returns the last stored preset for the account', async () => {
    await request(app)
      .put('/users/me/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ autosaveIntervalSeconds: 300 });

    const res = await request(app)
      .get('/users/me/settings')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.autosaveIntervalSeconds).toBe(300);
    expect(typeof res.body.updatedAt).toBe('string');
  });
});
