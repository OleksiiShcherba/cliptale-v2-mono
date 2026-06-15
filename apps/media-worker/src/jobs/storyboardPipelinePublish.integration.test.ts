/**
 * T14 — Realtime publish on every pipeline transition (AC-05, ADR-0004).
 *
 * Integration test (real MySQL). Asserts that each worker completion-hook CAS
 * transition emits exactly ONE realtime publish of the FULL projected pipeline state,
 * and that the published `version` is strictly increasing across two transitions
 * (version-monotonic convergence — stale events can be ignored by observer tabs).
 *
 * Run from apps/media-worker:
 *   APP_DB_PASSWORD=cliptale APP_REDIS_URL=redis://localhost:6380 \
 *     npx vitest run src/jobs/storyboardPipelinePublish.integration.test.ts
 */
import { randomUUID } from 'node:crypto';

import { projectPipelineState } from '@ai-video-editor/project-schema';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

// Capture the projected state AT PUBLISH-TIME for each call: the mock re-reads the
// authoritative row (exactly as the real publishPipelineState does) and snapshots the
// version-stamped projection. This lets us assert one publish per transition and a
// strictly increasing version (version-monotonic convergence, AC-05 / ADR-0004).
const publishedStates: Array<{ draftId: string; version: number; refDataStatus: string }> = [];

const { mockPublishPipelineState } = vi.hoisted(() => ({
  mockPublishPipelineState: vi.fn(),
}));

vi.mock('@/lib/realtime.js', () => ({
  publishReferenceBlockStatus: vi.fn().mockResolvedValue(undefined),
  publishStoryboardPlanStatus: vi.fn().mockResolvedValue(undefined),
  publishCastExtractionStatus: vi.fn().mockResolvedValue(undefined),
  publishPipelineState: mockPublishPipelineState,
}));

import { pool } from '@/lib/db.js';
import {
  onSceneGenerationComplete,
  onCastProposalReady,
} from '@/jobs/storyboardPipelineHooks.js';

mockPublishPipelineState.mockImplementation(async (params: { pool: typeof pool; draftId: string }) => {
  const [rows] = await params.pool.query<any[]>(
    `SELECT draft_id, active_phase, active_run_phase, scene_status, reference_data_status,
            reference_image_status, scene_image_status, payload_json, version,
            CAST(cost_estimate AS CHAR) AS cost_estimate, error_message, updated_at
       FROM storyboard_pipeline WHERE draft_id = ?`,
    [params.draftId],
  );
  const r = rows[0];
  const state = projectPipelineState({
    draftId: r.draft_id,
    activePhase: r.active_phase,
    activeRunPhase: r.active_run_phase,
    sceneStatus: r.scene_status,
    referenceDataStatus: r.reference_data_status,
    referenceImageStatus: r.reference_image_status,
    sceneImageStatus: r.scene_image_status,
    payloadJson: r.payload_json,
    version: r.version,
    costEstimate: r.cost_estimate,
    errorMessage: r.error_message,
    updatedAt: r.updated_at,
  });
  publishedStates.push({
    draftId: params.draftId,
    version: state.version,
    refDataStatus: state.phases.reference_data.status,
  });
});

const PREFIX = 'sgp-t14';

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

beforeAll(async () => {
  ctx.userId = randomUUID();
  await pool.execute(
    `INSERT INTO users (user_id, email, display_name, email_verified)
     VALUES (?, ?, ?, 1)`,
    [ctx.userId, `${PREFIX}-${ctx.userId}@example.test`, 'T14 Tester'],
  );
});

beforeEach(() => {
  mockPublishPipelineState.mockClear();
  publishedStates.length = 0;
});

afterAll(async () => {
  for (const draftId of ctx.draftIds) {
    await pool.execute(`DELETE FROM storyboard_pipeline WHERE draft_id = ?`, [draftId]);
    await pool.execute(`DELETE FROM storyboard_reference_blocks WHERE draft_id = ?`, [draftId]);
    await pool.execute(`DELETE FROM generation_drafts WHERE id = ?`, [draftId]);
  }
  await pool.execute(`DELETE FROM users WHERE user_id = ?`, [ctx.userId]);
  await pool.end();
});

describe('T14 — every transition publishes the full version-stamped pipeline state', () => {
  it('publishes one version-monotonic event per transition (AC-05)', async () => {
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

    // Transition 1: scene completes → reference_data running (version 1 → 2).
    await onSceneGenerationComplete({ pool, draftId });
    // Transition 2: cast proposal ready → reference_data awaiting_review (version 2 → 3).
    await onCastProposalReady({ pool, draftId });

    // Exactly one publish per transition.
    expect(mockPublishPipelineState).toHaveBeenCalledTimes(2);
    expect(publishedStates).toHaveLength(2);

    const [first, second] = publishedStates;

    // Each publish carries the FULL projected, version-stamped state for the draft.
    expect(first!.draftId).toBe(draftId);
    expect(first!.version).toBe(2);
    expect(first!.refDataStatus).toBe('running');

    expect(second!.draftId).toBe(draftId);
    expect(second!.version).toBe(3);
    expect(second!.refDataStatus).toBe('awaiting_review');

    // Strictly increasing version across transitions (version-monotonic, AC-05).
    expect(second!.version).toBeGreaterThan(first!.version);
  });

  it('does NOT publish when a transition is a no-op (no CAS applied)', async () => {
    const draftId = await seedDraft();
    // scene already completed — onSceneGenerationComplete is a legal no-op.
    await seedPipeline({
      draftId,
      activePhase: 'reference_data',
      sceneStatus: 'completed',
      referenceDataStatus: 'awaiting_review',
      referenceImageStatus: 'idle',
      sceneImageStatus: 'idle',
      activeRunPhase: null,
      version: 5,
    });

    await onSceneGenerationComplete({ pool, draftId });

    expect(mockPublishPipelineState).not.toHaveBeenCalled();
  });
});
