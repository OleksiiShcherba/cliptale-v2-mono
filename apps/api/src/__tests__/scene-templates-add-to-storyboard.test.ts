/**
 * Integration tests for POST /scene-templates/:id/add-to-storyboard.
 *
 * Covers:
 *   - 401 when unauthenticated
 *   - 400 on missing/invalid body
 *   - 404 when template not found
 *   - 404 when template owned by another user (cross-ownership)
 *   - 404 when draft not found
 *   - 403 when draft belongs to another user
 *   - 201 — creates a new storyboard block with media items from the template
 *   - 201 — accepts optional positionX / positionY overrides
 *   - Multiple calls create multiple distinct blocks (no stacking on top of each other)
 *
 * Requires a live MySQL instance (docker compose up db).
 * Run:
 *   APP_DB_PASSWORD=cliptale vitest run \
 *     src/__tests__/scene-templates-add-to-storyboard.test.ts
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
  APP_JWT_SECRET:           'scene-tmpl-ats-int-test-secret-32ch!!',
  APP_DEV_AUTH_BYPASS:      'false',
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function sha256(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// ── Shared state ──────────────────────────────────────────────────────────────

let app: Express;
let conn: Connection;

const USER_A_ID = `ata-${randomUUID().slice(0, 8)}`;
const SESSION_A_ID = randomUUID();
const TOKEN_A = `tok-ata-${randomUUID()}`;

const USER_B_ID = `atb-${randomUUID().slice(0, 8)}`;
const SESSION_B_ID = randomUUID();
const TOKEN_B = `tok-atb-${randomUUID()}`;

let draftAId: string;
let draftBId: string;
let templateAId: string;
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

  // Seed users.
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

  // Seed sessions.
  await conn.execute(
    'INSERT INTO sessions (session_id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
    [SESSION_A_ID, USER_A_ID, sha256(TOKEN_A), expiresAt],
  );
  await conn.execute(
    'INSERT INTO sessions (session_id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
    [SESSION_B_ID, USER_B_ID, sha256(TOKEN_B), expiresAt],
  );

  // Seed generation drafts.
  draftAId = randomUUID();
  draftBId = randomUUID();
  await conn.execute(
    'INSERT INTO generation_drafts (id, user_id, prompt_doc) VALUES (?, ?, ?)',
    [draftAId, USER_A_ID, JSON.stringify({ schemaVersion: 1, blocks: [] })],
  );
  await conn.execute(
    'INSERT INTO generation_drafts (id, user_id, prompt_doc) VALUES (?, ?, ?)',
    [draftBId, USER_B_ID, JSON.stringify({ schemaVersion: 1, blocks: [] })],
  );

  // Seed a file for User A.
  // Use a full UUID — Zod validates fileId as uuid().
  const fileId = randomUUID();
  await conn.execute(
    `INSERT INTO files (file_id, user_id, kind, storage_uri, mime_type, bytes)
     VALUES (?, ?, 'image', ?, 'image/png', 1000)
     ON DUPLICATE KEY UPDATE file_id = file_id`,
    [fileId, USER_A_ID, `s3://bucket/${fileId}`],
  );
  seededFileIds.push(fileId);

  // Create a scene template for User A.
  const createRes = await request(app)
    .post('/scene-templates')
    .set('Authorization', authA())
    .send({
      name: 'ATS Template',
      prompt: 'Storyboard scene prompt',
      durationS: 10,
      style: 'cyberpunk',
      mediaItems: [{ fileId, mediaType: 'image', sortOrder: 0 }],
    });
  templateAId = createRes.body.id as string;
});

afterAll(async () => {
  // Clean up storyboard_block_media and storyboard_blocks for test drafts.
  await conn.execute(
    `DELETE sbm FROM storyboard_block_media sbm
     INNER JOIN storyboard_blocks sb ON sbm.block_id = sb.id
     WHERE sb.draft_id IN (?, ?)`,
    [draftAId, draftBId],
  );
  await conn.execute(
    'DELETE FROM storyboard_blocks WHERE draft_id IN (?, ?)',
    [draftAId, draftBId],
  );
  await conn.execute(
    'DELETE FROM generation_drafts WHERE id IN (?, ?)',
    [draftAId, draftBId],
  );
  // Clean up scene templates.
  await conn.execute(
    'DELETE FROM scene_template_media WHERE template_id = ?',
    [templateAId],
  );
  await conn.execute('DELETE FROM scene_templates WHERE user_id IN (?, ?)', [USER_A_ID, USER_B_ID]);
  for (const fileId of seededFileIds) {
    await conn.execute('DELETE FROM files WHERE file_id = ?', [fileId]);
  }
  await conn.execute('DELETE FROM sessions WHERE session_id IN (?, ?)', [SESSION_A_ID, SESSION_B_ID]);
  await conn.execute('DELETE FROM users WHERE user_id IN (?, ?)', [USER_A_ID, USER_B_ID]);
  await conn.end();
});

// ── POST /scene-templates/:id/add-to-storyboard ───────────────────────────────

describe('POST /scene-templates/:id/add-to-storyboard', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(app)
      .post(`/scene-templates/${templateAId}/add-to-storyboard`)
      .send({ draftId: draftAId });
    expect(res.status).toBe(401);
  });

  it('returns 400 when draftId is missing from body', async () => {
    const res = await request(app)
      .post(`/scene-templates/${templateAId}/add-to-storyboard`)
      .set('Authorization', authA())
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 when draftId is not a valid UUID', async () => {
    const res = await request(app)
      .post(`/scene-templates/${templateAId}/add-to-storyboard`)
      .set('Authorization', authA())
      .send({ draftId: 'not-a-uuid' });
    expect(res.status).toBe(400);
  });

  it('returns 404 when template does not exist', async () => {
    const res = await request(app)
      .post(`/scene-templates/${randomUUID()}/add-to-storyboard`)
      .set('Authorization', authA())
      .send({ draftId: draftAId });
    expect(res.status).toBe(404);
  });

  it('returns 404 when template is owned by another user (cross-ownership)', async () => {
    const res = await request(app)
      .post(`/scene-templates/${templateAId}/add-to-storyboard`)
      .set('Authorization', authB())
      .send({ draftId: draftBId });
    expect(res.status).toBe(404);
  });

  it('returns 404 when draft does not exist', async () => {
    const res = await request(app)
      .post(`/scene-templates/${templateAId}/add-to-storyboard`)
      .set('Authorization', authA())
      .send({ draftId: randomUUID() });
    expect(res.status).toBe(404);
  });

  it('returns 403 when draft belongs to another user', async () => {
    const res = await request(app)
      .post(`/scene-templates/${templateAId}/add-to-storyboard`)
      .set('Authorization', authA())
      .send({ draftId: draftBId });
    expect(res.status).toBe(403);
  });

  it('returns 201 with a new StoryboardBlock that mirrors the template', async () => {
    const res = await request(app)
      .post(`/scene-templates/${templateAId}/add-to-storyboard`)
      .set('Authorization', authA())
      .send({ draftId: draftAId });
    expect(res.status).toBe(201);

    const block = res.body as {
      id: string;
      draftId: string;
      blockType: string;
      name: string;
      prompt: string;
      durationS: number;
      style: string;
      mediaItems: Array<{ fileId: string; mediaType: string }>;
    };

    expect(typeof block.id).toBe('string');
    expect(block.draftId).toBe(draftAId);
    expect(block.blockType).toBe('scene');
    expect(block.name).toBe('ATS Template');
    expect(block.prompt).toBe('Storyboard scene prompt');
    expect(block.durationS).toBe(10);
    expect(block.style).toBe('cyberpunk');
    expect(block.mediaItems).toHaveLength(1);
    expect(block.mediaItems[0]?.fileId).toBe(seededFileIds[0]);
    expect(block.mediaItems[0]?.mediaType).toBe('image');
  });

  it('accepts optional positionX / positionY overrides', async () => {
    const res = await request(app)
      .post(`/scene-templates/${templateAId}/add-to-storyboard`)
      .set('Authorization', authA())
      .send({ draftId: draftAId, positionX: 200, positionY: 150 });
    expect(res.status).toBe(201);
    expect(res.body.positionX).toBe(200);
    expect(res.body.positionY).toBe(150);
  });

  it('calling twice creates two distinct blocks in the draft', async () => {
    const r1 = await request(app)
      .post(`/scene-templates/${templateAId}/add-to-storyboard`)
      .set('Authorization', authA())
      .send({ draftId: draftAId });
    const r2 = await request(app)
      .post(`/scene-templates/${templateAId}/add-to-storyboard`)
      .set('Authorization', authA())
      .send({ draftId: draftAId });

    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(r1.body.id).not.toBe(r2.body.id);
  });
});
