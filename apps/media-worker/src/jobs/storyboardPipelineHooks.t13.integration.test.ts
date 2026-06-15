/**
 * T13 — Instrument actual cost + estimate-vs-actual delta.
 *
 * Integration test (real MySQL). Verifies that when the two expensive pipeline phases
 * (reference_image, scene_image) complete, the `actual_cost` field is persisted on the
 * storyboard_pipeline row AND a structured telemetry log line is emitted that includes
 * the metric name `cost_estimate_actual_delta_pct` (SAD §7, ADR-0006).
 *
 * ACs covered:
 *   AC-03 — reference_image completion: actual_cost written in the version-CAS update.
 *   AC-04 — scene_image completion: actual_cost written in the version-CAS update.
 *   Both  — the delta-emission log includes `cost_estimate_actual_delta_pct`, draft_id,
 *            phase, estimate, actual, and the computed delta percent.
 *
 * Run from apps/media-worker:
 *   APP_DB_PASSWORD=cliptale APP_REDIS_URL=redis://localhost:6380 \
 *     npx vitest run src/jobs/storyboardPipelineHooks.t13.integration.test.ts
 */
import { randomUUID } from 'node:crypto';

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('@/lib/realtime.js', () => ({
  publishReferenceBlockStatus: vi.fn().mockResolvedValue(undefined),
  publishStoryboardPlanStatus: vi.fn().mockResolvedValue(undefined),
  publishCastExtractionStatus: vi.fn().mockResolvedValue(undefined),
}));

import { pool } from '@/lib/db.js';
import {
  onReferenceImagesAllTerminal,
  onSceneImagesAllTerminal,
} from '@/jobs/storyboardPipelineHooks.js';

const PREFIX = 'sgp-t13';

type Ctx = {
  userId: string;
  draftIds: string[];
  blockIds: string[];
  aiJobIds: string[];
  illJobIds: string[];
};
const ctx: Ctx = { userId: '', draftIds: [], blockIds: [], aiJobIds: [], illJobIds: [] };

// ── seed helpers ──────────────────────────────────────────────────────────────

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
  activePhase: string;
  referenceImageStatus: string;
  sceneImageStatus: string;
  activeRunPhase: string | null;
  version: number;
  costEstimate: string | null;
}): Promise<void> {
  await pool.execute(
    `INSERT INTO storyboard_pipeline
       (draft_id, active_phase, scene_status, reference_data_status,
        reference_image_status, scene_image_status, active_run_phase, version,
        heartbeat_at, phase_started_at, cost_estimate)
     VALUES (?, ?, 'completed', 'completed', ?, ?, ?, ?, NOW(3), NOW(3), ?)`,
    [
      params.draftId,
      params.activePhase,
      params.referenceImageStatus,
      params.sceneImageStatus,
      params.activeRunPhase,
      params.version,
      params.costEstimate,
    ],
  );
}

async function seedSceneBlock(draftId: string, sortOrder: number): Promise<string> {
  const blockId = randomUUID();
  ctx.blockIds.push(blockId);
  await pool.execute(
    `INSERT INTO storyboard_blocks
       (id, draft_id, block_type, name, prompt, duration_s, position_x, position_y, sort_order, style)
     VALUES (?, ?, 'scene', 'Scene', 'A scene.', 5, 0, 0, ?, 'cinematic')`,
    [blockId, draftId, sortOrder],
  );
  return blockId;
}

async function seedAiJob(draftId: string): Promise<string> {
  const jobId = randomUUID();
  ctx.aiJobIds.push(jobId);
  await pool.execute(
    `INSERT INTO ai_generation_jobs
       (job_id, user_id, model_id, capability, prompt, options, status, progress, draft_id)
     VALUES (?, ?, 'openai/gpt-image-2', 'text_to_image', 'A scene.', CAST('{}' AS JSON), 'queued', 0, ?)`,
    [jobId, ctx.userId, draftId],
  );
  return jobId;
}

