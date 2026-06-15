/**
 * T11 — Reaper repeatable job: release stuck phases.
 *
 * Integration test (real MySQL). The reaper sweeps for over-bound running phases
 * (active_run_phase IS NOT NULL AND heartbeat_at < NOW(3) - INTERVAL ? MINUTE)
 * and, for each, sets <phase>_status='failed', error_message, active_run_phase=NULL,
 * version=version+1, under a version CAS (ADR-0005, ADR-0007, AC-12).
 *
 * ACs covered:
 *   AC-12 — a running phase past its time bound is marked failed, active_run_phase
 *            cleared, error_message set, version bumped; a fresh (in-bound) running
 *            phase is left untouched; a concurrent version bump is not clobbered (CAS).
 *
 * Run from apps/media-worker:
 *   APP_DB_PASSWORD=cliptale APP_REDIS_URL=redis://localhost:6380 \
 *     npx vitest run src/jobs/storyboardPipelineReaper.integration.test.ts
 */
import { randomUUID } from 'node:crypto';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.mock('@/lib/realtime.js', () => ({
  publishReferenceBlockStatus: vi.fn().mockResolvedValue(undefined),
  publishStoryboardPlanStatus: vi.fn().mockResolvedValue(undefined),
  publishCastExtractionStatus: vi.fn().mockResolvedValue(undefined),
}));

import { pool } from '@/lib/db.js';
import {
  releaseStuckPhase,
  runStoryboardPipelineReaper,
} from '@/jobs/storyboardPipelineReaper.job.js';

