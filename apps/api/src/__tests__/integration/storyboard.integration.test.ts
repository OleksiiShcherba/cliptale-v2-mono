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
 *   POST /storyboards/:draftId/apply-latest-plan
 *     - applies latest completed plan for an owner
 *     - rejects cross-owner and missing completed plan requests
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
  storyboardPlanQueue: { add: vi.fn(), getJob: vi.fn(), on: vi.fn() },
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
let planMediaImageId: string;
let planMediaVideoId: string;

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

  planMediaImageId = randomUUID();
  planMediaVideoId = randomUUID();
  await conn.execute(
    `INSERT INTO files
       (file_id, user_id, kind, storage_uri, mime_type, display_name, status)
     VALUES
       (?, ?, 'image', ?, 'image/png', 'storyboard-plan-image.png', 'ready'),
       (?, ?, 'video', ?, 'video/mp4', 'storyboard-plan-video.mp4', 'ready')`,
    [
      planMediaImageId,
      USER_A_ID,
      `s3://test-bucket/${planMediaImageId}.png`,
      planMediaVideoId,
      USER_A_ID,
      `s3://test-bucket/${planMediaVideoId}.mp4`,
    ],
  );
});

afterAll(async () => {
  if (!conn) return;

  // Remove in FK-safe order.
  await conn.execute('DELETE FROM storyboard_history WHERE draft_id IN (?, ?)', [draftAId, draftBId]);
  await conn.execute('DELETE FROM storyboard_edges WHERE draft_id IN (?, ?)', [draftAId, draftBId]);
  await conn.execute('DELETE FROM storyboard_blocks WHERE draft_id IN (?, ?)', [draftAId, draftBId]);
  await conn.execute('DELETE FROM storyboard_plan_jobs WHERE draft_id IN (?, ?)', [draftAId, draftBId]);
  await conn.execute('DELETE FROM files WHERE file_id IN (?, ?)', [planMediaImageId, planMediaVideoId]);
  await conn.execute('DELETE FROM generation_drafts WHERE id IN (?, ?)', [draftAId, draftBId]);
  await conn.execute('DELETE FROM sessions WHERE session_id IN (?, ?)', [SESSION_A_ID, SESSION_B_ID]);
  await conn.execute('DELETE FROM users WHERE user_id IN (?, ?)', [USER_A_ID, USER_B_ID]);
  await conn.end();
});

function makeCompletedStoryboardPlan() {
  return {
    schemaVersion: 1,
    videoLengthSeconds: 12,
    sceneCount: 2,
    scenes: [
      {
        sceneNumber: 1,
        prompt: 'Introduce the workflow problem.',
        visualPrompt: 'Wide shot of a cluttered creator desk.',
        durationSeconds: 6,
        referencedMedia: [
          {
            fileId: planMediaImageId,
            mediaType: 'image',
            label: 'storyboard-plan-image.png',
          },
          {
            fileId: planMediaVideoId,
            mediaType: 'video',
            label: 'storyboard-plan-video.mp4',
          },
        ],
        transitionNotes: '',
        style: 'cinematic',
      },
      {
        sceneNumber: 2,
        prompt: 'Show the finished video.',
        visualPrompt: 'Clean product hero frame with exported video preview.',
        durationSeconds: 6,
        referencedMedia: [],
        transitionNotes: '',
        style: 'minimal',
      },
    ],
  };
}

