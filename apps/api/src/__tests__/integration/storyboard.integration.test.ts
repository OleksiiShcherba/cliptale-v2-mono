/**
 * Integration tests for storyboard endpoints.
 *
 * Covers:
 *   GET /storyboards/:draftId
 *     - 401 when auth header absent
 *     - 404 on unknown draft
 *     - 403 when draft owned by another user
 *     - 200 with { blocks, edges } on success
 *   PUT /storyboards/:draftId
 *     - full round-trip: PUT then GET returns the same graph
 *     - 400 on invalid body
 *   GET /storyboards/:draftId/history
 *     - returns ≤ 50 entries sorted newest-first
 *   POST /storyboards/:draftId/history
 *     - 201 on success; inserts a snapshot row
 *
 * Requires a live MySQL instance (docker compose up db).
 * BullMQ and S3 are mocked to avoid network dependencies.
 *
 * Run:
 *   APP_DB_PASSWORD=cliptale vitest run \
 *     src/__tests__/integration/storyboard.integration.test.ts
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
  APP_JWT_SECRET:           'storyboard-int-test-secret-32ch-abcde!',
  APP_DEV_AUTH_BYPASS:      'false',
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function sha256(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// ── Shared state ──────────────────────────────────────────────────────────────

let app: Express;
let conn: Connection;

const USER_A_ID = `sba-${randomUUID().slice(0, 8)}`;
const SESSION_A_ID = randomUUID();
const TOKEN_A = `tok-sba-${randomUUID()}`;

const USER_B_ID = `sbb-${randomUUID().slice(0, 8)}`;
const SESSION_B_ID = randomUUID();
const TOKEN_B = `tok-sbb-${randomUUID()}`;

let draftAId: string;
let draftBId: string;

function authA(): string {
  return `Bearer ${TOKEN_A}`;
}

function authB(): string {
  return `Bearer ${TOKEN_B}`;
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

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

  // Insert drafts owned by respective users.
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
});

afterAll(async () => {
  // Remove in FK-safe order.
  await conn.execute('DELETE FROM storyboard_history WHERE draft_id IN (?, ?)', [draftAId, draftBId]);
  await conn.execute('DELETE FROM storyboard_edges WHERE draft_id IN (?, ?)', [draftAId, draftBId]);
  await conn.execute('DELETE FROM storyboard_blocks WHERE draft_id IN (?, ?)', [draftAId, draftBId]);
  await conn.execute('DELETE FROM generation_drafts WHERE id IN (?, ?)', [draftAId, draftBId]);
  await conn.execute('DELETE FROM sessions WHERE session_id IN (?, ?)', [SESSION_A_ID, SESSION_B_ID]);
  await conn.execute('DELETE FROM users WHERE user_id IN (?, ?)', [USER_A_ID, USER_B_ID]);
  await conn.end();
});

// ── GET /storyboards/:draftId ─────────────────────────────────────────────────

describe('GET /storyboards/:draftId', () => {
  it('returns 401 when Authorization header is absent', async () => {
    const res = await request(app).get(`/storyboards/${draftAId}`);
    expect(res.status).toBe(401);
  });

  it('returns 404 on unknown draft', async () => {
    const res = await request(app)
      .get(`/storyboards/${randomUUID()}`)
      .set('Authorization', authA());
    expect(res.status).toBe(404);
  });

  it('returns 403 when draft belongs to another user', async () => {
    const res = await request(app)
      .get(`/storyboards/${draftBId}`)
      .set('Authorization', authA());
    expect(res.status).toBe(403);
  });

  it('returns 200 with { blocks, edges } for an owned draft', async () => {
    const res = await request(app)
      .get(`/storyboards/${draftAId}`)
      .set('Authorization', authA());
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('blocks');
    expect(res.body).toHaveProperty('edges');
    expect(Array.isArray(res.body.blocks)).toBe(true);
    expect(Array.isArray(res.body.edges)).toBe(true);
  });
});

// ── PUT /storyboards/:draftId round-trip ──────────────────────────────────────

describe('PUT /storyboards/:draftId', () => {
  it('returns 400 when body is missing required fields', async () => {
    const res = await request(app)
      .put(`/storyboards/${draftAId}`)
      .set('Authorization', authA())
      .send({});
    expect(res.status).toBe(400);
  });

  it('round-trips a full block graph: PUT then GET returns the same data', async () => {
    const blockId1 = randomUUID();
    const blockId2 = randomUUID();
    const edgeId = randomUUID();

    const blocks = [
      {
        id: blockId1,
        draftId: draftAId,
        blockType: 'start',
        name: null,
        prompt: null,
        durationS: 5,
        positionX: 50,
        positionY: 300,
        sortOrder: 0,
        style: null,
      },
      {
        id: blockId2,
        draftId: draftAId,
        blockType: 'end',
        name: null,
        prompt: null,
        durationS: 5,
        positionX: 900,
        positionY: 300,
        sortOrder: 9999,
        style: null,
      },
    ];

    const edges = [
      {
        id: edgeId,
        draftId: draftAId,
        sourceBlockId: blockId1,
        targetBlockId: blockId2,
      },
    ];

    const putRes = await request(app)
      .put(`/storyboards/${draftAId}`)
      .set('Authorization', authA())
      .send({ blocks, edges });
    expect(putRes.status).toBe(200);
    expect(putRes.body.blocks).toHaveLength(2);
    expect(putRes.body.edges).toHaveLength(1);

    // Verify persistence via GET.
    const getRes = await request(app)
      .get(`/storyboards/${draftAId}`)
      .set('Authorization', authA());
    expect(getRes.status).toBe(200);
    expect(getRes.body.blocks).toHaveLength(2);
    expect(getRes.body.edges).toHaveLength(1);
    expect(getRes.body.edges[0].id).toBe(edgeId);
  });

  it('replaces previous content on second PUT', async () => {
    const newBlockId = randomUUID();
    const singleBlock = [
      {
        id: newBlockId,
        draftId: draftAId,
        blockType: 'start',
        name: null,
        prompt: null,
        durationS: 5,
        positionX: 10,
        positionY: 10,
        sortOrder: 0,
        style: null,
      },
    ];

    const putRes = await request(app)
      .put(`/storyboards/${draftAId}`)
      .set('Authorization', authA())
      .send({ blocks: singleBlock, edges: [] });
    expect(putRes.status).toBe(200);
    expect(putRes.body.blocks).toHaveLength(1);
    expect(putRes.body.edges).toHaveLength(0);
  });
});

// ── Concurrent GET /storyboards/:draftId — sentinel dedup race ───────────────

describe('GET /storyboards/:draftId (concurrent sentinel initialization)', () => {
  /**
   * Two concurrent GET requests on a fresh draft must result in exactly 1 START
   * and 1 END row in the DB — the transactional FOR UPDATE lock prevents duplicate
   * inserts even when both calls race past the count = 0 check simultaneously.
   */
  it('produces exactly 1 START row and 1 END row when two GETs run concurrently', async () => {
    // Use a dedicated fresh draft so this test is independent of draftAId state.
    const freshDraftId = randomUUID();
    await conn.execute(
      'INSERT INTO generation_drafts (id, user_id, prompt_doc) VALUES (?, ?, ?)',
      [freshDraftId, USER_A_ID, JSON.stringify({ schemaVersion: 1, blocks: [] })],
    );

    try {
      // Fire two concurrent GET requests — both trigger insertSentinelsAtomically.
      const [res1, res2] = await Promise.all([
        request(app).get(`/storyboards/${freshDraftId}`).set('Authorization', authA()),
        request(app).get(`/storyboards/${freshDraftId}`).set('Authorization', authA()),
      ]);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);

      // Verify the DB contains exactly 1 START and 1 END block.
      const [startRows] = await conn.execute<import('mysql2/promise').RowDataPacket[]>(
        `SELECT COUNT(*) AS cnt FROM storyboard_blocks
         WHERE draft_id = ? AND block_type = 'start'`,
        [freshDraftId],
      );
      const [endRows] = await conn.execute<import('mysql2/promise').RowDataPacket[]>(
        `SELECT COUNT(*) AS cnt FROM storyboard_blocks
         WHERE draft_id = ? AND block_type = 'end'`,
        [freshDraftId],
      );

      expect(Number((startRows[0] as { cnt: number }).cnt)).toBe(1);
      expect(Number((endRows[0] as { cnt: number }).cnt)).toBe(1);
    } finally {
      // Clean up the fresh draft.
      await conn.execute('DELETE FROM storyboard_blocks WHERE draft_id = ?', [freshDraftId]);
      await conn.execute('DELETE FROM generation_drafts WHERE id = ?', [freshDraftId]);
    }
  });
});

