/**
 * Integration tests for flow-file.repository.ts and the T7 extensions to
 * aiGenerationJob.repository.ts, against real MySQL 8.
 *
 * Covers (T7 / AC-08b / AC-19):
 *   (1) link a (flow_id, file_id) pair and read it back
 *   (2) link survival semantics — soft-unlink sets deleted_at but the files row survives
 *   (3) write flow_id/block_id on an ai_generation_job
 *   (4) read all result-block job states for one flow_id (reattach query)
 *
 * Prerequisites: MySQL 8 running, migrations 046–048 applied.
 * Run:
 *   cd apps/api && APP_DB_PASSWORD=cliptale npx vitest run src/__tests__/integration/flow-file-repository.integration.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql, { type Connection } from 'mysql2/promise';
import { randomUUID } from 'node:crypto';

// ── Env bootstrap (must happen before any app import) ─────────────────────────
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
  APP_JWT_SECRET:           'integration-test-jwt-secret-exactly-32ch!',
  APP_DEV_AUTH_BYPASS:      'true',
});

import {
  linkFileToFlow,
  softUnlinkFileFromFlow,
  getLinkedFileIds,
} from '../../repositories/flow-file.repository.js';

import {
  createJob,
  setFlowLink,
  getJobsByFlowId,
} from '../../repositories/aiGenerationJob.repository.js';

// ── Test fixtures ─────────────────────────────────────────────────────────────

let conn: Connection;

const PREFIX = 'ffr-integ';
const USER_A = `${PREFIX}-user-a-${randomUUID().slice(0, 8)}`;

/** Track inserted rows for cleanup */
const trackedFlowIds: string[] = [];
const trackedFileIds: string[] = [];
const trackedJobIds: string[] = [];

function newId(kind: 'flow' | 'file' | 'job'): string {
  const id = `${PREFIX}-${kind}-${randomUUID().slice(0, 12)}`;
  if (kind === 'flow') trackedFlowIds.push(id);
  else if (kind === 'file') trackedFileIds.push(id);
  else trackedJobIds.push(id);
  return id;
}

/** Minimal valid FlowCanvas JSON */
const CANVAS = JSON.stringify({ blocks: [], edges: [] });

/** Insert a generation_flows row directly so we can test the pivot without T6 */
async function seedFlow(flowId: string): Promise<void> {
  await conn.execute(
    `INSERT INTO generation_flows (flow_id, user_id, title, canvas, version)
     VALUES (?, ?, ?, ?, 1)`,
    [flowId, USER_A, 'Test flow', CANVAS],
  );
}

/** Insert a files row directly so we can test the pivot without T13 */
async function seedFile(fileId: string): Promise<void> {
  await conn.execute(
    `INSERT INTO files (file_id, user_id, kind, storage_uri, mime_type, bytes, display_name)
     VALUES (?, ?, 'image', ?, 'image/png', 100, 'test.png')`,
    [fileId, USER_A, `s3://test/${fileId}.png`],
  );
}

beforeAll(async () => {
  conn = await mysql.createConnection({
    host:     process.env['APP_DB_HOST']     ?? 'localhost',
    port:     Number(process.env['APP_DB_PORT'] ?? 3306),
    database: process.env['APP_DB_NAME']     ?? 'cliptale',
    user:     process.env['APP_DB_USER']     ?? 'cliptale',
    password: process.env['APP_DB_PASSWORD'] ?? 'cliptale',
  });

  await conn.execute(
    `INSERT IGNORE INTO users (user_id, email, display_name) VALUES (?, ?, ?)`,
    [USER_A, `${USER_A}@example.test`, 'Test Creator A'],
  );
});

afterAll(async () => {
  // FK-safe cleanup order: flow_files → ai_generation_jobs → generation_flows → files → users
  if (trackedFlowIds.length) {
    const ph = trackedFlowIds.map(() => '?').join(',');
    await conn.query(`DELETE FROM flow_files WHERE flow_id IN (${ph})`, trackedFlowIds);
    await conn.query(`DELETE FROM generation_flows WHERE flow_id IN (${ph})`, trackedFlowIds);
  }
  if (trackedJobIds.length) {
    const ph = trackedJobIds.map(() => '?').join(',');
    await conn.query(`DELETE FROM ai_generation_jobs WHERE job_id IN (${ph})`, trackedJobIds);
  }
  if (trackedFileIds.length) {
    const ph = trackedFileIds.map(() => '?').join(',');
    await conn.query(`DELETE FROM files WHERE file_id IN (${ph})`, trackedFileIds);
  }
  await conn.query(`DELETE FROM users WHERE user_id = ?`, [USER_A]);
  await conn.end();
});

// ── flow-file.repository — linkFileToFlow + getLinkedFileIds ──────────────────

