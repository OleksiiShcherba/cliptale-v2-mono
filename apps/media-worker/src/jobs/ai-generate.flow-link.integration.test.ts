/**
 * T13 — result-integrity integration test (real MySQL).
 *
 * Verifies the asset-iff-success invariant for a flow-linked ai-generate job:
 *   (1) SUCCESS  → exactly one `files` row + exactly one `flow_files` link.
 *   (2) FAILURE  → zero `files` rows + zero `flow_files` links + job marked failed.
 *   (3) MULTI    → a provider response with several outputs still yields exactly
 *                  one result + one link (first output kept, extras discarded).
 *
 * Runs the REAL handler with the REAL DB-backed `filesRepo` / `aiGenerationJobRepo`
 * (apps/media-worker/src/jobs/workerRepositories.ts → real `pool`). Only the
 * external edges (S3, fal client, ingest queue, realtime publish) are mocked.
 *
 * Run from apps/media-worker:
 *   APP_DB_PASSWORD=cliptale npx vitest run src/jobs/ai-generate.flow-link.integration.test.ts
 */
import { randomUUID } from 'node:crypto';

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import type { Job, Queue } from 'bullmq';
import type { S3Client } from '@aws-sdk/client-s3';
import type { MediaIngestJobPayload } from '@ai-video-editor/project-schema';

vi.mock('@/lib/realtime.js', () => ({
  publishAiGenerationJobStatus: vi.fn().mockResolvedValue(undefined),
}));

import { pool } from '@/lib/db.js';
import { filesRepo, aiGenerationJobRepo } from '@/jobs/workerRepositories.js';
import {
  processAiGenerateJob,
  type AiGenerateJobDeps,
  type AiGenerateJobPayload,
} from '@/jobs/ai-generate.job.js';

const BUCKET = 'test-bucket';

/** A fal image payload carrying MORE THAN ONE image — extras must be discarded. */
const MULTI_IMAGE_OUTPUT = {
  images: [
    { url: 'https://fal.media/first.png', width: 1024, height: 1024 },
    { url: 'https://fal.media/second.png', width: 512, height: 512 },
    { url: 'https://fal.media/third.png', width: 256, height: 256 },
  ],
};

const SINGLE_IMAGE_OUTPUT = {
  images: [{ url: 'https://fal.media/only.png', width: 1024, height: 1024 }],
};

type Ctx = {
  userId: string;
  flowId: string;
  blockId: string;
  jobIds: string[];
  flowIds: string[];
  userIds: string[];
};

const ctx: Ctx = { userId: '', flowId: '', blockId: '', jobIds: [], flowIds: [], userIds: [] };

let originalFetch: typeof globalThis.fetch;

beforeAll(async () => {
  ctx.userId = randomUUID();
  ctx.flowId = randomUUID();
  ctx.blockId = randomUUID();
  ctx.userIds.push(ctx.userId);
  ctx.flowIds.push(ctx.flowId);

  await pool.execute(
    `INSERT INTO users (user_id, email, display_name, email_verified)
     VALUES (?, ?, ?, 1)`,
    [ctx.userId, `t13-${ctx.userId}@example.test`, 'T13 Tester'],
  );
  await pool.execute(
    `INSERT INTO generation_flows (flow_id, user_id, title, canvas, version)
     VALUES (?, ?, ?, CAST('{}' AS JSON), 1)`,
    [ctx.flowId, ctx.userId, 'T13 flow'],
  );
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.clearAllMocks();
});

