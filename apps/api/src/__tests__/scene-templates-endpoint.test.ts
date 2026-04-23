/**
 * Integration tests for scene templates CRUD endpoints.
 *
 * Covers:
 *   GET /scene-templates
 *     - 401 when unauthenticated
 *     - 200 { items: [] } when user has no templates
 *     - 200 { items } with soft-delete filtering
 *   POST /scene-templates
 *     - 400 on missing required fields
 *     - 400 when media array exceeds 6 items
 *     - 201 with created template (no media)
 *     - 201 with created template (with media items)
 *   GET /scene-templates/:id
 *     - 404 on unknown id
 *     - 404 when template owned by another user
 *     - 200 with full template
 *   PUT /scene-templates/:id
 *     - 400 on missing required fields
 *     - 404 when template not owned by caller
 *     - 200 with updated fields + replaced media list
 *   DELETE /scene-templates/:id
 *     - 404 when template not owned by caller
 *     - 204 on success; subsequent GET returns 404
 *
 * Requires a live MySQL instance (docker compose up db).
 * Run:
 *   APP_DB_PASSWORD=cliptale vitest run \
 *     src/__tests__/scene-templates-endpoint.test.ts
 */

import { createHash, randomUUID } from 'node:crypto';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import mysql, { type Connection } from 'mysql2/promise';

// ── Mock transitive dependencies ──────────────────────────────────────────────

vi.mock('@/queues/bullmq.js', () => ({
  QUEUE_MEDIA_INGEST: 'media-ingest',
  QUEUE_RENDER: 'render',
  QUEUE_TRANSCRIPTION: 'transcription',
  connection: {},
  mediaIngestQueue: { add: vi.fn(), getJob: vi.fn(), on: vi.fn() },
  renderQueue: { add: vi.fn(), getJob: vi.fn(), on: vi.fn() },
  transcriptionQueue: { add: vi.fn(), getJob: vi.fn(), on: vi.fn() },
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/presigned-test-url'),
}));

vi.mock('@/lib/s3.js', () => ({
  s3Client: { send: vi.fn().mockResolvedValue({}) },
}));

