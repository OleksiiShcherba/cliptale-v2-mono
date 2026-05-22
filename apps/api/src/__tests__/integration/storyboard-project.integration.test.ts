import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import mysql, { type Connection } from 'mysql2/promise';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_042_PATH = resolve(
  __dirname,
  '../../db/migrations/042_generation_draft_created_project.sql',
);

Object.assign(process.env, {
  APP_DB_HOST: process.env['APP_DB_HOST'] ?? 'localhost',
  APP_DB_PORT: process.env['APP_DB_PORT'] ?? '3306',
  APP_DB_NAME: process.env['APP_DB_NAME'] ?? 'cliptale',
  APP_DB_USER: process.env['APP_DB_USER'] ?? 'cliptale',
  APP_DB_PASSWORD: process.env['APP_DB_PASSWORD'] ?? 'cliptale',
  APP_REDIS_URL: process.env['APP_REDIS_URL'] ?? 'redis://localhost:6379',
  APP_S3_BUCKET: process.env['APP_S3_BUCKET'] ?? 'test-bucket',
  APP_S3_REGION: process.env['APP_S3_REGION'] ?? 'us-east-1',
  APP_S3_ACCESS_KEY_ID: process.env['APP_S3_ACCESS_KEY_ID'] ?? 'test-access-key-id',
  APP_S3_SECRET_ACCESS_KEY: process.env['APP_S3_SECRET_ACCESS_KEY'] ?? 'test-secret-key-value',
  APP_JWT_SECRET: 'storyboard-project-int-test-secret!',
  APP_DEV_AUTH_BYPASS: 'false',
});

