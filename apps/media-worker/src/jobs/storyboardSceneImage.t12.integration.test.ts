/**
 * T12 — Scene-image generation: references feed scenes + text-only fallback,
 * plus the failure-tolerant scene-image phase-completion hook.
 *
 * Integration test (real MySQL). Covers:
 *   AC-10 — a scene linked to a Ready reference block (window_status='done' with a
 *           selected output) feeds that output into the provider call (images.edit).
 *   AC-11 — a scene with NO linked reference, AND a scene linked ONLY to a non-Ready
 *           (failed) reference → text-only (images.generate); the batch is not blocked.
 *   AC-04 — when every storyboard_scene_illustration_jobs row for the draft is terminal
 *           (one failed, the rest ready) the scene_image phase advances to `completed`
 *           via onSceneImagesAllTerminal; the failed scene is left without an image and
 *           a per-scene failure does NOT fail the whole phase.
 *
 * Run from apps/media-worker:
 *   APP_DB_PASSWORD=cliptale APP_REDIS_URL=redis://localhost:6380 \
 *   npx vitest run src/jobs/storyboardSceneImage.t12.integration.test.ts
 */
import { randomUUID } from 'node:crypto';

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { Job } from 'bullmq';
import type { S3Client } from '@aws-sdk/client-s3';
import type OpenAI from 'openai';
import type { StoryboardOpenAIImageJobPayload } from '@ai-video-editor/project-schema';

vi.mock('@/lib/realtime.js', () => ({
  publishAiGenerationJobStatus: vi.fn().mockResolvedValue(undefined),
  publishReferenceBlockStatus: vi.fn().mockResolvedValue(undefined),
  publishStoryboardPlanStatus: vi.fn().mockResolvedValue(undefined),
  publishCastExtractionStatus: vi.fn().mockResolvedValue(undefined),
}));

import { pool } from '@/lib/db.js';
import { sceneReferenceSelectionRepo } from '@/jobs/workerRepositories.js';
import {
  processStoryboardOpenAIImageJob,
  type StoryboardOpenAIImageJobDeps,
} from '@/jobs/storyboardOpenAIImage.job.js';
import { onSceneImagesAllTerminal } from '@/jobs/storyboardPipelineHooks.js';

const PREFIX = 'sgp-t12';
const B64_IMAGE = Buffer.from([5, 4, 3, 2]).toString('base64');

type Ctx = {
  userId: string;
  draftIds: string[];
  sceneBlockIds: string[];
  refBlockIds: string[];
  fileIds: string[];
  jobIds: string[];
  flowIds: string[];
};

const ctx: Ctx = {
  userId: '',
  draftIds: [],
  sceneBlockIds: [],
  refBlockIds: [],
  fileIds: [],
  jobIds: [],
  flowIds: [],
};

// ── seed helpers ───────────────────────────────────────────────────────────

async function seedDraft(): Promise<string> {
  const draftId = randomUUID();
  ctx.draftIds.push(draftId);
  await pool.execute(
    `INSERT INTO generation_drafts (id, user_id, prompt_doc, status)
     VALUES (?, ?, CAST('{}' AS JSON), 'step2')`,
    [draftId, ctx.userId],
  );
  return draftId;
}

async function seedPipeline(params: {
  draftId: string;
  sceneImageStatus: string;
  version: number;
}): Promise<void> {
  await pool.execute(
    `INSERT INTO storyboard_pipeline
       (draft_id, active_phase, scene_status, reference_data_status,
        reference_image_status, scene_image_status, active_run_phase, version,
        heartbeat_at, phase_started_at)
     VALUES (?, 'scene_image', 'completed', 'completed', 'completed', ?, 'scene_image', ?, NOW(3), NOW(3))`,
    [params.draftId, params.sceneImageStatus, params.version],
  );
}

