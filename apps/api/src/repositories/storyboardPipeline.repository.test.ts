/**
 * Integration tests for storyboardPipeline.repository.ts against real MySQL 8.
 *
 * Covers T3 (the storyboard_pipeline state row):
 *   AC-05 — read the one state row by draft_id (resume read)
 *   AC-14 — claim a run via the active_run_phase CAS; double-claim / stale version → 0 rows
 *   AC-12 — the over-bound stuck-phase age query (reaper / lazy-on-read source)
 *
 * Prerequisites: Docker Compose `db` service must be running (real MySQL, migration 057 applied).
 * Run:
 *   cd apps/api && APP_DB_PASSWORD=cliptale APP_REDIS_URL=redis://localhost:6380 \
 *     npx vitest run src/repositories/storyboardPipeline.repository.test.ts
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
  APP_REDIS_URL:            process.env['APP_REDIS_URL']            ?? 'redis://localhost:6380',
  APP_S3_BUCKET:            process.env['APP_S3_BUCKET']            ?? 'test-bucket',
  APP_S3_REGION:            process.env['APP_S3_REGION']            ?? 'us-east-1',
  APP_S3_ACCESS_KEY_ID:     process.env['APP_S3_ACCESS_KEY_ID']     ?? 'test-access-key-id',
  APP_S3_SECRET_ACCESS_KEY: process.env['APP_S3_SECRET_ACCESS_KEY'] ?? 'test-secret-key-value',
  APP_JWT_SECRET:           'sgp-t3-integ-test-secret-exactly-32ch!',
  APP_DEV_AUTH_BYPASS:      'true',
});

import {
  getPipelineByDraftId,
  insertPipelineRow,
  claimRun,
  casUpdateState,
  recordHeartbeat,
  findStuckPhases,
} from './storyboardPipeline.repository.js';

let conn: Connection;

const PREFIX = 'sgp-t3';
const USER_A = `${PREFIX}-ua-${randomUUID().slice(0, 8)}`;
const trackedDraftIds: string[] = [];

function newId(tag: string): string {
  return `${PREFIX}-${tag}-${randomUUID().slice(0, 12)}`;
}

async function seedDraft(userId: string): Promise<string> {
  const draftId = newId('draft');
  trackedDraftIds.push(draftId);
  await conn.execute(
    `INSERT INTO generation_drafts (id, user_id, prompt_doc) VALUES (?, ?, ?)`,
    [draftId, userId, JSON.stringify({ text: 'Test prompt' })],
  );
  return draftId;
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
  if (trackedDraftIds.length) {
    const ph = trackedDraftIds.map(() => '?').join(',');
    // storyboard_pipeline cascades on draft delete; delete drafts explicitly.
    await conn.query(`DELETE FROM storyboard_pipeline WHERE draft_id IN (${ph})`, trackedDraftIds);
    await conn.query(`DELETE FROM generation_drafts WHERE id IN (${ph})`, trackedDraftIds);
  }
  await conn.query(`DELETE FROM users WHERE user_id = ?`, [USER_A]);
  await conn.end();
  const { pool } = await import('@/db/connection.js');
  await pool.end();
});

describe('insert + read the pipeline row (AC-05)', () => {
  it('inserts a fresh row with the column defaults and reads it back by draft_id', async () => {
    const draftId = await seedDraft(USER_A);
    await insertPipelineRow({ draftId });

    const row = await getPipelineByDraftId(draftId);
    expect(row).not.toBeNull();
    expect(row!.draftId).toBe(draftId);
    expect(row!.activePhase).toBe('scene');
    expect(row!.sceneStatus).toBe('idle');
    expect(row!.referenceDataStatus).toBe('idle');
    expect(row!.referenceImageStatus).toBe('idle');
    expect(row!.sceneImageStatus).toBe('idle');
    expect(row!.activeRunPhase).toBeNull();
    expect(row!.version).toBe(1);
  });

  it('returns null for a draft that has no pipeline row', async () => {
    const draftId = await seedDraft(USER_A);
    expect(await getPipelineByDraftId(draftId)).toBeNull();
  });
});

describe('claimRun — active_run_phase CAS (AC-14)', () => {
  it('claims a run when none is in flight: sets the marker, runs the phase, bumps version', async () => {
    const draftId = await seedDraft(USER_A);
    await insertPipelineRow({ draftId });

    const affected = await claimRun({ draftId, phase: 'reference_image', currentVersion: 1 });
    expect(affected).toBe(1);

    const row = await getPipelineByDraftId(draftId);
    expect(row!.activeRunPhase).toBe('reference_image');
    expect(row!.referenceImageStatus).toBe('running');
    expect(row!.activePhase).toBe('reference_image');
    expect(row!.version).toBe(2);
    expect(row!.phaseStartedAt).not.toBeNull();
    expect(row!.heartbeatAt).not.toBeNull();
  });

  it('does not start a second run while one is in flight (idempotency guard)', async () => {
    const draftId = await seedDraft(USER_A);
    await insertPipelineRow({ draftId });

    expect(await claimRun({ draftId, phase: 'reference_image', currentVersion: 1 })).toBe(1);
    // a second claim — the marker is no longer NULL → 0 rows affected
    const second = await claimRun({ draftId, phase: 'scene_image', currentVersion: 2 });
    expect(second).toBe(0);

    const row = await getPipelineByDraftId(draftId);
    expect(row!.activeRunPhase).toBe('reference_image');
    expect(row!.version).toBe(2);
  });

  it('loses the CAS on a stale version (concurrent transition already bumped it)', async () => {
    const draftId = await seedDraft(USER_A);
    await insertPipelineRow({ draftId });
    // claim with a version that does not match the row (still 1) → 0 rows
    expect(await claimRun({ draftId, phase: 'scene', currentVersion: 99 })).toBe(0);
  });
});

describe('casUpdateState — transition write with version CAS', () => {
  it('advances a phase sub-state, clears the run marker, and bumps version', async () => {
    const draftId = await seedDraft(USER_A);
    await insertPipelineRow({ draftId });
    await claimRun({ draftId, phase: 'scene', currentVersion: 1 }); // version → 2, scene running

    const affected = await casUpdateState({
      draftId,
      currentVersion: 2,
      phase: 'scene',
      status: 'completed',
      activeRunPhase: null,
    });
    expect(affected).toBe(1);

    const row = await getPipelineByDraftId(draftId);
    expect(row!.sceneStatus).toBe('completed');
    expect(row!.activeRunPhase).toBeNull();
    expect(row!.version).toBe(3);
  });

  it('returns 0 on a stale version and leaves the row untouched', async () => {
    const draftId = await seedDraft(USER_A);
    await insertPipelineRow({ draftId });
    const affected = await casUpdateState({
      draftId,
      currentVersion: 42,
      phase: 'scene',
      status: 'failed',
    });
    expect(affected).toBe(0);
    const row = await getPipelineByDraftId(draftId);
    expect(row!.sceneStatus).toBe('idle');
    expect(row!.version).toBe(1);
  });
});

describe('recordHeartbeat', () => {
  it('refreshes heartbeat_at for the phase holding the active run', async () => {
    const draftId = await seedDraft(USER_A);
    await insertPipelineRow({ draftId });
    await claimRun({ draftId, phase: 'reference_image', currentVersion: 1 });
    // backdate the heartbeat so the refresh is observable
    await conn.execute(
      `UPDATE storyboard_pipeline SET heartbeat_at = (NOW(3) - INTERVAL 5 MINUTE) WHERE draft_id = ?`,
      [draftId],
    );
    const before = (await getPipelineByDraftId(draftId))!.heartbeatAt!;

    const affected = await recordHeartbeat({ draftId, phase: 'reference_image' });
    expect(affected).toBe(1);

    const after = (await getPipelineByDraftId(draftId))!.heartbeatAt!;
    expect(after.getTime()).toBeGreaterThan(before.getTime());
  });
});

describe('findStuckPhases — over-bound age query (AC-12)', () => {
  it('returns running rows whose heartbeat is past the bound and excludes fresh ones', async () => {
    const stuckDraft = await seedDraft(USER_A);
    const freshDraft = await seedDraft(USER_A);
    await insertPipelineRow({ draftId: stuckDraft });
    await insertPipelineRow({ draftId: freshDraft });
    await claimRun({ draftId: stuckDraft, phase: 'reference_image', currentVersion: 1 });
    await claimRun({ draftId: freshDraft, phase: 'reference_image', currentVersion: 1 });
    // age the stuck draft's heartbeat past the 10-min bound
    await conn.execute(
      `UPDATE storyboard_pipeline SET heartbeat_at = (NOW(3) - INTERVAL 15 MINUTE) WHERE draft_id = ?`,
      [stuckDraft],
    );

    const stuck = await findStuckPhases({ boundMinutes: 10 });
    const ids = stuck.map((r) => r.draftId);
    expect(ids).toContain(stuckDraft);
    expect(ids).not.toContain(freshDraft);
    const stuckRow = stuck.find((r) => r.draftId === stuckDraft)!;
    expect(stuckRow.activeRunPhase).toBe('reference_image');
  });
});
