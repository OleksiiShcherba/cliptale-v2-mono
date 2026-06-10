/**
 * T11 — reference boundary integration test (real MySQL).
 *
 * Verifies AC-09: the scene generation master considers ONLY the starred images
 * of blocks linked to scene X. Images of unlinked blocks NEVER appear in the
 * file-ID set passed to the OpenAI call for scene X.
 *
 * Strategy:
 *   - Real DB (sceneReferenceSelectionRepo.loadBlocksForDraft hits real tables).
 *   - Mocked S3, OpenAI, realtime, fileReadRepo — we intercept what file IDs
 *     the job requested so we can assert boundary enforcement without touching
 *     the OpenAI API.
 *   - Per-test unique IDs; ID-scoped cleanup in afterAll.
 *
 * Run from apps/media-worker:
 *   APP_DB_PASSWORD=cliptale APP_REDIS_URL=redis://localhost:6380 \
 *   npx vitest run src/jobs/storyboardOpenAIImage.job.integration.test.ts
 */
import { randomUUID } from 'node:crypto';

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { Job } from 'bullmq';
import type { S3Client } from '@aws-sdk/client-s3';
import type OpenAI from 'openai';
import type { StoryboardOpenAIImageJobPayload } from '@ai-video-editor/project-schema';

vi.mock('@/lib/realtime.js', () => ({
  publishAiGenerationJobStatus: vi.fn().mockResolvedValue(undefined),
}));

import { pool } from '@/lib/db.js';
import { sceneReferenceSelectionRepo } from '@/jobs/workerRepositories.js';
import {
  processStoryboardOpenAIImageJob,
  type StoryboardOpenAIImageJobDeps,
} from '@/jobs/storyboardOpenAIImage.job.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const B64_IMAGE = Buffer.from([9, 8, 7, 6]).toString('base64');

// ---------------------------------------------------------------------------
// Context — collects all IDs for cleanup
// ---------------------------------------------------------------------------

type Ctx = {
  userId: string;
  draftId: string;
  sceneBlockIds: string[];
  refBlockIds: string[];
  fileIds: string[];
  jobIds: string[];
  flowIds: string[];
};

const ctx: Ctx = {
  userId: '',
  draftId: '',
  sceneBlockIds: [],
  refBlockIds: [],
  fileIds: [],
  jobIds: [],
  flowIds: [],
};

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

async function seedUser(userId: string): Promise<void> {
  await pool.execute(
    `INSERT INTO users (user_id, email, display_name, email_verified)
     VALUES (?, ?, ?, 1)`,
    [userId, `t11-${userId}@example.test`, 'T11 Tester'],
  );
}

async function seedDraft(draftId: string, userId: string): Promise<void> {
  await pool.execute(
    `INSERT INTO generation_drafts (id, user_id, prompt_doc)
     VALUES (?, ?, CAST('{"segments":[]}' AS JSON))`,
    [draftId, userId],
  );
}

async function seedSceneBlock(blockId: string, draftId: string, sortOrder: number): Promise<void> {
  ctx.sceneBlockIds.push(blockId);
  await pool.execute(
    `INSERT INTO storyboard_blocks
       (id, draft_id, block_type, name, prompt, duration_s, position_x, position_y, sort_order, style)
     VALUES (?, ?, 'scene', 'Scene', 'A scene.', 5, 0, 0, ?, 'cinematic')`,
    [blockId, draftId, sortOrder],
  );
}

async function seedFile(fileId: string, userId: string): Promise<void> {
  ctx.fileIds.push(fileId);
  await pool.execute(
    `INSERT INTO files
       (file_id, user_id, kind, storage_uri, mime_type, bytes, width, height, display_name, status)
     VALUES (?, ?, 'image', ?, 'image/png', 100, null, null, 'ref.png', 'ready')`,
    [fileId, userId, `s3://test-bucket/refs/${fileId}.png`],
  );
}