async function seedStoryboardPlanJob(params: {
  draftId: string;
  userId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  plan?: unknown | null;
}): Promise<string> {
  const jobId = randomUUID();
  await conn.execute(
    `INSERT INTO storyboard_plan_jobs
       (job_id, draft_id, user_id, status, model, prompt_snapshot_json, media_context_json,
        plan_json, error_message, completed_at, failed_at)
     VALUES (?, ?, ?, ?, 'gpt-storyboard-test', ?, NULL, ?, ?, ?, ?)`,
    [
      jobId,
      params.draftId,
      params.userId,
      params.status,
      JSON.stringify({ schemaVersion: 1, blocks: [{ type: 'text', value: 'Test prompt' }] }),
      params.plan === undefined || params.plan === null ? null : JSON.stringify(params.plan),
      params.status === 'failed' ? 'Plan failed' : null,
      params.status === 'completed' ? new Date() : null,
      params.status === 'failed' ? new Date() : null,
    ],
  );
  return jobId;
}

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

  it('preserves in-flight scene illustration mappings for retained blocks during PUT', async () => {
    const freshDraftId = randomUUID();
    const sceneBlockId = randomUUID();
    const aiJobId = randomUUID();
    const mappingId = randomUUID();

    await conn.execute(
      'INSERT INTO generation_drafts (id, user_id, prompt_doc) VALUES (?, ?, ?)',
      [freshDraftId, USER_A_ID, JSON.stringify({ schemaVersion: 1, blocks: [] })],
    );
    await conn.execute(
      `INSERT INTO storyboard_blocks
         (id, draft_id, block_type, name, prompt, duration_s, position_x, position_y, sort_order, style)
       VALUES (?, ?, 'scene', 'Scene 01', 'Draw a car.', 6, 100, 200, 1, NULL)`,
      [sceneBlockId, freshDraftId],
    );
    await conn.execute(
      `INSERT INTO ai_generation_jobs
         (job_id, user_id, model_id, capability, prompt, options, draft_id)
       VALUES (?, ?, 'openai/gpt-image-2', 'text_to_image', 'Draw a car.', '{}', ?)`,
      [aiJobId, USER_A_ID, freshDraftId],
    );
    await conn.execute(
      `INSERT INTO storyboard_scene_illustration_jobs
         (id, draft_id, block_id, ai_job_id, status, active_lock)
       VALUES (?, ?, ?, ?, 'queued', 1)`,
      [mappingId, freshDraftId, sceneBlockId, aiJobId],
    );

    try {
      const putRes = await request(app)
        .put(`/storyboards/${freshDraftId}`)
        .set('Authorization', authA())
        .send({
          blocks: [{
            id: sceneBlockId,
            draftId: freshDraftId,
            blockType: 'scene',
            name: 'Scene 01',
            prompt: 'Draw a car.',
            durationS: 6,
            positionX: 120,
            positionY: 220,
            sortOrder: 1,
            style: null,
            mediaItems: [],
          }],
          edges: [],
        });

      expect(putRes.status).toBe(200);

      const [rows] = await conn.execute<import('mysql2/promise').RowDataPacket[]>(
        `SELECT id, block_id, ai_job_id, status
           FROM storyboard_scene_illustration_jobs
          WHERE ai_job_id = ?`,
        [aiJobId],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: mappingId,
        block_id: sceneBlockId,
        ai_job_id: aiJobId,
        status: 'queued',
      });
    } finally {
      await conn.execute('DELETE FROM storyboard_scene_illustration_jobs WHERE ai_job_id = ?', [aiJobId]);
      await conn.execute('DELETE FROM storyboard_blocks WHERE draft_id = ?', [freshDraftId]);
      await conn.execute('DELETE FROM ai_generation_jobs WHERE job_id = ?', [aiJobId]);
      await conn.execute('DELETE FROM generation_drafts WHERE id = ?', [freshDraftId]);
    }
  });

  it('preserves canonical references and retained scene mappings during PUT', async () => {
    const freshDraftId = randomUUID();
    const retainedSceneId = randomUUID();
    const deletedSceneId = randomUUID();
    const referenceJobId = randomUUID();
    const referenceId = randomUUID();
    const activeSceneJobId = randomUUID();
    const activeSceneMappingId = randomUUID();
    const readySceneJobId = randomUUID();
    const readySceneMappingId = randomUUID();
    const referenceFileId = randomUUID();
    const readySceneFileId = randomUUID();

    await conn.execute(
      'INSERT INTO generation_drafts (id, user_id, prompt_doc) VALUES (?, ?, ?)',
      [freshDraftId, USER_A_ID, JSON.stringify({ schemaVersion: 1, blocks: [] })],
    );
    await conn.execute(
      `INSERT INTO files
         (file_id, user_id, kind, storage_uri, mime_type, display_name, status)
       VALUES (?, ?, 'image', ?, 'image/png', 'reference.png', 'ready'),
              (?, ?, 'image', ?, 'image/png', 'scene-ready.png', 'ready')`,
      [
        referenceFileId,
        USER_A_ID,
        `s3://test-bucket/${referenceFileId}.png`,
        readySceneFileId,
        USER_A_ID,
        `s3://test-bucket/${readySceneFileId}.png`,
      ],
    );
    await conn.execute(
      `INSERT INTO storyboard_blocks
         (id, draft_id, block_type, name, prompt, duration_s, position_x, position_y, sort_order, style)
       VALUES (?, ?, 'scene', 'Retained scene', 'Draw retained.', 6, 100, 200, 1, NULL),
              (?, ?, 'scene', 'Deleted scene', 'Draw deleted.', 6, 300, 200, 2, NULL)`,
      [retainedSceneId, freshDraftId, deletedSceneId, freshDraftId],
    );
    await conn.execute(
      `INSERT INTO ai_generation_jobs
         (job_id, user_id, model_id, capability, prompt, options, status, progress, output_file_id, draft_id)
       VALUES (?, ?, 'gpt-image-2', 'text_to_image', 'reference', '{}', 'completed', 100, ?, ?),
              (?, ?, 'gpt-image-2', 'image_edit', 'retained scene active', '{}', 'queued', 0, NULL, ?),
              (?, ?, 'gpt-image-2', 'image_edit', 'deleted scene ready', '{}', 'completed', 100, ?, ?)`,
      [
        referenceJobId,
        USER_A_ID,
        referenceFileId,
        freshDraftId,
        activeSceneJobId,
        USER_A_ID,
        freshDraftId,
        readySceneJobId,
        USER_A_ID,
        readySceneFileId,
        freshDraftId,
      ],
    );
    await conn.execute(
      `INSERT INTO storyboard_illustration_references
         (id, draft_id, ai_job_id, status, output_file_id, source_reference_file_ids, active_lock)
       VALUES (?, ?, ?, 'ready', ?, JSON_ARRAY(), 1)`,
      [referenceId, freshDraftId, referenceJobId, referenceFileId],
    );
    await conn.execute(
      `INSERT INTO storyboard_scene_illustration_jobs
         (id, draft_id, block_id, ai_job_id, status, output_file_id, active_lock)
       VALUES (?, ?, ?, ?, 'queued', NULL, 1),
              (?, ?, ?, ?, 'ready', ?, 1)`,
      [
        activeSceneMappingId,
        freshDraftId,
        retainedSceneId,
        activeSceneJobId,
        readySceneMappingId,
        freshDraftId,
        deletedSceneId,
        readySceneJobId,
        readySceneFileId,
      ],
    );

    try {
      const putRes = await request(app)
        .put(`/storyboards/${freshDraftId}`)
        .set('Authorization', authA())
        .send({
          blocks: [{
            id: retainedSceneId,
            draftId: freshDraftId,
            blockType: 'scene',
            name: 'Retained scene',
            prompt: 'Draw retained.',
            durationS: 6,
            positionX: 120,
            positionY: 220,
            sortOrder: 1,
            style: null,
            mediaItems: [],
          }],
          edges: [],
        });

      expect(putRes.status, JSON.stringify(putRes.body)).toBe(200);

      const [referenceRows] = await conn.execute<import('mysql2/promise').RowDataPacket[]>(
        `SELECT id, ai_job_id, status, output_file_id
           FROM storyboard_illustration_references
          WHERE draft_id = ?`,
        [freshDraftId],
      );
      expect(referenceRows).toEqual([
        expect.objectContaining({
          id: referenceId,
          ai_job_id: referenceJobId,
          status: 'ready',
          output_file_id: referenceFileId,
        }),
      ]);

      const [sceneRows] = await conn.execute<import('mysql2/promise').RowDataPacket[]>(
        `SELECT id, block_id, ai_job_id, status, output_file_id
           FROM storyboard_scene_illustration_jobs
          WHERE draft_id = ?
          ORDER BY id ASC`,
        [freshDraftId],
      );
      expect(sceneRows).toEqual([
        expect.objectContaining({
          id: activeSceneMappingId,
          block_id: retainedSceneId,
          ai_job_id: activeSceneJobId,
          status: 'queued',
          output_file_id: null,
        }),
      ]);
    } finally {
      await conn.execute('DELETE FROM storyboard_illustration_references WHERE draft_id = ?', [freshDraftId]);
      await conn.execute('DELETE FROM storyboard_scene_illustration_jobs WHERE draft_id = ?', [freshDraftId]);
      await conn.execute('DELETE FROM storyboard_blocks WHERE draft_id = ?', [freshDraftId]);
      await conn.execute('DELETE FROM ai_generation_jobs WHERE job_id IN (?, ?, ?)', [
        referenceJobId,
        activeSceneJobId,
        readySceneJobId,
      ]);
      await conn.execute('DELETE FROM files WHERE file_id IN (?, ?)', [referenceFileId, readySceneFileId]);
      await conn.execute('DELETE FROM generation_drafts WHERE id = ?', [freshDraftId]);
    }
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

// ── POST /storyboards/:draftId/apply-latest-plan ─────────────────────────────

describe('POST /storyboards/:draftId/apply-latest-plan', () => {
  it('applies a completed plan and persists blocks, edges, media, and history', async () => {
    await conn.execute('DELETE FROM storyboard_history WHERE draft_id = ?', [draftAId]);
    await conn.execute('DELETE FROM storyboard_edges WHERE draft_id = ?', [draftAId]);
    await conn.execute('DELETE FROM storyboard_blocks WHERE draft_id = ?', [draftAId]);
    await seedStoryboardPlanJob({
      draftId: draftAId,
      userId: USER_A_ID,
      status: 'completed',
      plan: makeCompletedStoryboardPlan(),
    });

    const res = await request(app)
      .post(`/storyboards/${draftAId}/apply-latest-plan`)
      .set('Authorization', authA());

    expect(res.status).toBe(200);
    expect(res.body.blocks).toHaveLength(4);
    expect(res.body.edges).toHaveLength(3);
    expect(res.body.blocks.map((block: { blockType: string }) => block.blockType)).toEqual([
      'start',
      'scene',
      'scene',
      'end',
    ]);

    const firstScene = res.body.blocks[1] as {
      name: string;
      prompt: string;
      sortOrder: number;
      mediaItems: Array<{ fileId: string; mediaType: string; sortOrder: number }>;
    };
    expect(firstScene).toMatchObject({
      name: 'Scene 01',
      prompt: 'Wide shot of a cluttered creator desk.',
      sortOrder: 1,
    });
    expect(firstScene.mediaItems).toEqual([
      { id: expect.any(String), fileId: planMediaImageId, mediaType: 'image', sortOrder: 0 },
      { id: expect.any(String), fileId: planMediaVideoId, mediaType: 'video', sortOrder: 1 },
    ]);

    const [blockRows] = await conn.execute<import('mysql2/promise').RowDataPacket[]>(
      `SELECT block_type, name, prompt, sort_order
       FROM storyboard_blocks
       WHERE draft_id = ?
       ORDER BY sort_order ASC`,
      [draftAId],
    );
    expect(blockRows).toHaveLength(4);
    expect(blockRows.map((row) => row['block_type'])).toEqual(['start', 'scene', 'scene', 'end']);

    const [edgeRows] = await conn.execute<import('mysql2/promise').RowDataPacket[]>(
      'SELECT COUNT(*) AS cnt FROM storyboard_edges WHERE draft_id = ?',
      [draftAId],
    );
    expect(Number((edgeRows[0] as { cnt: number }).cnt)).toBe(3);

    const [mediaRows] = await conn.execute<import('mysql2/promise').RowDataPacket[]>(
      `SELECT sbm.file_id, sbm.media_type, sbm.sort_order
       FROM storyboard_block_media sbm
       INNER JOIN storyboard_blocks sb ON sb.id = sbm.block_id
       WHERE sb.draft_id = ?
       ORDER BY sbm.sort_order ASC`,
      [draftAId],
    );
    expect(mediaRows.map((row) => row['file_id'])).toEqual([planMediaImageId, planMediaVideoId]);

    const [historyRows] = await conn.execute<import('mysql2/promise').RowDataPacket[]>(
      'SELECT COUNT(*) AS cnt FROM storyboard_history WHERE draft_id = ?',
      [draftAId],
    );
    expect(Number((historyRows[0] as { cnt: number }).cnt)).toBe(1);
  });

  it('returns 403 when applying another user-owned draft', async () => {
    await seedStoryboardPlanJob({
      draftId: draftBId,
      userId: USER_B_ID,
      status: 'completed',
      plan: makeCompletedStoryboardPlan(),
    });

    const res = await request(app)
      .post(`/storyboards/${draftBId}/apply-latest-plan`)
      .set('Authorization', authA());

    expect(res.status).toBe(403);
  });

  it('returns 422 when no completed plan exists', async () => {
    const freshDraftId = randomUUID();
    await conn.execute(
      'INSERT INTO generation_drafts (id, user_id, prompt_doc) VALUES (?, ?, ?)',
      [freshDraftId, USER_A_ID, JSON.stringify({ schemaVersion: 1, blocks: [] })],
    );
    await seedStoryboardPlanJob({
      draftId: freshDraftId,
      userId: USER_A_ID,
      status: 'queued',
      plan: null,
    });

    try {
      const res = await request(app)
        .post(`/storyboards/${freshDraftId}/apply-latest-plan`)
        .set('Authorization', authA());

      expect(res.status).toBe(422);
      expect(res.body.error).toContain('No completed storyboard plan exists');
    } finally {
      await conn.execute('DELETE FROM storyboard_plan_jobs WHERE draft_id = ?', [freshDraftId]);
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