async function seedSceneBlock(draftId: string, sortOrder: number): Promise<string> {
  const blockId = randomUUID();
  ctx.sceneBlockIds.push(blockId);
  await pool.execute(
    `INSERT INTO storyboard_blocks
       (id, draft_id, block_type, name, prompt, duration_s, position_x, position_y, sort_order, style)
     VALUES (?, ?, 'scene', 'Scene', 'A scene.', 5, 0, 0, ?, 'cinematic')`,
    [blockId, draftId, sortOrder],
  );
  return blockId;
}

async function seedFile(userId: string): Promise<string> {
  const fileId = randomUUID();
  ctx.fileIds.push(fileId);
  await pool.execute(
    `INSERT INTO files
       (file_id, user_id, kind, storage_uri, mime_type, bytes, width, height, display_name, status)
     VALUES (?, ?, 'image', ?, 'image/png', 100, null, null, 'ref.png', 'ready')`,
    [fileId, userId, `s3://test-bucket/refs/${fileId}.png`],
  );
  return fileId;
}

async function seedFlow(userId: string): Promise<string> {
  const flowId = randomUUID();
  ctx.flowIds.push(flowId);
  await pool.execute(
    `INSERT INTO generation_flows (flow_id, user_id, title, canvas)
     VALUES (?, ?, 'Test Flow', '{}')`,
    [flowId, userId],
  );
  return flowId;
}

async function seedFlowFile(flowId: string, fileId: string): Promise<void> {
  await pool.execute(`INSERT INTO flow_files (flow_id, file_id) VALUES (?, ?)`, [flowId, fileId]);
}

async function seedRefBlock(params: {
  draftId: string;
  sortOrder: number;
  flowId?: string;
  windowStatus: 'pending' | 'running' | 'done' | 'failed' | null;
}): Promise<string> {
  const blockId = randomUUID();
  ctx.refBlockIds.push(blockId);
  await pool.execute(
    `INSERT INTO storyboard_reference_blocks
       (id, draft_id, flow_id, cast_type, name, sort_order, position_x, position_y, version, window_status)
     VALUES (?, ?, ?, 'character', 'Test Character', ?, 0, 0, 1, ?)`,
    [blockId, params.draftId, params.flowId ?? null, params.sortOrder, params.windowStatus],
  );
  return blockId;
}

async function seedSceneLink(refBlockId: string, sceneBlockId: string): Promise<void> {
  await pool.execute(
    `INSERT INTO storyboard_reference_scene_links (reference_block_id, scene_block_id)
     VALUES (?, ?)`,
    [refBlockId, sceneBlockId],
  );
}

async function seedAiJob(jobId: string, draftId: string, userId: string): Promise<void> {
  ctx.jobIds.push(jobId);
  await pool.execute(
    `INSERT INTO ai_generation_jobs
       (job_id, user_id, model_id, capability, prompt, options, status, progress, draft_id)
     VALUES (?, ?, 'openai/gpt-image-2', 'text_to_image', 'A scene.', CAST('{}' AS JSON), 'queued', 0, ?)`,
    [jobId, userId, draftId],
  );
}

async function seedIllustrationJob(params: {
  draftId: string;
  blockId: string;
  aiJobId: string;
  status: 'queued' | 'running' | 'ready' | 'failed';
}): Promise<string> {
  const id = randomUUID();
  await pool.execute(
    `INSERT INTO storyboard_scene_illustration_jobs
       (id, draft_id, block_id, ai_job_id, status)
     VALUES (?, ?, ?, ?, ?)`,
    [id, params.draftId, params.blockId, params.aiJobId, params.status],
  );
  return id;
}

type PipelineRow = {
  scene_image_status: string;
  active_phase: string;
  active_run_phase: string | null;
  version: number;
};

async function readPipeline(draftId: string): Promise<PipelineRow> {
  const [rows] = await pool.execute<PipelineRow[]>(
    `SELECT scene_image_status, active_phase, active_run_phase, version
       FROM storyboard_pipeline WHERE draft_id = ?`,
    [draftId],
  );
  return rows[0]!;
}