const PREFIX = 'sgp-t11';

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
  /** Supply 'STUCK' to set heartbeat_at to NOW(3) - INTERVAL 15 MINUTE; else fresh. */
  heartbeatAge: 'STUCK' | 'FRESH';
}): Promise<void> {
  const heartbeatExpr =
    params.heartbeatAge === 'STUCK'
      ? "(NOW(3) - INTERVAL 15 MINUTE)"
      : 'NOW(3)';
  await pool.execute(
    `INSERT INTO storyboard_pipeline
       (draft_id, active_phase, scene_status, reference_data_status,
        reference_image_status, scene_image_status, active_run_phase, version,
        heartbeat_at, phase_started_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ${heartbeatExpr}, NOW(3))`,
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
  error_message: string | null;
  version: number;
};

async function readPipeline(draftId: string): Promise<PipelineRow> {
  const [rows] = await pool.execute<PipelineRow[]>(
    `SELECT active_phase, scene_status, reference_data_status, reference_image_status,
            scene_image_status, active_run_phase, error_message, version
       FROM storyboard_pipeline WHERE draft_id = ?`,
    [draftId],
  );
  return rows[0]!;
}

beforeAll(async () => {
  ctx.userId = randomUUID();
  await pool.execute(
    `INSERT INTO users (user_id, email, display_name, email_verified)
     VALUES (?, ?, ?, 1)`,
    [ctx.userId, `${PREFIX}-${ctx.userId}@example.test`, 'T11 Tester'],
  );
});

afterAll(async () => {
  for (const draftId of ctx.draftIds) {
    await pool.execute(`DELETE FROM storyboard_pipeline WHERE draft_id = ?`, [draftId]);
    await pool.execute(`DELETE FROM generation_drafts WHERE id = ?`, [draftId]);
  }
  await pool.execute(`DELETE FROM users WHERE user_id = ?`, [ctx.userId]);
  await pool.end();
});

describe('T11 — reaper releases over-bound running phases (AC-12)', () => {
  // ── AC-12(a): stuck phase is marked failed, active_run_phase cleared, version bumped ─
  it('AC-12(a): marks the stuck running phase failed, clears active_run_phase, sets error_message, bumps version', async () => {
    const draftId = await seedDraft();
    await seedPipeline({
      draftId,
      activePhase: 'scene',
      sceneStatus: 'running',
      referenceDataStatus: 'idle',
      referenceImageStatus: 'idle',
      sceneImageStatus: 'idle',
      activeRunPhase: 'scene',
      version: 3,
      heartbeatAge: 'STUCK', // 15 min old — well past the 10-min bound
    });

    const released = await runStoryboardPipelineReaper({ pool, boundMinutes: 10 });

    expect(released).toBeGreaterThanOrEqual(1);

    const row = await readPipeline(draftId);
    expect(row.scene_status).toBe('failed');
    expect(row.active_run_phase).toBeNull();
    expect(row.error_message).toBeTruthy();
    expect(row.version).toBe(4); // bumped exactly once
  });

  // ── AC-12(b): fresh running row is NOT released ───────────────────────────────────
  it('AC-12(b): does NOT release a fresh in-bound running phase', async () => {
    const draftId = await seedDraft();
    await seedPipeline({
      draftId,
      activePhase: 'reference_image',
      sceneStatus: 'completed',
      referenceDataStatus: 'completed',
      referenceImageStatus: 'running',
      sceneImageStatus: 'idle',
      activeRunPhase: 'reference_image',
      version: 7,
      heartbeatAge: 'FRESH', // heartbeat just now — within bound
    });

    await runStoryboardPipelineReaper({ pool, boundMinutes: 10 });

    const row = await readPipeline(draftId);
    expect(row.reference_image_status).toBe('running'); // unchanged
    expect(row.active_run_phase).toBe('reference_image'); // unchanged
    expect(row.version).toBe(7); // no CAS applied
  });

  // ── AC-12(c): CAS — a stale version loses the race and is not double-applied ──────
  it('AC-12(c): version CAS prevents clobbering a concurrent advance (stale version no-ops)', async () => {
    const draftId = await seedDraft();
    await seedPipeline({
      draftId,
      activePhase: 'reference_data',
      sceneStatus: 'completed',
      referenceDataStatus: 'running',
      referenceImageStatus: 'idle',
      sceneImageStatus: 'idle',
      activeRunPhase: 'reference_data',
      version: 5,
      heartbeatAge: 'STUCK',
    });

    // Simulate a concurrent transition that bumped the version BEFORE the reaper's
    // CAS write: update the row to version 6 (a different status, still running).
    // The reaper read the stale version=5, but by the time it writes, the row is at 6.
    // We simulate this by bumping the version directly:
    await pool.execute(
      `UPDATE storyboard_pipeline SET version = 6 WHERE draft_id = ?`,
      [draftId],
    );

    // Reaper must be given the stale version externally — we test this by calling
    // the low-level CAS path. Because runStoryboardPipelineReaper re-reads the DB
    // to get current rows (it will see version=6 post-bump), the CAS applies to
    // version=6. To test the actual stale-version scenario we verify the atomic
    // property: the function reads, CAS-writes using what it reads, and returns
    // count=1 (it processed the stuck row at version 6). The no-clobber invariant
    // holds because WHERE version=? guards the write.
    //
    // Preferred: call reaper once and verify idempotency on a second call.
    const firstRun = await runStoryboardPipelineReaper({ pool, boundMinutes: 10 });
    expect(firstRun).toBeGreaterThanOrEqual(1);
    const afterFirst = await readPipeline(draftId);
    expect(afterFirst.reference_data_status).toBe('failed');
    expect(afterFirst.version).toBe(7); // bumped from 6

    // Second run: the row is no longer stuck (active_run_phase is NULL) — must no-op.
    const secondRun = await runStoryboardPipelineReaper({ pool, boundMinutes: 10 });
    const afterSecond = await readPipeline(draftId);
    expect(afterSecond.version).toBe(7); // unchanged — idempotent
    // secondRun may include other drafts but not this one
    void secondRun; // suppress lint
  });

  // ── Review fix MIN-3: releaseStuckPhase CAS directly — a stale version writes 0 rows ──
  it('AC-12(c) direct: releaseStuckPhase with a STALE version affects 0 rows (no clobber)', async () => {
    const draftId = await seedDraft();
    await seedPipeline({
      draftId,
      activePhase: 'reference_image',
      sceneStatus: 'completed',
      referenceDataStatus: 'completed',
      referenceImageStatus: 'running',
      sceneImageStatus: 'idle',
      activeRunPhase: 'reference_image',
      version: 10,
      heartbeatAge: 'STUCK',
    });

    // A concurrent advance bumped the row to version 11 AFTER the reaper read v10.
    await pool.execute(
      `UPDATE storyboard_pipeline SET version = 11 WHERE draft_id = ?`,
      [draftId],
    );

    // The reaper writes with the STALE version it read (10) → CAS must miss.
    const affected = await releaseStuckPhase(pool, draftId, 'reference_image', 10);
    expect(affected).toBe(0); // no clobber

    const row = await readPipeline(draftId);
    expect(row.reference_image_status).toBe('running'); // untouched by the stale write
    expect(row.version).toBe(11); // concurrent advance preserved

    // A write with the CURRENT version (11) applies exactly once.
    const affectedFresh = await releaseStuckPhase(pool, draftId, 'reference_image', 11);
    expect(affectedFresh).toBe(1);
    const after = await readPipeline(draftId);
    expect(after.reference_image_status).toBe('failed');
    expect(after.version).toBe(12);
  });
});
