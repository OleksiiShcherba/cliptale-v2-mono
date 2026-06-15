/**
 * T10 — Worker completion-hooks advance phases via the shared transition module.
 *
 * Integration test (real MySQL). The worker owns its OWN db pool (apps/media-worker/
 * src/lib/db.ts) and writes the storyboard_pipeline row DIRECTLY under a version CAS
 * (ADR-0003, ADR-0007). The pure transition module (@ai-video-editor/project-schema)
 * decides legality; this hooks module performs the CAS write with the worker pool.
 *
 * ACs covered:
 *   AC-02 — after scene generation completes, the scene phase is `completed` and the
 *           pipeline advances to reference-data (running).
 *   AC-03 — once EVERY reference image has reached a terminal result (success OR
 *           failure), reference_image becomes `completed` and scene_image becomes
 *           `awaiting_review` (the scene-image offer). A failed reference is still
 *           terminal — the phase advances regardless (failure-tolerant).
 *   AC-04 — every phase advance is a version CAS: a stale version does not double-apply.
 *
 * Run from apps/media-worker:
 *   APP_DB_PASSWORD=cliptale APP_REDIS_URL=redis://localhost:6380 \
 *     npx vitest run src/jobs/storyboardPipelineHooks.integration.test.ts
 */
import { randomUUID } from 'node:crypto';

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('@/lib/realtime.js', () => ({
  publishReferenceBlockStatus: vi.fn().mockResolvedValue(undefined),
  publishStoryboardPlanStatus: vi.fn().mockResolvedValue(undefined),
  publishCastExtractionStatus: vi.fn().mockResolvedValue(undefined),
  publishPipelineState: vi.fn().mockResolvedValue(undefined),
}));

import { pool } from '@/lib/db.js';
import {
  onSceneGenerationComplete,
  onCastProposalReady,
  onReferenceImagesAllTerminal,
  refreshActiveRunHeartbeat,
} from '@/jobs/storyboardPipelineHooks.js';

const PREFIX = 'sgp-t10';

type Ctx = { userId: string; draftIds: string[] };
const ctx: Ctx = { userId: '', draftIds: [] };

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
  sceneStatus: string;
  referenceDataStatus: string;
  referenceImageStatus: string;
  sceneImageStatus: string;
  activeRunPhase: string | null;
  version: number;
}): Promise<void> {
  await pool.execute(
    `INSERT INTO storyboard_pipeline
       (draft_id, active_phase, scene_status, reference_data_status,
        reference_image_status, scene_image_status, active_run_phase, version,
        heartbeat_at, phase_started_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))`,
    [
      params.draftId,
      params.activePhase,
      params.sceneStatus,
      params.referenceDataStatus,
      params.referenceImageStatus,
      params.sceneImageStatus,
      params.activeRunPhase,
      params.version,
    ],
  );
}

type PipelineRow = {
  active_phase: string;
  scene_status: string;
  reference_data_status: string;
  reference_image_status: string;
  scene_image_status: string;
  active_run_phase: string | null;
  version: number;
  cost_estimate: string | null;
  payload_json: unknown | null;
  heartbeat_age_ms: number;
};

async function readPipeline(draftId: string): Promise<PipelineRow> {
  const [rows] = await pool.execute<PipelineRow[]>(
    `SELECT active_phase, scene_status, reference_data_status, reference_image_status,
            scene_image_status, active_run_phase, version,
            CAST(cost_estimate AS CHAR) AS cost_estimate, payload_json,
            TIMESTAMPDIFF(MICROSECOND, heartbeat_at, NOW(3)) / 1000 AS heartbeat_age_ms
       FROM storyboard_pipeline WHERE draft_id = ?`,
    [draftId],
  );
  const row = rows[0]!;
  // mysql2 returns the DECIMAL division as a string — coerce for numeric assertions.
  row.heartbeat_age_ms = Number(row.heartbeat_age_ms);
  return row;
}