function sha256(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

let app: Express;
let conn: Connection;
let userA: string;
let userB: string;
let tokenA: string;
let tokenB: string;
let sessionA: string;
let sessionB: string;
let draftReady: string;
let draftPendingReference: string;
let draftMissingOutput: string;
let draftOther: string;

function authA(): string {
  return `Bearer ${tokenA}`;
}

function authB(): string {
  return `Bearer ${tokenB}`;
}

function promptDoc() {
  return {
    schemaVersion: 1,
    blocks: [{ type: 'text', value: 'Assemble this storyboard into a project.' }],
    settings: {
      videoLengthSeconds: 30,
      aspectRatio: '16:9',
      styleKey: 'cinematic',
      modelPreference: null,
    },
  };
}

async function seedDraft(draftId: string, userId: string): Promise<void> {
  await conn.execute(
    'INSERT INTO generation_drafts (id, user_id, prompt_doc, status) VALUES (?, ?, ?, ?)',
    [draftId, userId, JSON.stringify(promptDoc()), 'step2'],
  );
}

async function seedBlock(params: {
  id: string;
  draftId: string;
  blockType: 'start' | 'end' | 'scene';
  name: string | null;
  prompt: string | null;
  durationS: number;
  sortOrder: number;
}): Promise<void> {
  await conn.execute(
    `INSERT INTO storyboard_blocks
       (id, draft_id, block_type, name, prompt, duration_s, position_x, position_y, sort_order, style)
     VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, 'cinematic')`,
    [
      params.id,
      params.draftId,
      params.blockType,
      params.name,
      params.prompt,
      params.durationS,
      params.sortOrder,
    ],
  );
}

async function seedEdge(draftId: string, sourceBlockId: string, targetBlockId: string): Promise<void> {
  await conn.execute(
    'INSERT INTO storyboard_edges (id, draft_id, source_block_id, target_block_id) VALUES (?, ?, ?, ?)',
    [randomUUID(), draftId, sourceBlockId, targetBlockId],
  );
}

async function seedReadyReference(draftId: string, userId: string, approved: boolean): Promise<void> {
  const jobId = randomUUID();
  const fileId = randomUUID();
  await conn.execute(
    `INSERT INTO files (file_id, user_id, kind, storage_uri, mime_type, display_name, status)
     VALUES (?, ?, 'image', ?, 'image/png', 'principal.png', 'ready')`,
    [fileId, userId, `s3://test-bucket/${fileId}.png`],
  );
  await conn.execute(
    `INSERT INTO ai_generation_jobs
       (job_id, user_id, model_id, capability, prompt, options, status, progress, output_file_id, draft_id)
     VALUES (?, ?, 'gpt-image-2', 'text_to_image', 'principal', JSON_OBJECT(), 'completed', 100, ?, ?)`,
    [jobId, userId, fileId, draftId],
  );
  await conn.execute(
    `INSERT INTO storyboard_illustration_references
       (id, draft_id, ai_job_id, status, output_file_id, source_reference_file_ids, active_lock,
        approval_status, approved_at)
     VALUES (?, ?, ?, 'ready', ?, JSON_ARRAY(), 1, ?, ?)`,
    [randomUUID(), draftId, jobId, fileId, approved ? 'approved' : 'pending', approved ? new Date() : null],
  );
}

async function seedSceneOutput(params: {
  draftId: string;
  userId: string;
  blockId: string;
  status?: 'queued' | 'running' | 'ready' | 'failed';
  output?: boolean;
}): Promise<string | null> {
  const jobId = randomUUID();
  const outputFileId = params.output === false ? null : randomUUID();
  if (outputFileId) {
    await conn.execute(
      `INSERT INTO files (file_id, user_id, kind, storage_uri, mime_type, display_name, status)
       VALUES (?, ?, 'image', ?, 'image/png', 'scene.png', 'ready')`,
      [outputFileId, params.userId, `s3://test-bucket/${outputFileId}.png`],
    );
  }
  await conn.execute(
    `INSERT INTO ai_generation_jobs
       (job_id, user_id, model_id, capability, prompt, options, status, progress, output_file_id, draft_id)
     VALUES (?, ?, 'gpt-image-2', 'text_to_image', 'scene', JSON_OBJECT(), ?, 100, ?, ?)`,
    [
      jobId,
      params.userId,
      params.status === 'ready' || params.status === undefined ? 'completed' : 'queued',
      outputFileId,
      params.draftId,
    ],
  );
  await conn.execute(
    `INSERT INTO storyboard_scene_illustration_jobs
       (id, draft_id, block_id, ai_job_id, status, output_file_id, active_lock)
     VALUES (?, ?, ?, ?, ?, ?, 1)`,
    [
      randomUUID(),
      params.draftId,
      params.blockId,
      jobId,
      params.status ?? 'ready',
      outputFileId,
    ],
  );
  return outputFileId;
}

async function seedStoryboard(params: {
  draftId: string;
  userId: string;
  approvedReference?: boolean;
  missingOutput?: boolean;
}): Promise<void> {
  const start = randomUUID();
  const sceneA = randomUUID();
  const sceneB = randomUUID();
  const end = randomUUID();
  await seedBlock({
    id: start,
    draftId: params.draftId,
    blockType: 'start',
    name: null,
    prompt: null,
    durationS: 1,
    sortOrder: 0,
  });
  await seedBlock({
    id: sceneA,
    draftId: params.draftId,
    blockType: 'scene',
    name: 'Scene A',
    prompt: 'Scene A prompt',
    durationS: 2,
    sortOrder: 2,
  });
  await seedBlock({
    id: sceneB,
    draftId: params.draftId,
    blockType: 'scene',
    name: 'Scene B',
    prompt: 'Scene B prompt',
    durationS: 3,
    sortOrder: 1,
  });
  await seedBlock({
    id: end,
    draftId: params.draftId,
    blockType: 'end',
    name: null,
    prompt: null,
    durationS: 1,
    sortOrder: 3,
  });
  await seedEdge(params.draftId, start, sceneA);
  await seedEdge(params.draftId, sceneA, sceneB);
  await seedEdge(params.draftId, sceneB, end);
  await seedReadyReference(params.draftId, params.userId, params.approvedReference ?? true);
  await seedSceneOutput({
    draftId: params.draftId,
    userId: params.userId,
    blockId: sceneA,
    status: params.missingOutput ? 'queued' : 'ready',
    output: !params.missingOutput,
  });
  await seedSceneOutput({
    draftId: params.draftId,
    userId: params.userId,
    blockId: sceneB,
    status: 'ready',
    output: true,
  });
}

beforeAll(async () => {
  const mod = await import('../../index.js');
  app = mod.default;

  conn = await mysql.createConnection({
    host: process.env['APP_DB_HOST'] ?? 'localhost',
    port: Number(process.env['APP_DB_PORT'] ?? 3306),
    database: process.env['APP_DB_NAME'] ?? 'cliptale',
    user: process.env['APP_DB_USER'] ?? 'cliptale',
    password: process.env['APP_DB_PASSWORD'] ?? 'cliptale',
    multipleStatements: true,
  });
  await conn.query(readFileSync(MIGRATION_042_PATH, 'utf-8'));

  userA = `sbp-a-${randomUUID().slice(0, 8)}`;
  userB = `sbp-b-${randomUUID().slice(0, 8)}`;
  tokenA = `tok-sbp-a-${randomUUID()}`;
  tokenB = `tok-sbp-b-${randomUUID()}`;
  sessionA = randomUUID();
  sessionB = randomUUID();
  draftReady = randomUUID();
  draftPendingReference = randomUUID();
  draftMissingOutput = randomUUID();
  draftOther = randomUUID();

  for (const [uid, email] of [
    [userA, `${userA}@test.local`],
    [userB, `${userB}@test.local`],
  ] as const) {
    await conn.execute(
      'INSERT INTO users (user_id, email, display_name, email_verified) VALUES (?, ?, ?, 1)',
      [uid, email, uid],
    );
  }
  const expiresAt = new Date(Date.now() + 3_600_000);
  await conn.execute(
    'INSERT INTO sessions (session_id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
    [sessionA, userA, sha256(tokenA), expiresAt],
  );
  await conn.execute(
    'INSERT INTO sessions (session_id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
    [sessionB, userB, sha256(tokenB), expiresAt],
  );

  await seedDraft(draftReady, userA);
  await seedDraft(draftPendingReference, userA);
  await seedDraft(draftMissingOutput, userA);
  await seedDraft(draftOther, userB);
  await seedStoryboard({ draftId: draftReady, userId: userA });
  await seedStoryboard({ draftId: draftPendingReference, userId: userA, approvedReference: false });
  await seedStoryboard({ draftId: draftMissingOutput, userId: userA, missingOutput: true });
  await seedStoryboard({ draftId: draftOther, userId: userB });
});

afterAll(async () => {
  if (!conn) return;
  const [projectRows] = await conn.query<mysql.RowDataPacket[]>(
    'SELECT project_id FROM projects WHERE owner_user_id IN (?, ?)',
    [userA, userB],
  );
  const projectIds = projectRows.map((row) => String(row['project_id']));
  if (projectIds.length) {
    const placeholders = projectIds.map(() => '?').join(',');
    await conn.query(
      `DELETE pvp FROM project_version_patches pvp
        INNER JOIN project_versions pv ON pv.version_id = pvp.version_id
       WHERE pv.project_id IN (${placeholders})`,
      projectIds,
    );
    await conn.query(`DELETE FROM project_audit_log WHERE project_id IN (${placeholders})`, projectIds);
    await conn.query(`DELETE FROM project_versions WHERE project_id IN (${placeholders})`, projectIds);
    await conn.query(`DELETE FROM project_clips_current WHERE project_id IN (${placeholders})`, projectIds);
    await conn.query(`DELETE FROM project_files WHERE project_id IN (${placeholders})`, projectIds);
    await conn.query(`DELETE FROM projects WHERE project_id IN (${placeholders})`, projectIds);
  }
  await conn.query(
    `DELETE FROM storyboard_illustration_references
      WHERE draft_id IN (?, ?, ?, ?)`,
    [draftReady, draftPendingReference, draftMissingOutput, draftOther],
  );
  await conn.query(
    `DELETE FROM storyboard_scene_illustration_jobs
      WHERE draft_id IN (?, ?, ?, ?)`,
    [draftReady, draftPendingReference, draftMissingOutput, draftOther],
  );
  await conn.query(
    `DELETE FROM ai_generation_jobs
      WHERE draft_id IN (?, ?, ?, ?)`,
    [draftReady, draftPendingReference, draftMissingOutput, draftOther],
  );
  await conn.query(
    `DELETE FROM storyboard_edges
      WHERE draft_id IN (?, ?, ?, ?)`,
    [draftReady, draftPendingReference, draftMissingOutput, draftOther],
  );
  await conn.query(
    `DELETE FROM storyboard_blocks
      WHERE draft_id IN (?, ?, ?, ?)`,
    [draftReady, draftPendingReference, draftMissingOutput, draftOther],
  );
  await conn.query(
    `DELETE FROM generation_drafts
      WHERE id IN (?, ?, ?, ?)`,
    [draftReady, draftPendingReference, draftMissingOutput, draftOther],
  );
  await conn.query('DELETE FROM files WHERE user_id IN (?, ?)', [userA, userB]);
  await conn.query('DELETE FROM sessions WHERE session_id IN (?, ?)', [sessionA, sessionB]);
  await conn.query('DELETE FROM users WHERE user_id IN (?, ?)', [userA, userB]);
  await conn.end();
});

describe('POST /storyboards/:draftId/project', () => {
  it('creates one project, version, file links, and current clip rows, then returns the same result on retry', async () => {
    const first = await request(app)
      .post(`/storyboards/${draftReady}/project`)
      .set('Authorization', authA())
      .send({});

    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect(first.body).toEqual({
      projectId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
      versionId: expect.any(Number),
    });

    const [draftRows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT status, created_project_id, created_project_version_id FROM generation_drafts WHERE id = ?',
      [draftReady],
    );
    expect(draftRows[0]!['status']).toBe('completed');
    expect(draftRows[0]!['created_project_id']).toBe(first.body.projectId);
    expect(Number(draftRows[0]!['created_project_version_id'])).toBe(first.body.versionId);

    const [projectRows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT owner_user_id, title, latest_version_id FROM projects WHERE project_id = ?',
      [first.body.projectId],
    );
    expect(projectRows).toHaveLength(1);
    expect(projectRows[0]!['owner_user_id']).toBe(userA);
    expect(projectRows[0]!['title']).toBe('Assemble this storyboard into a project.');
    expect(Number(projectRows[0]!['latest_version_id'])).toBe(first.body.versionId);

    const [fileRows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT COUNT(*) AS cnt FROM project_files WHERE project_id = ?',
      [first.body.projectId],
    );
    expect(Number(fileRows[0]!['cnt'])).toBe(2);

    const [clipRows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT clip_id, type, file_id, start_frame, duration_frames
         FROM project_clips_current
        WHERE project_id = ?
        ORDER BY start_frame ASC`,
      [first.body.projectId],
    );
    expect(clipRows).toHaveLength(2);
    expect(clipRows.map((row) => row['type'])).toEqual(['image', 'image']);
    expect(clipRows.map((row) => Number(row['start_frame']))).toEqual([0, 60]);
    expect(clipRows.map((row) => Number(row['duration_frames']))).toEqual([60, 90]);

    const latest = await request(app)
      .get(`/projects/${first.body.projectId}/versions/latest`)
      .set('Authorization', authA());
    expect(latest.status, JSON.stringify(latest.body)).toBe(200);
    expect(latest.body.docJson).toMatchObject({
      id: first.body.projectId,
      durationFrames: 150,
      clips: [
        expect.objectContaining({ type: 'image', startFrame: 0, durationFrames: 60 }),
        expect.objectContaining({ type: 'image', startFrame: 60, durationFrames: 90 }),
      ],
    });

    const patch = await request(app)
      .patch(`/projects/${first.body.projectId}/clips/${clipRows[0]!['clip_id']}`)
      .set('Authorization', authA())
      .send({ startFrame: 12 });
    expect(patch.status, JSON.stringify(patch.body)).toBe(200);
    expect(patch.body).toMatchObject({
      clipId: clipRows[0]!['clip_id'],
      startFrame: 12,
      durationFrames: 60,
    });

    const list = await request(app)
      .get('/projects')
      .set('Authorization', authA());
    expect(list.status, JSON.stringify(list.body)).toBe(200);
    const listItems = list.body.items as Array<{ projectId: string; thumbnailUrl: string | null }>;
    expect(listItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          projectId: first.body.projectId,
          thumbnailUrl: null,
        }),
      ]),
    );

    const second = await request(app)
      .post(`/storyboards/${draftReady}/project`)
      .set('Authorization', authA())
      .send({});
    expect(second.status, JSON.stringify(second.body)).toBe(201);
    expect(second.body).toEqual(first.body);

    const [afterRetryRows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT COUNT(*) AS cnt FROM projects WHERE owner_user_id = ?',
      [userA],
    );
    expect(Number(afterRetryRows[0]!['cnt'])).toBe(1);
  });

  it('returns 422 for pending principal approval or missing scene output', async () => {
    const pending = await request(app)
      .post(`/storyboards/${draftPendingReference}/project`)
      .set('Authorization', authA())
      .send({});
    expect(pending.status).toBe(422);
    expect(pending.body.error).toContain('Principal image must be approved');

    const missingOutput = await request(app)
      .post(`/storyboards/${draftMissingOutput}/project`)
      .set('Authorization', authA())
      .send({});
    expect(missingOutput.status).toBe(422);
    expect(missingOutput.body.error).toContain('not ready');
  });

  it('preserves auth, wrong-owner, and missing draft semantics', async () => {
    await expect(request(app).post(`/storyboards/${draftReady}/project`).send({})).resolves.toMatchObject({
      status: 401,
    });

    await expect(
      request(app).post(`/storyboards/${draftOther}/project`).set('Authorization', authA()).send({}),
    ).resolves.toMatchObject({ status: 403 });

    await expect(
      request(app).post(`/storyboards/${randomUUID()}/project`).set('Authorization', authA()).send({}),
    ).resolves.toMatchObject({ status: 404 });
  });
});