async function seedFlow(flowId: string, userId: string): Promise<void> {
  ctx.flowIds.push(flowId);
  await pool.execute(
    `INSERT INTO generation_flows (flow_id, user_id, title, canvas)
     VALUES (?, ?, 'Test Flow', '{}')`,
    [flowId, userId],
  );
}

async function seedFlowFile(flowId: string, fileId: string): Promise<void> {
  await pool.execute(
    `INSERT INTO flow_files (flow_id, file_id) VALUES (?, ?)`,
    [flowId, fileId],
  );
}

async function seedRefBlock(
  blockId: string,
  draftId: string,
  sortOrder: number,
  flowId?: string,
): Promise<void> {
  ctx.refBlockIds.push(blockId);
  await pool.execute(
    `INSERT INTO storyboard_reference_blocks
       (id, draft_id, flow_id, cast_type, name, sort_order, position_x, position_y, version)
     VALUES (?, ?, ?, 'character', 'Test Character', ?, 0, 0, 1)`,
    [blockId, draftId, flowId ?? null, sortOrder],
  );
}

async function seedSceneLink(refBlockId: string, sceneBlockId: string): Promise<void> {
  await pool.execute(
    `INSERT INTO storyboard_reference_scene_links (reference_block_id, scene_block_id)
     VALUES (?, ?)`,
    [refBlockId, sceneBlockId],
  );
}

async function seedStar(
  refBlockId: string,
  fileId: string,
  isPrimary: boolean,
): Promise<void> {
  const starId = randomUUID();
  await pool.execute(
    `INSERT INTO storyboard_reference_stars (id, reference_block_id, file_id, is_primary)
     VALUES (?, ?, ?, ?)`,
    [starId, refBlockId, fileId, isPrimary ? 1 : null],
  );
}

async function seedJob(jobId: string, draftId: string, userId: string): Promise<void> {
  ctx.jobIds.push(jobId);
  await pool.execute(
    `INSERT INTO ai_generation_jobs
       (job_id, user_id, model_id, capability, prompt, options, status, progress, draft_id)
     VALUES (?, ?, ?, ?, ?, CAST('{}' AS JSON), 'queued', 0, ?)`,
    [jobId, userId, 'openai/gpt-image-2', 'text_to_image', 'A scene.', draftId],
  );
}

// ---------------------------------------------------------------------------
// Deps factory — mocked S3/OpenAI; real sceneReferenceSelectionRepo
// ---------------------------------------------------------------------------

type CapturedFileIds = { fileIds: string[] | null };

