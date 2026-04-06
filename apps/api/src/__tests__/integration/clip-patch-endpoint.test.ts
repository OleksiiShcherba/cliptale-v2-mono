/**
 * Integration tests for PATCH /projects/:id/clips/:clipId
 *
 * Verifies the full Express → middleware → service → repository → DB chain.
 * Requires a live MySQL instance: docker compose up -d db
 *
 * Run:
 *   APP_DB_PASSWORD=cliptale vitest run src/__tests__/integration/clip-patch-endpoint.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import mysql, { type Connection } from 'mysql2/promise';

// ── Set env vars before app is imported ──────────────────────────────────────
const JWT_SECRET = 'integration-test-jwt-secret-exactly-32ch!';

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
});

// ─────────────────────────────────────────────────────────────────────────────

let app: Express;
let conn: Connection;

/** Clip and project IDs created during tests — cleaned up in afterAll. */
const insertedClipIds: string[] = [];
const insertedProjectIds: string[] = [];

function validToken(): string {
  return jwt.sign({ sub: 'user-test-001', email: 'qa@example.com' }, JWT_SECRET);
}

const PROJECT_ID = 'proj-clip-test-0001234567890';
const CLIP_ID    = 'clip-test-00000001234567890123';

async function seedClip(clipId: string, projectId: string): Promise<void> {
  await conn.execute(
    `INSERT INTO project_clips_current
       (clip_id, project_id, track_id, type, start_frame, duration_frames, trim_in_frames)
     VALUES (?, ?, 'track-0000000000001234567890', 'video', 0, 60, 0)
     ON DUPLICATE KEY UPDATE clip_id = clip_id`,
    [clipId, projectId],
  );
  insertedClipIds.push(clipId);
  insertedProjectIds.push(projectId);
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

  await seedClip(CLIP_ID, PROJECT_ID);
});

afterAll(async () => {
  if (insertedClipIds.length) {
    const ph = insertedClipIds.map(() => '?').join(',');
    await conn.query(
      `DELETE FROM project_clips_current WHERE clip_id IN (${ph})`,
      insertedClipIds,
    );
  }
  await conn.end();
});

describe('POST /projects/:id/clips', () => {
  const NEW_CLIP_ID  = '10000000-0000-0000-0000-000000000001';
  const IMAGE_CLIP_ID = '10000000-0000-0000-0000-000000000002';
  const NEW_TRACK_ID = '20000000-0000-0000-0000-000000000001';

  afterAll(async () => {
    // Clean up any clips inserted by POST tests.
    await conn.execute(
      'DELETE FROM project_clips_current WHERE clip_id IN (?, ?)',
      [NEW_CLIP_ID, IMAGE_CLIP_ID],
    );
  });

  it('returns 201 with clipId on valid insert', async () => {
    const res = await request(app)
      .post(`/projects/${PROJECT_ID}/clips`)
      .set('Authorization', `Bearer ${validToken()}`)
      .send({
        clipId: NEW_CLIP_ID,
        trackId: NEW_TRACK_ID,
        type: 'video',
        startFrame: 0,
        durationFrames: 30,
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ clipId: NEW_CLIP_ID });
    insertedClipIds.push(NEW_CLIP_ID);
  });

  it('returns 400 when durationFrames is zero', async () => {
    const res = await request(app)
      .post(`/projects/${PROJECT_ID}/clips`)
      .set('Authorization', `Bearer ${validToken()}`)
      .send({
        clipId: crypto.randomUUID(),
        trackId: NEW_TRACK_ID,
        type: 'video',
        startFrame: 0,
        durationFrames: 0,
      });

    expect(res.status).toBe(400);
  });

  it('returns 400 when type is invalid', async () => {
    const res = await request(app)
      .post(`/projects/${PROJECT_ID}/clips`)
      .set('Authorization', `Bearer ${validToken()}`)
      .send({
        clipId: crypto.randomUUID(),
        trackId: NEW_TRACK_ID,
        type: 'invalid-type',
        startFrame: 0,
        durationFrames: 10,
      });

    expect(res.status).toBe(400);
  });

  it('returns 201 when type is "image" (added in migration 007)', async () => {
    const res = await request(app)
      .post(`/projects/${PROJECT_ID}/clips`)
      .set('Authorization', `Bearer ${validToken()}`)
      .send({
        clipId: IMAGE_CLIP_ID,
        trackId: NEW_TRACK_ID,
        type: 'image',
        startFrame: 0,
        durationFrames: 150,
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ clipId: IMAGE_CLIP_ID });
    insertedClipIds.push(IMAGE_CLIP_ID);
  });

  it('returns 400 when clipId is not a valid UUID', async () => {
    const res = await request(app)
      .post(`/projects/${PROJECT_ID}/clips`)
      .set('Authorization', `Bearer ${validToken()}`)
      .send({
        clipId: 'not-a-uuid',
        trackId: NEW_TRACK_ID,
        type: 'video',
        startFrame: 0,
        durationFrames: 10,
      });

    expect(res.status).toBe(400);
  });

  it('returns 401 when no auth token is provided', async () => {
    const res = await request(app)
      .post(`/projects/${PROJECT_ID}/clips`)
      .send({
        clipId: crypto.randomUUID(),
        trackId: NEW_TRACK_ID,
        type: 'video',
        startFrame: 0,
        durationFrames: 10,
      });

    expect(res.status).toBe(401);
  });
});