// ── GET/POST /storyboards/:draftId/history ────────────────────────────────────

describe('history endpoints', () => {
  const snapshot = { blocks: [{ id: 'b1' }], edges: [] };

  it('POST /history returns 201 on success', async () => {
    const res = await request(app)
      .post(`/storyboards/${draftAId}/history`)
      .set('Authorization', authA())
      .send({ snapshot });
    expect(res.status).toBe(201);
    expect(typeof res.body.id).toBe('number');
  });

  it('GET /history returns an array sorted newest-first with ≤ 50 entries', async () => {
    // Seed more entries to verify sorting.
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post(`/storyboards/${draftAId}/history`)
        .set('Authorization', authA())
        .send({ snapshot: { tick: i } });
    }

    const res = await request(app)
      .get(`/storyboards/${draftAId}/history`)
      .set('Authorization', authA());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeLessThanOrEqual(50);

    // Verify descending id order (newest first).
    const ids = (res.body as Array<{ id: number }>).map((e) => e.id);
    for (let i = 1; i < ids.length; i++) {
      expect(ids[i - 1]).toBeGreaterThan(ids[i]!);
    }
  });

  it('POST /history returns 401 when auth header absent', async () => {
    const res = await request(app)
      .post(`/storyboards/${draftAId}/history`)
      .send({ snapshot });
    expect(res.status).toBe(401);
  });
});