function makeDeps(captured: CapturedFileIds): StoryboardOpenAIImageJobDeps {
  const imagesGenerate = vi.fn().mockResolvedValue({ data: [{ b64_json: B64_IMAGE }] });
  const imagesEdit = vi.fn().mockResolvedValue({ data: [{ b64_json: B64_IMAGE }] });
  const s3Send = vi.fn().mockImplementation(async (cmd: { input?: { Key?: string } }) => {
    if (cmd.input?.Key?.startsWith('refs/')) {
      return { Body: { transformToByteArray: async () => Buffer.from([1, 2, 3]) } };
    }
    return {};
  });

  // fileReadRepo: intercept requested file IDs, return stubs so the job can continue
  const findFilesByIds = vi.fn().mockImplementation(
    async (params: { userId: string; fileIds: string[] }) => {
      captured.fileIds = params.fileIds;
      // Return one stub per requested file so the job doesn't throw "unavailable"
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
    // The real repo — hits real MySQL
    sceneReferenceSelectionRepo,
  };
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeAll(async () => {
  ctx.userId = randomUUID();
  ctx.draftId = randomUUID();

  await seedUser(ctx.userId);
  await seedDraft(ctx.draftId, ctx.userId);
});

afterAll(async () => {
  // Cleanup in FK-safe order: stars → scene links → ref blocks → flow_files
  // → flows → scene blocks → files → jobs → draft → user
  if (ctx.refBlockIds.length) {
    const ph = ctx.refBlockIds.map(() => '?').join(',');
    await pool.execute(
      `DELETE FROM storyboard_reference_stars WHERE reference_block_id IN (${ph})`,
      ctx.refBlockIds,
    );
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
    await pool.execute(
      `DELETE FROM flow_files WHERE flow_id IN (${ph})`,
      ctx.flowIds,
    );
    await pool.execute(
      `DELETE FROM generation_flows WHERE flow_id IN (${ph})`,
      ctx.flowIds,
    );
  }
  if (ctx.sceneBlockIds.length) {
    const ph = ctx.sceneBlockIds.map(() => '?').join(',');
    await pool.execute(
      `DELETE FROM storyboard_blocks WHERE id IN (${ph})`,
      ctx.sceneBlockIds,
    );
  }
  if (ctx.fileIds.length) {
    const ph = ctx.fileIds.map(() => '?').join(',');
    await pool.execute(`DELETE FROM files WHERE file_id IN (${ph})`, ctx.fileIds);
  }
  for (const jobId of ctx.jobIds) {
    await pool.execute(
      `DELETE FROM ai_generation_jobs WHERE job_id = ?`,
      [jobId],
    );
  }
  await pool.execute(`DELETE FROM generation_drafts WHERE id = ?`, [ctx.draftId]);
  await pool.execute(`DELETE FROM users WHERE user_id = ?`, [ctx.userId]);
  await pool.end();
});

// ---------------------------------------------------------------------------
// Helper: make a scene job
// ---------------------------------------------------------------------------

function makeSceneJob(
  jobId: string,
  draftId: string,
  sceneBlockId: string,
  referenceFileIdsFromPayload: string[],
): Job<StoryboardOpenAIImageJobPayload> {
  return {
    data: {
      jobId,
      userId: ctx.userId,
      draftId,
      kind: 'scene',
      blockId: sceneBlockId,
      prompt: 'A dramatic scene.',
      referenceFileIds: referenceFileIdsFromPayload,
      size: '1024x1024',
    },
    attemptsMade: 0,
    opts: { attempts: 1 },
  } as Job<StoryboardOpenAIImageJobPayload>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('T11 — reference boundary: scene job uses only starred images of linked blocks', () => {
  it('AC-09: only starred images of blocks linked to scene X are passed to OpenAI — unlinked blocks never leak in', async () => {
    // Setup:
    //   sceneX — linked to refBlockA only
    //   sceneY — linked to refBlockB only (must never affect sceneX)
    //
    //   refBlockA linked to sceneX → starredFileA (primary)
    //   refBlockB linked to sceneY → starredFileB (primary) — MUST NOT appear for sceneX
    //
    // Payload carries both fileA and fileB in referenceFileIds (simulating an
    // enqueue that was not yet boundary-filtered). The worker must derive the
    // boundary-correct set using sceneReferenceSelectionRepo + selectSceneReferences,
    // and pass ONLY starredFileA to findFilesByIds for sceneX.

    const sceneXId = randomUUID();
    const sceneYId = randomUUID();
    const refBlockAId = randomUUID();
    const refBlockBId = randomUUID();
    const starredFileAId = randomUUID();
    const starredFileBId = randomUUID();
    const jobId = `t11-boundary-${randomUUID()}`;

    const flowAId = randomUUID();
    const flowBId = randomUUID();

    await seedSceneBlock(sceneXId, ctx.draftId, 0);
    await seedSceneBlock(sceneYId, ctx.draftId, 1);
    await seedFile(starredFileAId, ctx.userId);
    await seedFile(starredFileBId, ctx.userId);
    await seedFlow(flowAId, ctx.userId);
    await seedFlow(flowBId, ctx.userId);
    await seedRefBlock(refBlockAId, ctx.draftId, 0, flowAId);
    await seedRefBlock(refBlockBId, ctx.draftId, 1, flowBId);
    await seedSceneLink(refBlockAId, sceneXId); // block A → scene X
    await seedSceneLink(refBlockBId, sceneYId); // block B → scene Y (not X)
    await seedStar(refBlockAId, starredFileAId, true);  // primary star on block A
    await seedStar(refBlockBId, starredFileBId, true);  // primary star on block B (unlinked to X)
    // T8: outputs come from flow_files — seed completed flow outputs
    await seedFlowFile(flowAId, starredFileAId);
    await seedFlowFile(flowBId, starredFileBId);
    await seedJob(jobId, ctx.draftId, ctx.userId);

    // Payload intentionally carries BOTH file IDs (as if not boundary-filtered)
    const job = makeSceneJob(jobId, ctx.draftId, sceneXId, [starredFileAId, starredFileBId]);
    const captured: CapturedFileIds = { fileIds: null };
    const deps = makeDeps(captured);

    await processStoryboardOpenAIImageJob(job, deps);

    // The worker must have called findFilesByIds with ONLY the linked-block file
    expect(captured.fileIds).not.toBeNull();
    expect(captured.fileIds).toContain(starredFileAId);
    // Unlinked block's file must NEVER appear
    expect(captured.fileIds).not.toContain(starredFileBId);
  });

  it('AC-09: when no blocks are linked to scene X, the prompt is augmented with style description and referenceFileIds is empty', async () => {
    // Setup:
    //   sceneZ — no reference blocks linked to it
    //   refBlockC linked to a different scene — has a star (contributes to draft style)
    //
    // Expected: no image inputs are passed to OpenAI; the prompt is augmented
    // with the draft-global style description (derived from block C's starred file).

    const sceneZId = randomUUID();
    const otherSceneId = randomUUID();
    const refBlockCId = randomUUID();
    const starredFileCId = randomUUID();
    const jobId = `t11-nolinks-${randomUUID()}`;

    await seedSceneBlock(sceneZId, ctx.draftId, 2);
    await seedSceneBlock(otherSceneId, ctx.draftId, 3);
    await seedFile(starredFileCId, ctx.userId);
    await seedRefBlock(refBlockCId, ctx.draftId, 2);
    await seedSceneLink(refBlockCId, otherSceneId); // linked to other scene, NOT to Z
    await seedStar(refBlockCId, starredFileCId, true);
    await seedJob(jobId, ctx.draftId, ctx.userId);

    const imagesGenerate = vi.fn().mockResolvedValue({ data: [{ b64_json: B64_IMAGE }] });
    const imagesEdit = vi.fn().mockResolvedValue({ data: [{ b64_json: B64_IMAGE }] });
    const s3Send = vi.fn().mockResolvedValue({});

    const deps: StoryboardOpenAIImageJobDeps = {
      openai: { images: { generate: imagesGenerate, edit: imagesEdit } } as unknown as OpenAI,
      s3: { send: s3Send } as unknown as S3Client,
      pool,
      bucket: 'test-bucket',
      filesRepo: {
        createFile: vi.fn().mockImplementation(async (p: { fileId: string }) => p.fileId),
        markReady: vi.fn().mockResolvedValue(undefined),
      },
      fileReadRepo: { findFilesByIds: vi.fn().mockResolvedValue([]) },
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

    const job = makeSceneJob(jobId, ctx.draftId, sceneZId, []);

    await processStoryboardOpenAIImageJob(job, deps);

    // No linked blocks → no image inputs → imagesGenerate (not imagesEdit) called
    expect(imagesGenerate).toHaveBeenCalledOnce();
    expect(imagesEdit).not.toHaveBeenCalled();

    // Prompt must be augmented with style description (not just the raw payload prompt)
    const [generateCall] = imagesGenerate.mock.calls;
    const usedPrompt = (generateCall as [{ prompt: string }])[0].prompt as string;
    // The derived style description references the starred file, not the raw script prompt
    expect(usedPrompt).not.toBe('A dramatic scene.');
    // The style description format includes the file ID (from buildDraftStyleDescription)
    expect(usedPrompt).toContain(starredFileCId);
  });
});