// ── deps factory (mocked S3/OpenAI; real selection repo) ─────────────────────

type Captured = { fileIds: string[] | null };

function makeDeps(captured: Captured): StoryboardOpenAIImageJobDeps {
  const imagesGenerate = vi.fn().mockResolvedValue({ data: [{ b64_json: B64_IMAGE }] });
  const imagesEdit = vi.fn().mockResolvedValue({ data: [{ b64_json: B64_IMAGE }] });
  const s3Send = vi.fn().mockImplementation(async (cmd: { input?: { Key?: string } }) => {
    if (cmd.input?.Key?.startsWith('refs/')) {
      return { Body: { transformToByteArray: async () => Buffer.from([1, 2, 3]) } };
    }
    return {};
  });
  const findFilesByIds = vi.fn().mockImplementation(
    async (params: { userId: string; fileIds: string[] }) => {
      captured.fileIds = params.fileIds;
      return params.fileIds.map((fileId) => ({
        fileId,
        storageUri: `s3://test-bucket/refs/${fileId}.png`,
        mimeType: 'image/png',
        displayName: `${fileId}.png`,
      }));
    },
  );

  return {
    openai: { images: { generate: imagesGenerate, edit: imagesEdit } } as unknown as OpenAI,
    s3: { send: s3Send } as unknown as S3Client,
    pool,
    bucket: 'test-bucket',
    filesRepo: {
      createFile: vi.fn().mockImplementation(async (p: { fileId: string }) => p.fileId),
      markReady: vi.fn().mockResolvedValue(undefined),
    },
    fileReadRepo: { findFilesByIds },
    aiGenerationJobRepo: {
      setOutputFile: vi.fn().mockResolvedValue(undefined),
      markFailed: vi.fn().mockResolvedValue(undefined),
    },
    storyboardSceneRepo: {
      attachOutputToBlock: vi.fn().mockResolvedValue(undefined),
      markFailed: vi.fn().mockResolvedValue(undefined),
    },
    sceneReferenceSelectionRepo,
  };
}

function makeSceneJob(
  jobId: string,
  draftId: string,
  sceneBlockId: string,
): Job<StoryboardOpenAIImageJobPayload> {
  return {
    data: {
      jobId,
      userId: ctx.userId,
      draftId,
      kind: 'scene',
      blockId: sceneBlockId,
      prompt: 'A dramatic scene.',
      referenceFileIds: [],
      size: '1024x1024',
    },
    attemptsMade: 0,
    opts: { attempts: 1 },
  } as Job<StoryboardOpenAIImageJobPayload>;
}

// ── lifecycle ────────────────────────────────────────────────────────────────

beforeAll(async () => {
  ctx.userId = randomUUID();
  await pool.execute(
    `INSERT INTO users (user_id, email, display_name, email_verified)
     VALUES (?, ?, ?, 1)`,
    [ctx.userId, `${PREFIX}-${ctx.userId}@example.test`, 'T12 Tester'],
  );
});