afterAll(async () => {
  // Clean up everything this suite created. flow_files first (RESTRICT on file),
  // then files, then jobs, flows, users.
  for (const flowId of ctx.flowIds) {
    await pool.execute(`DELETE FROM flow_files WHERE flow_id = ?`, [flowId]);
  }
  for (const jobId of ctx.jobIds) {
    const [rows] = await pool.execute<Array<{ output_file_id: string | null }>>(
      `SELECT output_file_id FROM ai_generation_jobs WHERE job_id = ?`,
      [jobId],
    );
    await pool.execute(`DELETE FROM ai_generation_jobs WHERE job_id = ?`, [jobId]);
    const fileId = rows.length ? rows[0]!.output_file_id : null;
    if (fileId) await pool.execute(`DELETE FROM files WHERE file_id = ?`, [fileId]);
  }
  for (const flowId of ctx.flowIds) {
    await pool.execute(`DELETE FROM generation_flows WHERE flow_id = ?`, [flowId]);
  }
  for (const userId of ctx.userIds) {
    await pool.execute(`DELETE FROM users WHERE user_id = ?`, [userId]);
  }
  await pool.end();
});

async function seedFlowJob(jobId: string, capability: AiGenerateJobPayload['capability']): Promise<void> {
  ctx.jobIds.push(jobId);
  await pool.execute(
    `INSERT INTO ai_generation_jobs
       (job_id, user_id, model_id, capability, prompt, options, status, progress, flow_id, block_id)
     VALUES (?, ?, ?, ?, ?, CAST('{}' AS JSON), 'queued', 0, ?, ?)`,
    [jobId, ctx.userId, 'fal-ai/nano-banana-2', capability, 'a cat', ctx.flowId, ctx.blockId],
  );
}

function makeJob(jobId: string, overrides: Partial<AiGenerateJobPayload> = {}): Job<AiGenerateJobPayload> {
  return {
    data: {
      jobId,
      userId: ctx.userId,
      modelId: 'fal-ai/nano-banana-2',
      capability: 'text_to_image',
      provider: 'fal',
      prompt: 'a cat',
      options: { prompt: 'a cat' },
      ...overrides,
    },
  } as Job<AiGenerateJobPayload>;
}

/** Real DB-backed deps; fal/S3/ingest/realtime are mocked. `output` drives the fal poll result. */
function makeRealDeps(output: unknown, opts: { failDownload?: boolean } = {}): AiGenerateJobDeps {
  const s3Send = vi.fn().mockResolvedValue({});
  const fetchMock = opts.failDownload
    ? vi.fn().mockResolvedValue({ ok: false, status: 502, arrayBuffer: async () => new ArrayBuffer(0) })
    : vi.fn().mockResolvedValue({ ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer });
  originalFetch = globalThis.fetch;
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

  return {
    s3: { send: s3Send } as unknown as S3Client,
    pool,
    bucket: BUCKET,
    falKey: 'fal-key',
    fal: {
      submitFalJob: vi.fn().mockResolvedValue({
        requestId: 'req-1',
        statusUrl: 'https://queue.fal.run/fal-ai/nano-banana-2/requests/req-1/status',
        responseUrl: 'https://queue.fal.run/fal-ai/nano-banana-2/requests/req-1',
      }) as unknown as AiGenerateJobDeps['fal']['submitFalJob'],
      getFalJobStatus: vi
        .fn()
        .mockResolvedValue({ status: 'COMPLETED', output }) as unknown as AiGenerateJobDeps['fal']['getFalJobStatus'],
    },
    elevenlabsKey: 'el-key',
    elevenlabs: {} as unknown as AiGenerateJobDeps['elevenlabs'],
    ingestQueue: { add: vi.fn().mockResolvedValue({ id: 'i-1' }) } as unknown as Queue<MediaIngestJobPayload>,
    filesRepo,
    aiGenerationJobRepo,
  };
}

async function countFilesForJob(jobId: string): Promise<number> {
  const [rows] = await pool.execute<Array<{ n: number }>>(
    `SELECT COUNT(*) AS n FROM files WHERE file_id =
       (SELECT output_file_id FROM ai_generation_jobs WHERE job_id = ?)`,
    [jobId],
  );
  return Number(rows[0]!.n);
}