describe('flow-file.repository integration — linkFileToFlow + getLinkedFileIds', () => {
  it('inserts a flow_files row and getLinkedFileIds returns that file_id', async () => {
    const flowId = newId('flow');
    const fileId = newId('file');

    await seedFlow(flowId);
    await seedFile(fileId);

    await linkFileToFlow(flowId, fileId);

    const linked = await getLinkedFileIds(flowId);
    expect(linked).toContain(fileId);
  });

  it('is idempotent — second linkFileToFlow on same (flow_id, file_id) does not throw', async () => {
    const flowId = newId('flow');
    const fileId = newId('file');

    await seedFlow(flowId);
    await seedFile(fileId);

    await linkFileToFlow(flowId, fileId);
    await expect(linkFileToFlow(flowId, fileId)).resolves.toBeUndefined();

    // Only one link row exists
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS cnt FROM flow_files WHERE flow_id = ? AND file_id = ?`,
      [flowId, fileId],
    );
    expect(rows[0]!['cnt']).toBe(1);
  });

  it('returns only active (non-soft-deleted) links from getLinkedFileIds', async () => {
    const flowId = newId('flow');
    const fileIdActive = newId('file');
    const fileIdDeleted = newId('file');

    await seedFlow(flowId);
    await seedFile(fileIdActive);
    await seedFile(fileIdDeleted);

    await linkFileToFlow(flowId, fileIdActive);
    await linkFileToFlow(flowId, fileIdDeleted);
    await softUnlinkFileFromFlow(flowId, fileIdDeleted);

    const linked = await getLinkedFileIds(flowId);
    expect(linked).toContain(fileIdActive);
    expect(linked).not.toContain(fileIdDeleted);
  });
});

// ── flow-file.repository — softUnlinkFileFromFlow (AC-19 survival) ───────────

describe('flow-file.repository integration — softUnlinkFileFromFlow (AC-19)', () => {
  it('sets deleted_at on the flow_files row but does NOT delete the files row', async () => {
    const flowId = newId('flow');
    const fileId = newId('file');

    await seedFlow(flowId);
    await seedFile(fileId);
    await linkFileToFlow(flowId, fileId);

    await softUnlinkFileFromFlow(flowId, fileId);

    // flow_files row still exists but with deleted_at set
    const [linkRows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT deleted_at FROM flow_files WHERE flow_id = ? AND file_id = ?`,
      [flowId, fileId],
    );
    expect(linkRows).toHaveLength(1);
    expect(linkRows[0]!['deleted_at']).not.toBeNull();

    // The files row is untouched (AC-19: asset outlives the flow)
    const [fileRows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT file_id FROM files WHERE file_id = ? AND deleted_at IS NULL`,
      [fileId],
    );
    expect(fileRows).toHaveLength(1);
  });

  it('is a silent no-op when the link does not exist', async () => {
    await expect(
      softUnlinkFileFromFlow('nonexistent-flow-id', 'nonexistent-file-id'),
    ).resolves.toBeUndefined();
  });
});

// ── aiGenerationJob.repository — setFlowLink ──────────────────────────────────

describe('aiGenerationJob.repository integration — setFlowLink (AC-08b)', () => {
  it('writes flow_id and block_id on an existing job row', async () => {
    const jobId = newId('job');
    const flowId = newId('flow');
    const blockId = randomUUID();

    await seedFlow(flowId);

    await createJob({
      jobId,
      userId: USER_A,
      modelId: 'fal-ai/flux/dev',
      capability: 'text_to_image',
      prompt: 'test prompt',
      options: null,
    });

    await setFlowLink(jobId, flowId, blockId);

    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT flow_id, block_id FROM ai_generation_jobs WHERE job_id = ?`,
      [jobId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!['flow_id']).toBe(flowId);
    expect(rows[0]!['block_id']).toBe(blockId);
  });
});

// ── aiGenerationJob.repository — getJobsByFlowId (reattach query) ─────────────

describe('aiGenerationJob.repository integration — getJobsByFlowId (AC-08b reattach)', () => {
  it('returns all jobs linked to a flow_id', async () => {
    const flowId = newId('flow');
    const jobId1 = newId('job');
    const jobId2 = newId('job');
    const blockId1 = randomUUID();
    const blockId2 = randomUUID();

    await seedFlow(flowId);

    await createJob({
      jobId: jobId1,
      userId: USER_A,
      modelId: 'fal-ai/flux/dev',
      capability: 'text_to_image',
      prompt: 'prompt 1',
      options: null,
    });
    await setFlowLink(jobId1, flowId, blockId1);

    await createJob({
      jobId: jobId2,
      userId: USER_A,
      modelId: 'fal-ai/flux/dev',
      capability: 'text_to_image',
      prompt: 'prompt 2',
      options: null,
    });
    await setFlowLink(jobId2, flowId, blockId2);

    const jobs = await getJobsByFlowId(flowId);

    const jobIds = jobs.map((j) => j.jobId);
    expect(jobIds).toContain(jobId1);
    expect(jobIds).toContain(jobId2);

    // Verify block_id is returned
    const job1 = jobs.find((j) => j.jobId === jobId1);
    expect(job1).toBeDefined();
    expect(job1!.blockId).toBe(blockId1);
    expect(job1!.flowId).toBe(flowId);
  });

  it('returns an empty array when no jobs are linked to a flow', async () => {
    const flowId = newId('flow');
    await seedFlow(flowId);

    const jobs = await getJobsByFlowId(flowId);
    expect(jobs).toEqual([]);
  });

  it('does not return jobs from other flows', async () => {
    const flowA = newId('flow');
    const flowB = newId('flow');
    const jobId = newId('job');
    const blockId = randomUUID();

    await seedFlow(flowA);
    await seedFlow(flowB);

    await createJob({
      jobId,
      userId: USER_A,
      modelId: 'fal-ai/flux/dev',
      capability: 'text_to_image',
      prompt: 'flow a prompt',
      options: null,
    });
    await setFlowLink(jobId, flowA, blockId);

    const jobs = await getJobsByFlowId(flowB);
    expect(jobs.map((j) => j.jobId)).not.toContain(jobId);
  });

  it('returns jobs with their current status (queued, processing, completed)', async () => {
    const flowId = newId('flow');
    const jobId = newId('job');
    const blockId = randomUUID();

    await seedFlow(flowId);

    await createJob({
      jobId,
      userId: USER_A,
      modelId: 'fal-ai/flux/dev',
      capability: 'text_to_image',
      prompt: 'status check',
      options: null,
    });
    await setFlowLink(jobId, flowId, blockId);

    const jobs = await getJobsByFlowId(flowId);
    const job = jobs.find((j) => j.jobId === jobId);
    expect(job).toBeDefined();
    expect(job!.status).toBe('queued');
  });
});