afterAll(async () => {
  for (const draftId of ctx.draftIds) {
    await pool.execute(
      `DELETE FROM storyboard_scene_illustration_jobs WHERE draft_id = ?`,
      [draftId],
    );
    await pool.execute(`DELETE FROM storyboard_pipeline WHERE draft_id = ?`, [draftId]);
  }
  if (ctx.refBlockIds.length) {
    const ph = ctx.refBlockIds.map(() => '?').join(',');
    await pool.execute(
      `DELETE FROM storyboard_reference_scene_links WHERE reference_block_id IN (${ph})`,
      ctx.refBlockIds,
    );
    await pool.execute(
      `DELETE FROM storyboard_reference_blocks WHERE id IN (${ph})`,
      ctx.refBlockIds,
    );
  }
  if (ctx.flowIds.length) {
    const ph = ctx.flowIds.map(() => '?').join(',');
    await pool.execute(`DELETE FROM flow_files WHERE flow_id IN (${ph})`, ctx.flowIds);
    await pool.execute(`DELETE FROM generation_flows WHERE flow_id IN (${ph})`, ctx.flowIds);
  }
  for (const jobId of ctx.jobIds) {
    await pool.execute(`DELETE FROM ai_generation_jobs WHERE job_id = ?`, [jobId]);
  }
  if (ctx.sceneBlockIds.length) {
    const ph = ctx.sceneBlockIds.map(() => '?').join(',');
    await pool.execute(`DELETE FROM storyboard_blocks WHERE id IN (${ph})`, ctx.sceneBlockIds);
  }
  if (ctx.fileIds.length) {
    const ph = ctx.fileIds.map(() => '?').join(',');
    await pool.execute(`DELETE FROM files WHERE file_id IN (${ph})`, ctx.fileIds);
  }
  for (const draftId of ctx.draftIds) {
    await pool.execute(`DELETE FROM generation_drafts WHERE id = ?`, [draftId]);
  }
  await pool.execute(`DELETE FROM users WHERE user_id = ?`, [ctx.userId]);
  await pool.end();
});

// ── tests ────────────────────────────────────────────────────────────────────

describe('T12 — references feed scenes + text-only fallback (AC-10/AC-11)', () => {
  it('AC-10: a scene linked to a Ready (window_status=done) reference feeds the selected output (images.edit)', async () => {
    const draftId = await seedDraft();
    const sceneId = await seedSceneBlock(draftId, 0);
    const refFile = await seedFile(ctx.userId);
    const flowId = await seedFlow(ctx.userId);
    await seedFlowFile(flowId, refFile);
    const refBlock = await seedRefBlock({ draftId, sortOrder: 0, flowId, windowStatus: 'done' });
    await seedSceneLink(refBlock, sceneId);

    const jobId = `${PREFIX}-ac10-${randomUUID()}`;
    await seedAiJob(jobId, draftId, ctx.userId);

    const captured: Captured = { fileIds: null };
    const deps = makeDeps(captured);
    const editSpy = (deps.openai as unknown as { images: { edit: ReturnType<typeof vi.fn> } }).images.edit;

    await processStoryboardOpenAIImageJob(makeSceneJob(jobId, draftId, sceneId), deps);

    expect(captured.fileIds).toContain(refFile);
    expect(editSpy).toHaveBeenCalled();
  });

  it('AC-11: a scene linked ONLY to a non-Ready (failed) reference falls back to text-only (images.generate)', async () => {
    const draftId = await seedDraft();
    const sceneId = await seedSceneBlock(draftId, 0);
    const refFile = await seedFile(ctx.userId);
    const flowId = await seedFlow(ctx.userId);
    await seedFlowFile(flowId, refFile); // stray output, but the block is NOT Ready
    const refBlock = await seedRefBlock({ draftId, sortOrder: 0, flowId, windowStatus: 'failed' });
    await seedSceneLink(refBlock, sceneId);

    const jobId = `${PREFIX}-ac11-failed-${randomUUID()}`;
    await seedAiJob(jobId, draftId, ctx.userId);

    const captured: Captured = { fileIds: null };
    const deps = makeDeps(captured);
    const genSpy = (deps.openai as unknown as { images: { generate: ReturnType<typeof vi.fn> } }).images.generate;
    const editSpy = (deps.openai as unknown as { images: { edit: ReturnType<typeof vi.fn> } }).images.edit;

    await processStoryboardOpenAIImageJob(makeSceneJob(jobId, draftId, sceneId), deps);

    // non-Ready block → its output must NOT be fed
    if (captured.fileIds) {
      expect(captured.fileIds).not.toContain(refFile);
    }
    // text-only: images.generate, not images.edit
    expect(genSpy).toHaveBeenCalledOnce();
    expect(editSpy).not.toHaveBeenCalled();
  });

  it('AC-11: a scene with no linked reference at all falls back to text-only (images.generate)', async () => {
    const draftId = await seedDraft();
    const sceneId = await seedSceneBlock(draftId, 0);

    const jobId = `${PREFIX}-ac11-none-${randomUUID()}`;
    await seedAiJob(jobId, draftId, ctx.userId);

    const captured: Captured = { fileIds: null };
    const deps = makeDeps(captured);
    const genSpy = (deps.openai as unknown as { images: { generate: ReturnType<typeof vi.fn> } }).images.generate;
    const editSpy = (deps.openai as unknown as { images: { edit: ReturnType<typeof vi.fn> } }).images.edit;

    await processStoryboardOpenAIImageJob(makeSceneJob(jobId, draftId, sceneId), deps);

    expect(genSpy).toHaveBeenCalledOnce();
    expect(editSpy).not.toHaveBeenCalled();
  });
});