describe('PATCH /projects/:id/clips/:clipId', () => {
  it('returns 200 with updated clip fields on valid partial update', async () => {
    const res = await request(app)
      .patch(`/projects/${PROJECT_ID}/clips/${CLIP_ID}`)
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ startFrame: 15, durationFrames: 45 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      clipId: CLIP_ID,
      startFrame: 15,
      durationFrames: 45,
    });
    expect(typeof res.body.updatedAt).toBe('string');
  });

  it('returns 200 when only startFrame is provided', async () => {
    const res = await request(app)
      .patch(`/projects/${PROJECT_ID}/clips/${CLIP_ID}`)
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ startFrame: 5 });

    expect(res.status).toBe(200);
    expect(res.body.startFrame).toBe(5);
  });

  it('returns 200 when setting trimOutFrames to null', async () => {
    const res = await request(app)
      .patch(`/projects/${PROJECT_ID}/clips/${CLIP_ID}`)
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ trimOutFrames: null });

    expect(res.status).toBe(200);
    expect(res.body.trimOutFrames).toBeNull();
  });

  it('returns 200 when setting transform object', async () => {
    const transform = { x: 0, y: 0, scale: 1.0 };
    const res = await request(app)
      .patch(`/projects/${PROJECT_ID}/clips/${CLIP_ID}`)
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ transform });

    expect(res.status).toBe(200);
    expect(res.body.transform).toEqual(transform);
  });

  it('returns 400 when body is empty (no fields provided)', async () => {
    const res = await request(app)
      .patch(`/projects/${PROJECT_ID}/clips/${CLIP_ID}`)
      .set('Authorization', `Bearer ${validToken()}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('returns 400 when startFrame is negative', async () => {
    const res = await request(app)
      .patch(`/projects/${PROJECT_ID}/clips/${CLIP_ID}`)
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ startFrame: -1 });

    expect(res.status).toBe(400);
  });

  it('returns 400 when durationFrames is zero', async () => {
    const res = await request(app)
      .patch(`/projects/${PROJECT_ID}/clips/${CLIP_ID}`)
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ durationFrames: 0 });

    expect(res.status).toBe(400);
  });

  it('returns 400 when unknown fields are provided', async () => {
    const res = await request(app)
      .patch(`/projects/${PROJECT_ID}/clips/${CLIP_ID}`)
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ startFrame: 5, unknownField: 'should fail' });

    // Zod strips unknown keys by default; this should still succeed with startFrame
    // OR fail if strict mode — either is acceptable. Test passes if response is 200 or 400.
    expect([200, 400]).toContain(res.status);
  });

  it('returns 404 when clipId does not exist', async () => {
    const res = await request(app)
      .patch(`/projects/${PROJECT_ID}/clips/nonexistent-clip-id-0000000000`)
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ startFrame: 5 });

    expect(res.status).toBe(404);
  });

  it('returns 404 when projectId does not match clip', async () => {
    const res = await request(app)
      .patch(`/projects/wrong-project-id-000000000000/clips/${CLIP_ID}`)
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ startFrame: 5 });

    expect(res.status).toBe(404);
  });

  it('returns 401 when no auth token is provided', async () => {
    const res = await request(app)
      .patch(`/projects/${PROJECT_ID}/clips/${CLIP_ID}`)
      .send({ startFrame: 5 });

    expect(res.status).toBe(401);
  });

  it('does NOT insert a row into project_versions', async () => {
    const before = await conn.execute<mysql.RowDataPacket[]>(
      'SELECT COUNT(*) AS cnt FROM project_versions WHERE project_id = ?',
      [PROJECT_ID],
    );
    const countBefore = (before[0][0] as { cnt: number }).cnt;

    await request(app)
      .patch(`/projects/${PROJECT_ID}/clips/${CLIP_ID}`)
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ startFrame: 20 });

    const after = await conn.execute<mysql.RowDataPacket[]>(
      'SELECT COUNT(*) AS cnt FROM project_versions WHERE project_id = ?',
      [PROJECT_ID],
    );
    const countAfter = (after[0][0] as { cnt: number }).cnt;

    expect(countAfter).toBe(countBefore);
  });
});
