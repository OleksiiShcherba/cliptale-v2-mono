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
  legacyPrincipalIds: string[];
};

const ctx: Ctx = {
  userId: '',
  draftId: '',
  sceneBlockIds: [],
  refBlockIds: [],
  fileIds: [],
  jobIds: [],
  flowIds: [],
  legacyPrincipalIds: [],
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

/**
 * Seeds a flow_files row with deleted_at set (soft-deleted output).
 * Used by T12 AC-06b deleted-star fallback test.
 */
async function seedFlowFileDeleted(flowId: string, fileId: string): Promise<void> {
  await pool.execute(
    `INSERT INTO flow_files (flow_id, file_id, deleted_at) VALUES (?, ?, NOW(3))`,
    [flowId, fileId],
  );
}

/**
 * Seeds a legacy storyboard_illustration_references row (principal image record).
 * Used by T12 AC-08 ignore-on-read test.
 * The row is inert — it must never be consumed by the scene generation path.
 */
async function seedLegacyPrincipal(
  principalId: string,
  draftId: string,
  aiJobId: string,
  outputFileId: string,
): Promise<void> {
  ctx.legacyPrincipalIds.push(principalId);
  await pool.execute(
    `INSERT INTO storyboard_illustration_references
       (id, draft_id, ai_job_id, status, output_file_id, source_reference_file_ids,
        approval_status, active_lock)
     VALUES (?, ?, ?, 'ready', ?, CAST('[]' AS JSON), 'approved', NULL)`,
    [principalId, draftId, aiJobId, outputFileId],
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
  // Cleanup in FK-safe order: legacy principals → stars → scene links → ref blocks
  // → flow_files → flows → scene blocks → files → jobs → draft → user
  if (ctx.legacyPrincipalIds.length) {
    const ph = ctx.legacyPrincipalIds.map(() => '?').join(',');
    await pool.execute(
      `DELETE FROM storyboard_illustration_references WHERE id IN (${ph})`,
      ctx.legacyPrincipalIds,
    );
  }
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

// ---------------------------------------------------------------------------
// T12 — AC-05 / AC-06b / AC-04 / AC-08 (reference-gate worker invariants)
// ---------------------------------------------------------------------------

describe('T12 — reference boundary invariant and selection (AC-05/AC-06b/AC-04/AC-08)', () => {
  /**
   * AC-05 (§6 NFR Reference-boundary correctness):
   *   Block A linked to scene S (completed output a1) and block B NOT linked to S
   *   (completed output b1) → generation inputs for S contain a1 and NOT b1.
   *   This is the "0 scenes fed an unlinked output" invariant from spec §6.
   */
  it('AC-05 boundary invariant: unlinked block output is never in the provider inputs for scene S', async () => {
    const sceneS   = randomUUID();
    const sceneOther = randomUUID();
    const blockA   = randomUUID(); // linked to sceneS
    const blockB   = randomUUID(); // NOT linked to sceneS
    const flowA    = randomUUID();
    const flowB    = randomUUID();
    const fileA1   = randomUUID(); // output of blockA (linked)
    const fileB1   = randomUUID(); // output of blockB (unlinked — must never feed S)
    const jobId    = `t12-boundary-${randomUUID()}`;

    await seedSceneBlock(sceneS, ctx.draftId, 10);
    await seedSceneBlock(sceneOther, ctx.draftId, 11);
    await seedFile(fileA1, ctx.userId);
    await seedFile(fileB1, ctx.userId);
    await seedFlow(flowA, ctx.userId);
    await seedFlow(flowB, ctx.userId);
    await seedRefBlock(blockA, ctx.draftId, 10, flowA);
    await seedRefBlock(blockB, ctx.draftId, 11, flowB);
    await seedFlowFile(flowA, fileA1);   // blockA has a completed output
    await seedFlowFile(flowB, fileB1);   // blockB has a completed output too
    await seedSceneLink(blockA, sceneS); // only blockA is linked to sceneS

    await seedJob(jobId, ctx.draftId, ctx.userId);

    const captured: CapturedFileIds = { fileIds: null };
    const deps = makeDeps(captured);

    const job = makeSceneJob(jobId, ctx.draftId, sceneS, [fileA1, fileB1]);
    await processStoryboardOpenAIImageJob(job, deps);

    // fileA1 (linked block output) must be fed to the provider
    expect(captured.fileIds).not.toBeNull();
    expect(captured.fileIds).toContain(fileA1);
    // fileB1 (unlinked block output) must NEVER appear — 0 scenes fed an unlinked output
    expect(captured.fileIds).not.toContain(fileB1);
  });

  /**
   * AC-06b deleted-star fallback:
   *   Star points at a soft-deleted flow_file (deleted_at IS NOT NULL).
   *   The job must feed scene S the latest completed non-deleted output,
   *   never the dead star file, never empty (images.edit must be called, not images.generate).
   */
  it('AC-06b deleted-star fallback: latest non-deleted output used when primary star is soft-deleted', async () => {
    const sceneS   = randomUUID();
    const blockA   = randomUUID();
    const flowA    = randomUUID();
    const fileOld  = randomUUID(); // older non-deleted output — the expected fallback
    const fileDead = randomUUID(); // primary-starred but soft-deleted
    const jobId    = `t12-deadstar-${randomUUID()}`;

    await seedSceneBlock(sceneS, ctx.draftId, 20);
    await seedFile(fileOld, ctx.userId);
    await seedFile(fileDead, ctx.userId);
    await seedFlow(flowA, ctx.userId);
    await seedRefBlock(blockA, ctx.draftId, 20, flowA);
    await seedFlowFile(flowA, fileOld);         // non-deleted output
    await seedFlowFileDeleted(flowA, fileDead); // soft-deleted — primary star points here
    await seedSceneLink(blockA, sceneS);
    // Primary star points at the deleted file
    await seedStar(blockA, fileDead, true);

    await seedJob(jobId, ctx.draftId, ctx.userId);

    const imagesEdit = vi.fn().mockResolvedValue({ data: [{ b64_json: B64_IMAGE }] });
    const imagesGenerate = vi.fn().mockResolvedValue({ data: [{ b64_json: B64_IMAGE }] });

    const capturedForDeadStar: CapturedFileIds = { fileIds: null };
    const deps: StoryboardOpenAIImageJobDeps = {
      ...makeDeps(capturedForDeadStar),
      openai: {
        images: { generate: imagesGenerate, edit: imagesEdit },
      } as unknown as OpenAI,
    };

    const job = makeSceneJob(jobId, ctx.draftId, sceneS, [fileDead]);
    await processStoryboardOpenAIImageJob(job, deps);

    // Must never feed the dead star file
    expect(capturedForDeadStar.fileIds).not.toContain(fileDead);
    // Must feed the fallback (latest non-deleted output)
    expect(capturedForDeadStar.fileIds).toContain(fileOld);
    // Must call images.edit (reference inputs present) — not images.generate
    expect(imagesEdit).toHaveBeenCalled();
    expect(imagesGenerate).not.toHaveBeenCalled();
  });

  /**
   * AC-04 zero-reference path:
   *   Draft with no reference blocks → job uses images.generate (not images.edit)
   *   and no reference file IDs appear in the provider inputs.
   */
  it('AC-04 zero-reference path: draft with no ref blocks generates from prompt only (images.generate, no ref IDs)', async () => {
    const sceneS = randomUUID();
    const jobId  = `t12-zerorefs-${randomUUID()}`;

    await seedSceneBlock(sceneS, ctx.draftId, 30);
    // No reference blocks, no flows, no files — pure zero-reference draft
    await seedJob(jobId, ctx.draftId, ctx.userId);

    const imagesGenerate = vi.fn().mockResolvedValue({ data: [{ b64_json: B64_IMAGE }] });
    const imagesEdit = vi.fn().mockResolvedValue({ data: [{ b64_json: B64_IMAGE }] });
    const s3Send = vi.fn().mockResolvedValue({});
    const findFilesByIds = vi.fn().mockResolvedValue([]);

    const deps: StoryboardOpenAIImageJobDeps = {
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

    const job = makeSceneJob(jobId, ctx.draftId, sceneS, []);
    await processStoryboardOpenAIImageJob(job, deps);

    // Zero reference blocks → no image inputs → images.generate (not images.edit)
    expect(imagesGenerate).toHaveBeenCalledOnce();
    expect(imagesEdit).not.toHaveBeenCalled();
    // findFilesByIds must NOT have been called with any reference file IDs
    // (it may be called with an empty list or not called at all)
    for (const call of findFilesByIds.mock.calls) {
      const params = call[0] as { userId: string; fileIds: string[] };
      expect(params.fileIds).toHaveLength(0);
    }
  });

  /**
   * AC-08 legacy principal never consumed (ignore-on-read):
   *   A storyboard_illustration_references row is seeded for the draft.
   *   The worker must never pass the legacy principal's output_file_id to findFilesByIds,
   *   and the job must complete normally.
   */
  it('AC-08 legacy principal ignored: pre-existing storyboard_illustration_references row never feeds the scene', async () => {
    const sceneS        = randomUUID();
    const blockA        = randomUUID();
    const flowA         = randomUUID();
    const refFile       = randomUUID(); // the reference block's real output
    const legacyFile    = randomUUID(); // the legacy principal's output_file_id
    const principalId   = randomUUID();
    const principalJobId = randomUUID(); // ai_generation_jobs row for the principal
    const jobId         = `t12-legacy-${randomUUID()}`;

    await seedSceneBlock(sceneS, ctx.draftId, 40);
    await seedFile(refFile, ctx.userId);
    await seedFile(legacyFile, ctx.userId);
    await seedFlow(flowA, ctx.userId);
    await seedRefBlock(blockA, ctx.draftId, 40, flowA);
    await seedFlowFile(flowA, refFile);
    await seedSceneLink(blockA, sceneS);

    // Seed the ai_generation_jobs row the FK requires for the legacy principal
    await seedJob(principalJobId, ctx.draftId, ctx.userId);
    // Seed the legacy principal row itself
    await seedLegacyPrincipal(principalId, ctx.draftId, principalJobId, legacyFile);

    await seedJob(jobId, ctx.draftId, ctx.userId);

    const captured: CapturedFileIds = { fileIds: null };
    const deps = makeDeps(captured);

    const job = makeSceneJob(jobId, ctx.draftId, sceneS, [refFile]);
    await processStoryboardOpenAIImageJob(job, deps);

    // The real reference output must be present
    expect(captured.fileIds).toContain(refFile);
    // The legacy principal's file must NEVER appear — ignore-on-read invariant
    expect(captured.fileIds).not.toContain(legacyFile);
  });
});