describe('T12 — scene-image phase completes even when a scene fails (AC-04)', () => {
  it('AC-04: when all scene-illustration jobs are terminal (one failed) scene_image advances to completed', async () => {
    const draftId = await seedDraft();
    await seedPipeline({ draftId, sceneImageStatus: 'running', version: 7 });

    const sceneA = await seedSceneBlock(draftId, 0);
    const sceneB = await seedSceneBlock(draftId, 1);
    const okFile = await seedFile(ctx.userId);

    const jobA = randomUUID(); // CHAR(36) — matches storyboard_scene_illustration_jobs.ai_job_id
    const jobB = randomUUID();
    await seedAiJob(jobA, draftId, ctx.userId);
    await seedAiJob(jobB, draftId, ctx.userId);

    // One scene ready (with an output), one scene failed (no output).
    await pool.execute(
      `INSERT INTO storyboard_scene_illustration_jobs (id, draft_id, block_id, ai_job_id, status, output_file_id)
       VALUES (?, ?, ?, ?, 'ready', ?)`,
      [randomUUID(), draftId, sceneA, jobA, okFile],
    );
    const failedJobRowId = await seedIllustrationJob({
      draftId,
      blockId: sceneB,
      aiJobId: jobB,
      status: 'failed',
    });

    await onSceneImagesAllTerminal({ pool, draftId });

    const row = await readPipeline(draftId);
    // AC-04: phase completes even though one scene failed.
    expect(row.scene_image_status).toBe('completed');
    expect(row.active_run_phase).toBeNull();
    expect(row.version).toBe(8); // bumped exactly once

    // The failed scene is left without an image and stays re-triggerable (status failed, no output).
    const [failedRows] = await pool.execute<Array<{ status: string; output_file_id: string | null }>>(
      `SELECT status, output_file_id FROM storyboard_scene_illustration_jobs WHERE id = ?`,
      [failedJobRowId],
    );
    expect(failedRows[0]!.status).toBe('failed');
    expect(failedRows[0]!.output_file_id).toBeNull();
  });

  it('AC-04: does NOT advance while a scene-illustration job is still running', async () => {
    const draftId = await seedDraft();
    await seedPipeline({ draftId, sceneImageStatus: 'running', version: 3 });

    const sceneA = await seedSceneBlock(draftId, 0);
    const sceneB = await seedSceneBlock(draftId, 1);
    const jobA = randomUUID(); // CHAR(36) — matches storyboard_scene_illustration_jobs.ai_job_id
    const jobB = randomUUID();
    await seedAiJob(jobA, draftId, ctx.userId);
    await seedAiJob(jobB, draftId, ctx.userId);

    await seedIllustrationJob({ draftId, blockId: sceneA, aiJobId: jobA, status: 'ready' });
    await seedIllustrationJob({ draftId, blockId: sceneB, aiJobId: jobB, status: 'running' });

    await onSceneImagesAllTerminal({ pool, draftId });

    const row = await readPipeline(draftId);
    expect(row.scene_image_status).toBe('running'); // unchanged
    expect(row.version).toBe(3); // no CAS applied
  });
});