async function countFlowLinks(flowId: string, fileId: string | null): Promise<number> {
  if (!fileId) {
    const [all] = await pool.execute<Array<{ n: number }>>(
      `SELECT COUNT(*) AS n FROM flow_files WHERE flow_id = ?`,
      [flowId],
    );
    return Number(all[0]!.n);
  }
  const [rows] = await pool.execute<Array<{ n: number }>>(
    `SELECT COUNT(*) AS n FROM flow_files WHERE flow_id = ? AND file_id = ?`,
    [flowId, fileId],
  );
  return Number(rows[0]!.n);
}

async function readJob(jobId: string): Promise<{ status: string; output_file_id: string | null }> {
  const [rows] = await pool.execute<Array<{ status: string; output_file_id: string | null }>>(
    `SELECT status, output_file_id FROM ai_generation_jobs WHERE job_id = ?`,
    [jobId],
  );
  return rows[0]!;
}

describe('T13 — ai-generate flow linkage: asset exists iff generation succeeded', () => {
  it('SUCCESS: writes exactly one files row AND exactly one flow_files link', async () => {
    const jobId = `t13-ok-${randomUUID()}`;
    await seedFlowJob(jobId, 'text_to_image');

    await processAiGenerateJob(makeJob(jobId), makeRealDeps(SINGLE_IMAGE_OUTPUT));

    const job = await readJob(jobId);
    expect(job.status).toBe('completed');
    expect(job.output_file_id).not.toBeNull();
    expect(await countFilesForJob(jobId)).toBe(1);
    expect(await countFlowLinks(ctx.flowId, job.output_file_id)).toBe(1);

    // No EXTRA links smuggled in for this flow beyond the one asset.
    const [linkRows] = await pool.execute<Array<{ file_id: string }>>(
      `SELECT file_id FROM flow_files WHERE flow_id = ? AND deleted_at IS NULL`,
      [ctx.flowId],
    );
    expect(linkRows.map((r) => r.file_id)).toEqual([job.output_file_id]);
  });

  it('FAILURE: writes zero files rows, zero flow_files links, publishes failed state', async () => {
    const jobId = `t13-fail-${randomUUID()}`;
    await seedFlowJob(jobId, 'text_to_image');

    // Isolate this case on its own flow so the assertion measures ONLY what this
    // failed run did — independent of links other cases wrote on the shared flow.
    const failFlowId = randomUUID();
    ctx.flowIds.push(failFlowId);
    await pool.execute(
      `INSERT INTO generation_flows (flow_id, user_id, title, canvas, version)
       VALUES (?, ?, ?, CAST('{}' AS JSON), 1)`,
      [failFlowId, ctx.userId, 'T13 fail flow'],
    );
    await pool.execute(`UPDATE ai_generation_jobs SET flow_id = ? WHERE job_id = ?`, [failFlowId, jobId]);

    const linksBefore = await countFlowLinks(failFlowId, null);

    // Empty fal output → parseFalOutput throws → handler catch path.
    await expect(
      processAiGenerateJob(makeJob(jobId), makeRealDeps({ images: [] })),
    ).rejects.toThrow();

    const job = await readJob(jobId);
    expect(job.status).toBe('failed');
    expect(job.output_file_id).toBeNull();
    expect(await countFilesForJob(jobId)).toBe(0);
    // No asset → no link: the failed run leaves the flow's link set untouched.
    expect(await countFlowLinks(failFlowId, null)).toBe(linksBefore);
    expect(await countFlowLinks(failFlowId, null)).toBe(0);
  });

  it('MULTI-OUTPUT: a 3-image provider response yields exactly one result + one link', async () => {
    const jobId = `t13-multi-${randomUUID()}`;
    await seedFlowJob(jobId, 'text_to_image');

    await processAiGenerateJob(makeJob(jobId), makeRealDeps(MULTI_IMAGE_OUTPUT));

    const job = await readJob(jobId);
    expect(job.status).toBe('completed');
    expect(await countFilesForJob(jobId)).toBe(1);
    expect(await countFlowLinks(ctx.flowId, job.output_file_id)).toBe(1);
  });
});