// ── Environment ───────────────────────────────────────────────────────────────

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
  APP_JWT_SECRET:           'scene-template-int-test-secret-32ch!!',
  APP_DEV_AUTH_BYPASS:      'false',
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function sha256(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// ── Shared state ──────────────────────────────────────────────────────────────

let app: Express;
let conn: Connection;

const USER_A_ID = `sta-${randomUUID().slice(0, 8)}`;
const SESSION_A_ID = randomUUID();
const TOKEN_A = `tok-sta-${randomUUID()}`;

const USER_B_ID = `stb-${randomUUID().slice(0, 8)}`;
const SESSION_B_ID = randomUUID();
const TOKEN_B = `tok-stb-${randomUUID()}`;

/** Seeded file IDs for media item tests. */
const seededFileIds: string[] = [];

function authA(): string { return `Bearer ${TOKEN_A}`; }
function authB(): string { return `Bearer ${TOKEN_B}`; }

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeAll(async () => {
  const mod = await import('../index.js');
  app = mod.default;

  conn = await mysql.createConnection({
    host:     process.env['APP_DB_HOST']     ?? 'localhost',
    port:     Number(process.env['APP_DB_PORT'] ?? 3306),
    database: process.env['APP_DB_NAME']     ?? 'cliptale',
    user:     process.env['APP_DB_USER']     ?? 'cliptale',
    password: process.env['APP_DB_PASSWORD'] ?? 'cliptale',
  });

  const expiresAt = new Date(Date.now() + 3_600_000);

  // Insert users.
  for (const [uid, email] of [
    [USER_A_ID, `${USER_A_ID}@test.com`],
    [USER_B_ID, `${USER_B_ID}@test.com`],
  ]) {
    await conn.execute(
      `INSERT INTO users (user_id, email, display_name, email_verified)
       VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE user_id = user_id`,
      [uid, email, uid],
    );
  }

  // Insert sessions.
  await conn.execute(
    'INSERT INTO sessions (session_id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
    [SESSION_A_ID, USER_A_ID, sha256(TOKEN_A), expiresAt],
  );
  await conn.execute(
    'INSERT INTO sessions (session_id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
    [SESSION_B_ID, USER_B_ID, sha256(TOKEN_B), expiresAt],
  );

  // Seed 2 files owned by User A for media item tests.
  // Use full UUIDs — Zod validates fileId as uuid() so the IDs must be valid UUIDs.
  for (let i = 0; i < 2; i++) {
    const fileId = randomUUID();
    await conn.execute(
      `INSERT INTO files (file_id, user_id, kind, storage_uri, mime_type, bytes)
       VALUES (?, ?, 'video', ?, 'video/mp4', 1000)
       ON DUPLICATE KEY UPDATE file_id = file_id`,
      [fileId, USER_A_ID, `s3://bucket/${fileId}`],
    );
    seededFileIds.push(fileId);
  }
});

afterAll(async () => {
  // Remove scene template data first (FKs cascade, but we clean explicitly).
  await conn.execute(
    `DELETE stm FROM scene_template_media stm
     INNER JOIN scene_templates st ON stm.template_id = st.id
     WHERE st.user_id IN (?, ?)`,
    [USER_A_ID, USER_B_ID],
  );
  await conn.execute(
    'DELETE FROM scene_templates WHERE user_id IN (?, ?)',
    [USER_A_ID, USER_B_ID],
  );
  for (const fileId of seededFileIds) {
    await conn.execute('DELETE FROM files WHERE file_id = ?', [fileId]);
  }
  await conn.execute('DELETE FROM sessions WHERE session_id IN (?, ?)', [SESSION_A_ID, SESSION_B_ID]);
  await conn.execute('DELETE FROM users WHERE user_id IN (?, ?)', [USER_A_ID, USER_B_ID]);
  await conn.end();
});

// ── GET /scene-templates ──────────────────────────────────────────────────────

describe('GET /scene-templates', () => {
  it('returns 401 when Authorization header is absent', async () => {
    const res = await request(app).get('/scene-templates');
    expect(res.status).toBe(401);
  });

  it('returns 200 { items: [] } when user has no templates', async () => {
    const res = await request(app)
      .get('/scene-templates')
      .set('Authorization', authB());
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('items');
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items).toHaveLength(0);
  });

  it('returns only active templates (excludes soft-deleted)', async () => {
    // Create two templates for User A; soft-delete one.
    const createRes1 = await request(app)
      .post('/scene-templates')
      .set('Authorization', authA())
      .send({ name: 'Active Template', prompt: 'Active', durationS: 5 });
    expect(createRes1.status).toBe(201);
    const activeId: string = createRes1.body.id as string;

    const createRes2 = await request(app)
      .post('/scene-templates')
      .set('Authorization', authA())
      .send({ name: 'Deleted Template', prompt: 'Deleted', durationS: 10 });
    expect(createRes2.status).toBe(201);
    const deletedId: string = createRes2.body.id as string;

    await request(app)
      .delete(`/scene-templates/${deletedId}`)
      .set('Authorization', authA());

    const listRes = await request(app)
      .get('/scene-templates')
      .set('Authorization', authA());
    expect(listRes.status).toBe(200);
    const ids = (listRes.body.items as Array<{ id: string }>).map((t) => t.id);
    expect(ids).toContain(activeId);
    expect(ids).not.toContain(deletedId);
  });
});

// ── POST /scene-templates ─────────────────────────────────────────────────────

describe('POST /scene-templates', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(app)
      .post('/scene-templates')
      .send({ name: 'T', prompt: 'P', durationS: 5 });
    expect(res.status).toBe(401);
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/scene-templates')
      .set('Authorization', authA())
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 when media array exceeds 6 items', async () => {
    const mediaItems = Array.from({ length: 7 }, (_, i) => ({
      fileId: randomUUID(),
      mediaType: 'image',
      sortOrder: i,
    }));
    const res = await request(app)
      .post('/scene-templates')
      .set('Authorization', authA())
      .send({ name: 'T', prompt: 'P', durationS: 5, mediaItems });
    expect(res.status).toBe(400);
  });

  it('returns 201 with a template (no media)', async () => {
    const res = await request(app)
      .post('/scene-templates')
      .set('Authorization', authA())
      .send({ name: 'My Scene', prompt: 'Describe the intro', durationS: 8, style: 'cyberpunk' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: 'My Scene',
      prompt: 'Describe the intro',
      durationS: 8,
      style: 'cyberpunk',
      mediaItems: [],
    });
    expect(typeof res.body.id).toBe('string');
    expect(res.body.userId).toBe(USER_A_ID);
  });

  it('returns 201 with a template including media items', async () => {
    const mediaItems = [
      { fileId: seededFileIds[0], mediaType: 'video', sortOrder: 0 },
      { fileId: seededFileIds[1], mediaType: 'video', sortOrder: 1 },
    ];
    const res = await request(app)
      .post('/scene-templates')
      .set('Authorization', authA())
      .send({ name: 'With Media', prompt: 'A scene with media', durationS: 12, mediaItems });
    expect(res.status).toBe(201);
    expect(res.body.mediaItems).toHaveLength(2);
    expect(res.body.mediaItems[0].fileId).toBe(seededFileIds[0]);
    expect(res.body.mediaItems[0].mediaType).toBe('video');
  });
});