/** The per-unit illustration price (flow_model_pricing) used by the estimate math. */
async function queryPerUnit(): Promise<number> {
  const [rows] = await pool.execute<Array<{ base_amount: string | null; per_image: string | null }>>(
    `SELECT base_amount, per_image FROM flow_model_pricing WHERE model_id = 'openai/gpt-image-2' LIMIT 1`,
  );
  if (!rows.length) return 0;
  const r = rows[0]!;
  const perImage = r.per_image != null ? parseFloat(r.per_image) : null;
  const baseAmount = r.base_amount != null ? parseFloat(r.base_amount) : 0;
  return perImage ?? baseAmount;
}

function parsePayload(raw: unknown): Record<string, unknown> {
  if (raw == null) return {};
  return typeof raw === 'string' ? JSON.parse(raw) : (raw as Record<string, unknown>);
}

beforeAll(async () => {
  ctx.userId = randomUUID();
  await pool.execute(
    `INSERT INTO users (user_id, email, display_name, email_verified)
     VALUES (?, ?, ?, 1)`,
    [ctx.userId, `${PREFIX}-${ctx.userId}@example.test`, 'T10 Tester'],
  );
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterAll(async () => {
  for (const draftId of ctx.draftIds) {
    await pool.execute(`DELETE FROM storyboard_pipeline WHERE draft_id = ?`, [draftId]);
    await pool.execute(`DELETE FROM storyboard_reference_blocks WHERE draft_id = ?`, [draftId]);
    await pool.execute(`DELETE FROM storyboard_cast_extraction_jobs WHERE draft_id = ?`, [draftId]);
    await pool.execute(`DELETE FROM storyboard_blocks WHERE draft_id = ?`, [draftId]);
    await pool.execute(`DELETE FROM generation_drafts WHERE id = ?`, [draftId]);
  }
  await pool.execute(`DELETE FROM users WHERE user_id = ?`, [ctx.userId]);
  await pool.end();
});

describe('T10 — worker completion-hooks advance phases via the transition module', () => {
  // ── AC-02: scene → reference_data advance ─────────────────────────────────
  it('AC-02: scene-generation completion marks scene completed and advances to reference-data running', async () => {
    const draftId = await seedDraft();
    await seedPipeline({
      draftId,
      activePhase: 'scene',
      sceneStatus: 'running',
      referenceDataStatus: 'idle',
      referenceImageStatus: 'idle',
      sceneImageStatus: 'idle',
      activeRunPhase: 'scene',
      version: 1,
    });

    await onSceneGenerationComplete({ pool, draftId });

    const row = await readPipeline(draftId);
    expect(row.scene_status).toBe('completed');
    expect(row.reference_data_status).toBe('running');
    expect(row.active_phase).toBe('reference_data');
    expect(row.active_run_phase).toBe('reference_data');
    expect(row.version).toBe(2); // version bumped exactly once
  });

  // ── AC-02: cast proposal ready → reference_data awaiting_review ─────────────
  it('AC-02: cast-proposal-ready advances reference-data to awaiting_review', async () => {
    const draftId = await seedDraft();
    await seedPipeline({
      draftId,
      activePhase: 'reference_data',
      sceneStatus: 'completed',
      referenceDataStatus: 'running',
      referenceImageStatus: 'idle',
      sceneImageStatus: 'idle',
      activeRunPhase: 'reference_data',
      version: 2,
    });

    await onCastProposalReady({ pool, draftId });

    const row = await readPipeline(draftId);
    expect(row.reference_data_status).toBe('awaiting_review');
    expect(row.active_run_phase).toBeNull(); // run released for review
    expect(row.version).toBe(3);
  });

  // ── AC-03: all reference images terminal (incl. one failed) → advance ──────
  it('AC-03: all reference images terminal (one failed) advances reference_image to completed and scene_image to awaiting_review', async () => {
    const draftId = await seedDraft();
    await seedPipeline({
      draftId,
      activePhase: 'reference_image',
      sceneStatus: 'completed',
      referenceDataStatus: 'completed',
      referenceImageStatus: 'running',
      sceneImageStatus: 'idle',
      activeRunPhase: 'reference_image',
      version: 5,
    });
    // Two terminal reference blocks — one done, one failed (failure-tolerant).
    await pool.execute(
      `INSERT INTO storyboard_reference_blocks (id, draft_id, cast_type, name, sort_order, window_status)
       VALUES (?, ?, 'character', 'Block A', 0, 'done'), (?, ?, 'character', 'Block B', 1, 'failed')`,
      [randomUUID(), draftId, randomUUID(), draftId],
    );

    await onReferenceImagesAllTerminal({ pool, draftId });

    const row = await readPipeline(draftId);
    expect(row.reference_image_status).toBe('completed');
    expect(row.scene_image_status).toBe('awaiting_review');
    expect(row.active_phase).toBe('scene_image');
    expect(row.version).toBe(6);
  });

  // ── AC-03: NOT all terminal → no advance (a pending block remains) ─────────
  it('AC-03: does NOT advance when a reference block is still running/pending', async () => {
    const draftId = await seedDraft();
    await seedPipeline({
      draftId,
      activePhase: 'reference_image',
      sceneStatus: 'completed',
      referenceDataStatus: 'completed',
      referenceImageStatus: 'running',
      sceneImageStatus: 'idle',
      activeRunPhase: 'reference_image',
      version: 5,
    });
    await pool.execute(
      `INSERT INTO storyboard_reference_blocks (id, draft_id, cast_type, name, sort_order, window_status)
       VALUES (?, ?, 'character', 'Block A', 0, 'done'), (?, ?, 'character', 'Block B', 1, 'running')`,
      [randomUUID(), draftId, randomUUID(), draftId],
    );

    await onReferenceImagesAllTerminal({ pool, draftId });

    const row = await readPipeline(draftId);
    expect(row.reference_image_status).toBe('running'); // unchanged
    expect(row.scene_image_status).toBe('idle');
    expect(row.version).toBe(5); // no CAS applied
  });

  // ── AC-04: a transition is a version CAS (stale version no-ops) ────────────
  it('AC-04: a stale version does not double-apply the advance (version CAS)', async () => {
    const draftId = await seedDraft();
    await seedPipeline({
      draftId,
      activePhase: 'scene',
      sceneStatus: 'running',
      referenceDataStatus: 'idle',
      referenceImageStatus: 'idle',
      sceneImageStatus: 'idle',
      activeRunPhase: 'scene',
      version: 1,
    });

    // First advance succeeds (version 1 → 2).
    await onSceneGenerationComplete({ pool, draftId });
    const afterFirst = await readPipeline(draftId);
    expect(afterFirst.version).toBe(2);

    // A redelivery that reads the SAME stale snapshot (version 1) must NOT apply.
    // The hook re-reads current state, so a second call now sees scene=completed
    // and must not re-advance / double-bump the version.
    await onSceneGenerationComplete({ pool, draftId });
    const afterSecond = await readPipeline(draftId);
    expect(afterSecond.version).toBe(2); // unchanged — idempotent, no double-apply
    expect(afterSecond.reference_data_status).toBe('running');
  });

  // ── G3 review fix: cast-proposal payload + reference-image estimate persisted ──
  it('G3/AC-02/AC-03: onCastProposalReady persists payload.cast_proposal AND cost_estimate', async () => {
    const draftId = await seedDraft();
    await seedPipeline({
      draftId,
      activePhase: 'reference_data',
      sceneStatus: 'completed',
      referenceDataStatus: 'running',
      referenceImageStatus: 'idle',
      sceneImageStatus: 'idle',
      activeRunPhase: 'reference_data',
      version: 2,
    });
    // A completed cast-extraction job whose proposal is the modal's source data.
    await pool.execute(
      `INSERT INTO storyboard_cast_extraction_jobs (id, draft_id, user_id, status, proposal_json, completed_at)
       VALUES (?, ?, ?, 'completed', CAST(? AS JSON), NOW(3))`,
      [
        randomUUID(),
        draftId,
        ctx.userId,
        JSON.stringify({
          cast: [
            { type: 'character', name: 'Hero', scene_block_ids: ['s1', 's2'] },
            { type: 'environment', name: 'Forest', scene_block_ids: [] },
          ],
        }),
      ],
    );

    await onCastProposalReady({ pool, draftId });

    const row = await readPipeline(draftId);
    expect(row.reference_data_status).toBe('awaiting_review');

    // Payload carries each proposed reference with its AI-selected scenes (AC-02).
    const payload = parsePayload(row.payload_json) as {
      cast_proposal?: { references?: Array<{ name: string; kind: string; scene_ids: string[] }> };
    };
    const refs = payload.cast_proposal?.references ?? [];
    expect(refs).toHaveLength(2);
    expect(refs[0]).toMatchObject({ name: 'Hero', kind: 'character', scene_ids: ['s1', 's2'] });
    expect(refs[1]).toMatchObject({ name: 'Forest', kind: 'environment', scene_ids: [] });

    // Reference-image cost estimate = cast size × per-unit (AC-03), same source the
    // api confirm.service re-validates against.
    const perUnit = await queryPerUnit();
    expect(row.cost_estimate).toBe((2 * perUnit).toFixed(4));
  });

  // ── G2 review fix: scene-image offer carries a precomputed estimate ──
  it('G2/AC-04: onReferenceImagesAllTerminal persists the scene-image cost_estimate on the offer', async () => {
    const draftId = await seedDraft();
    await seedPipeline({
      draftId,
      activePhase: 'reference_image',
      sceneStatus: 'completed',
      referenceDataStatus: 'completed',
      referenceImageStatus: 'running',
      sceneImageStatus: 'idle',
      activeRunPhase: 'reference_image',
      version: 5,
    });
    // One terminal reference block (so the phase advances).
    await pool.execute(
      `INSERT INTO storyboard_reference_blocks (id, draft_id, cast_type, name, sort_order, window_status)
       VALUES (?, ?, 'character', 'Block A', 0, 'done')`,
      [randomUUID(), draftId],
    );
    // Three Step-2 scene blocks → scene-image estimate = 3 × per-unit.
    for (let i = 0; i < 3; i++) {
      await pool.execute(
        `INSERT INTO storyboard_blocks (id, draft_id, block_type, name, sort_order)
         VALUES (?, ?, 'scene', ?, ?)`,
        [randomUUID(), draftId, `Scene ${i + 1}`, i],
      );
    }

    await onReferenceImagesAllTerminal({ pool, draftId });

    const row = await readPipeline(draftId);
    expect(row.scene_image_status).toBe('awaiting_review');
    const perUnit = await queryPerUnit();
    expect(row.cost_estimate).toBe((3 * perUnit).toFixed(4)); // scene-image offer estimate
    const payload = parsePayload(row.payload_json) as {
      scene_image_offer?: { scene_count?: number };
    };
    expect(payload.scene_image_offer?.scene_count).toBe(3);
  });

  // ── B2 review fix: heartbeat refresh keeps a healthy long-running phase alive ──
  it('B2/AC-12: refreshActiveRunHeartbeat re-stamps the active-run phase heartbeat', async () => {
    const draftId = await seedDraft();
    await seedPipeline({
      draftId,
      activePhase: 'reference_image',
      sceneStatus: 'completed',
      referenceDataStatus: 'completed',
      referenceImageStatus: 'running',
      sceneImageStatus: 'idle',
      activeRunPhase: 'reference_image',
      version: 5,
    });
    // Age the heartbeat well past the stuck-bound.
    await pool.execute(
      `UPDATE storyboard_pipeline SET heartbeat_at = (NOW(3) - INTERVAL 15 MINUTE) WHERE draft_id = ?`,
      [draftId],
    );
    const before = await readPipeline(draftId);
    expect(before.heartbeat_age_ms).toBeGreaterThan(10 * 60 * 1000); // stale

    await refreshActiveRunHeartbeat(pool, draftId, 'reference_image');

    const after = await readPipeline(draftId);
    expect(after.heartbeat_age_ms).toBeLessThan(60 * 1000); // fresh — out of reaper reach

    // A phase that does NOT hold the run is not refreshed (no-op).
    await pool.execute(
      `UPDATE storyboard_pipeline SET heartbeat_at = (NOW(3) - INTERVAL 15 MINUTE) WHERE draft_id = ?`,
      [draftId],
    );
    await refreshActiveRunHeartbeat(pool, draftId, 'scene_image'); // not the active run
    const unchanged = await readPipeline(draftId);
    expect(unchanged.heartbeat_age_ms).toBeGreaterThan(10 * 60 * 1000); // still stale
  });
});