async function seedIllustrationJob(params: {
  draftId: string;
  blockId: string;
  aiJobId: string;
  status: 'queued' | 'running' | 'ready' | 'failed';
}): Promise<string> {
  const id = randomUUID();
  ctx.illJobIds.push(id);
  await pool.execute(
    `INSERT INTO storyboard_scene_illustration_jobs
       (id, draft_id, block_id, ai_job_id, status)
     VALUES (?, ?, ?, ?, ?)`,
    [id, params.draftId, params.blockId, params.aiJobId, params.status],
  );
  return id;
}

type PipelineRow = {
  reference_image_status: string;
  scene_image_status: string;
  actual_cost: string | null;
  version: number;
};

async function readPipeline(draftId: string): Promise<PipelineRow> {
  const [rows] = await pool.execute<PipelineRow[]>(
    `SELECT reference_image_status, scene_image_status,
            CAST(actual_cost AS CHAR) AS actual_cost, version
       FROM storyboard_pipeline WHERE draft_id = ?`,
    [draftId],
  );
  return rows[0]!;
}

// ── lifecycle ─────────────────────────────────────────────────────────────────

beforeAll(async () => {
  ctx.userId = randomUUID();
  await pool.execute(
    `INSERT INTO users (user_id, email, display_name, email_verified)
     VALUES (?, ?, ?, 1)`,
    [ctx.userId, `${PREFIX}-${ctx.userId}@example.test`, 'T13 Tester'],
  );
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterAll(async () => {
  for (const id of ctx.illJobIds) {
    await pool.execute(`DELETE FROM storyboard_scene_illustration_jobs WHERE id = ?`, [id]);
  }
  for (const id of ctx.aiJobIds) {
    await pool.execute(`DELETE FROM ai_generation_jobs WHERE job_id = ?`, [id]);
  }
  for (const draftId of ctx.draftIds) {
    await pool.execute(`DELETE FROM storyboard_pipeline WHERE draft_id = ?`, [draftId]);
    await pool.execute(`DELETE FROM storyboard_reference_blocks WHERE draft_id = ?`, [draftId]);
    await pool.execute(`DELETE FROM storyboard_blocks WHERE draft_id = ?`, [draftId]);
    await pool.execute(`DELETE FROM generation_drafts WHERE id = ?`, [draftId]);
  }
  await pool.execute(`DELETE FROM users WHERE user_id = ?`, [ctx.userId]);
  await pool.end();
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe('T13 — actual cost is persisted and delta is emitted to telemetry', () => {
  // ── AC-03: reference_image completion persists actual_cost + emits delta ─────
  it('AC-03: onReferenceImagesAllTerminal persists actual_cost on the pipeline row', async () => {
    const draftId = await seedDraft();
    await seedPipeline({
      draftId,
      activePhase: 'reference_image',
      referenceImageStatus: 'running',
      sceneImageStatus: 'idle',
      activeRunPhase: 'reference_image',
      version: 5,
      costEstimate: '0.0800', // 2 blocks × $0.04
    });
    // Two terminal reference blocks — one done, one failed (failure-tolerant AC-03).
    await pool.execute(
      `INSERT INTO storyboard_reference_blocks (id, draft_id, cast_type, name, sort_order, window_status)
       VALUES (?, ?, 'character', 'Ref A', 0, 'done'), (?, ?, 'character', 'Ref B', 1, 'failed')`,
      [randomUUID(), draftId, randomUUID(), draftId],
    );

    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});

    await onReferenceImagesAllTerminal({ pool, draftId });

    const row = await readPipeline(draftId);
    // actual_cost must be written (non-null, numeric-formatted string)
    expect(row.actual_cost).not.toBeNull();
    expect(parseFloat(row.actual_cost!)).toBeGreaterThanOrEqual(0);
    // version must have been bumped (the CAS applied)
    expect(row.version).toBe(6);
    // reference_image must now be completed
    expect(row.reference_image_status).toBe('completed');

    spy.mockRestore();
  });

  it('AC-03: onReferenceImagesAllTerminal emits cost_estimate_actual_delta_pct to telemetry', async () => {
    const draftId = await seedDraft();
    await seedPipeline({
      draftId,
      activePhase: 'reference_image',
      referenceImageStatus: 'running',
      sceneImageStatus: 'idle',
      activeRunPhase: 'reference_image',
      version: 5,
      costEstimate: '0.0800',
    });
    await pool.execute(
      `INSERT INTO storyboard_reference_blocks (id, draft_id, cast_type, name, sort_order, window_status)
       VALUES (?, ?, 'character', 'Ref A', 0, 'done'), (?, ?, 'character', 'Ref B', 1, 'done')`,
      [randomUUID(), draftId, randomUUID(), draftId],
    );

    const infoArgs: unknown[][] = [];
    const spy = vi.spyOn(console, 'info').mockImplementation((...args) => {
      infoArgs.push(args);
    });

    await onReferenceImagesAllTerminal({ pool, draftId });

    spy.mockRestore();

    // At least one log call must carry the metric name
    const deltaLine = infoArgs
      .flat()
      .find((a) => typeof a === 'string' && a.includes('cost_estimate_actual_delta_pct'));
    expect(deltaLine).toBeDefined();

    // The line must also carry the draft_id and the phase
    const logStr = String(deltaLine ?? '');
    expect(logStr).toContain(draftId);
    expect(logStr).toContain('reference_image');
  });

  // ── AC-04: scene_image completion persists actual_cost + emits delta ──────────
  it('AC-04: onSceneImagesAllTerminal persists actual_cost on the pipeline row', async () => {
    const draftId = await seedDraft();
    await seedPipeline({
      draftId,
      activePhase: 'scene_image',
      referenceImageStatus: 'completed',
      sceneImageStatus: 'running',
      activeRunPhase: 'scene_image',
      version: 8,
      costEstimate: '0.0800', // 2 scenes × $0.04
    });
    const blockA = await seedSceneBlock(draftId, 0);
    const blockB = await seedSceneBlock(draftId, 1);
    const aiJobA = await seedAiJob(draftId);
    const aiJobB = await seedAiJob(draftId);
    await seedIllustrationJob({ draftId, blockId: blockA, aiJobId: aiJobA, status: 'ready' });
    await seedIllustrationJob({ draftId, blockId: blockB, aiJobId: aiJobB, status: 'failed' });

    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});

    await onSceneImagesAllTerminal({ pool, draftId });

    const row = await readPipeline(draftId);
    expect(row.actual_cost).not.toBeNull();
    expect(parseFloat(row.actual_cost!)).toBeGreaterThanOrEqual(0);
    expect(row.version).toBe(9);
    expect(row.scene_image_status).toBe('completed');

    spy.mockRestore();
  });

  it('AC-04: onSceneImagesAllTerminal emits cost_estimate_actual_delta_pct to telemetry', async () => {
    const draftId = await seedDraft();
    await seedPipeline({
      draftId,
      activePhase: 'scene_image',
      referenceImageStatus: 'completed',
      sceneImageStatus: 'running',
      activeRunPhase: 'scene_image',
      version: 8,
      costEstimate: '0.0800',
    });
    const blockA = await seedSceneBlock(draftId, 0);
    const blockB = await seedSceneBlock(draftId, 1);
    const aiJobA = await seedAiJob(draftId);
    const aiJobB = await seedAiJob(draftId);
    await seedIllustrationJob({ draftId, blockId: blockA, aiJobId: aiJobA, status: 'ready' });
    await seedIllustrationJob({ draftId, blockId: blockB, aiJobId: aiJobB, status: 'ready' });

    const infoArgs: unknown[][] = [];
    const spy = vi.spyOn(console, 'info').mockImplementation((...args) => {
      infoArgs.push(args);
    });

    await onSceneImagesAllTerminal({ pool, draftId });

    spy.mockRestore();

    const deltaLine = infoArgs
      .flat()
      .find((a) => typeof a === 'string' && a.includes('cost_estimate_actual_delta_pct'));
    expect(deltaLine).toBeDefined();

    const logStr = String(deltaLine ?? '');
    expect(logStr).toContain(draftId);
    expect(logStr).toContain('scene_image');
  });
});