// ── GET /scene-templates/:id ──────────────────────────────────────────────────

describe('GET /scene-templates/:id', () => {
  let templateId: string;

  beforeAll(async () => {
    const res = await request(app)
      .post('/scene-templates')
      .set('Authorization', authA())
      .send({ name: 'Get Test', prompt: 'Get Prompt', durationS: 6 });
    templateId = res.body.id as string;
  });

  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).get(`/scene-templates/${templateId}`);
    expect(res.status).toBe(401);
  });

  it('returns 404 on unknown id', async () => {
    const res = await request(app)
      .get(`/scene-templates/${randomUUID()}`)
      .set('Authorization', authA());
    expect(res.status).toBe(404);
  });

  it('returns 404 when template is owned by another user', async () => {
    const res = await request(app)
      .get(`/scene-templates/${templateId}`)
      .set('Authorization', authB());
    expect(res.status).toBe(404);
  });

  it('returns 200 with the full template for the owner', async () => {
    const res = await request(app)
      .get(`/scene-templates/${templateId}`)
      .set('Authorization', authA());
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(templateId);
    expect(res.body.name).toBe('Get Test');
    expect(Array.isArray(res.body.mediaItems)).toBe(true);
  });
});

// ── PUT /scene-templates/:id ──────────────────────────────────────────────────

describe('PUT /scene-templates/:id', () => {
  let templateId: string;

  beforeAll(async () => {
    const res = await request(app)
      .post('/scene-templates')
      .set('Authorization', authA())
      .send({
        name: 'Before Update',
        prompt: 'Old prompt',
        durationS: 5,
        mediaItems: [{ fileId: seededFileIds[0], mediaType: 'video', sortOrder: 0 }],
      });
    templateId = res.body.id as string;
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app)
      .put(`/scene-templates/${templateId}`)
      .set('Authorization', authA())
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 404 when template is owned by another user', async () => {
    const res = await request(app)
      .put(`/scene-templates/${templateId}`)
      .set('Authorization', authB())
      .send({ name: 'X', prompt: 'X', durationS: 5 });
    expect(res.status).toBe(404);
  });

  it('returns 200 with updated fields and replaces media list', async () => {
    const res = await request(app)
      .put(`/scene-templates/${templateId}`)
      .set('Authorization', authA())
      .send({
        name: 'After Update',
        prompt: 'New prompt',
        durationS: 15,
        style: 'film-noir',
        // Replace media with a different file.
        mediaItems: [{ fileId: seededFileIds[1], mediaType: 'video', sortOrder: 0 }],
      });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: templateId,
      name: 'After Update',
      prompt: 'New prompt',
      durationS: 15,
      style: 'film-noir',
    });
    // Media list should now contain only the new file.
    expect(res.body.mediaItems).toHaveLength(1);
    expect(res.body.mediaItems[0].fileId).toBe(seededFileIds[1]);
  });

  it('returns 200 with empty media list when mediaItems is omitted', async () => {
    const res = await request(app)
      .put(`/scene-templates/${templateId}`)
      .set('Authorization', authA())
      .send({ name: 'No Media', prompt: 'P', durationS: 5 });
    expect(res.status).toBe(200);
    expect(res.body.mediaItems).toHaveLength(0);
  });
});

// ── DELETE /scene-templates/:id ───────────────────────────────────────────────

describe('DELETE /scene-templates/:id', () => {
  let templateId: string;

  beforeAll(async () => {
    const res = await request(app)
      .post('/scene-templates')
      .set('Authorization', authA())
      .send({ name: 'To Delete', prompt: 'Will be gone', durationS: 5 });
    templateId = res.body.id as string;
  });

  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).delete(`/scene-templates/${templateId}`);
    expect(res.status).toBe(401);
  });

  it('returns 404 when template is owned by another user', async () => {
    const res = await request(app)
      .delete(`/scene-templates/${templateId}`)
      .set('Authorization', authB());
    expect(res.status).toBe(404);
  });

  it('returns 204 on successful soft-delete', async () => {
    const res = await request(app)
      .delete(`/scene-templates/${templateId}`)
      .set('Authorization', authA());
    expect(res.status).toBe(204);
  });

  it('returns 404 when attempting to GET a soft-deleted template', async () => {
    const res = await request(app)
      .get(`/scene-templates/${templateId}`)
      .set('Authorization', authA());
    expect(res.status).toBe(404);
  });

  it('returns 404 when attempting to delete an already-deleted template', async () => {
    const res = await request(app)
      .delete(`/scene-templates/${templateId}`)
      .set('Authorization', authA());
    expect(res.status).toBe(404);
  });
});
