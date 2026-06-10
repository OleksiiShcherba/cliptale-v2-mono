/**
 * Integration tests for storyboardReference.repository.ts against real MySQL 8.
 *
 * Covers T2 acceptance criteria:
 *   AC-01 — CRUD of cast extraction jobs; latest-job-for-draft query
 *   AC-03 — CRUD of reference blocks in cast order (sort_order); block creation
 *   AC-04 — Atomic window claim: two concurrent claims on same draft → exactly
 *             one winner; CAS version increment (stale → 0 affected rows)
 *
 * Covers T1 acceptance criteria (readiness reads Q1–Q3):
 *   AC-01/02/07 — getDraftReadiness: full-set blocking-block list (Q1)
 *   AC-03/03b   — getSceneReadiness: scene-scoped blocking-block list (Q2)
 *   AC-04b      — getReferencelessScenes: scenes with no linked reference (Q3)
 *
 * Prerequisites: Docker Compose `db` service must be running.
 * Run:
 *   cd apps/api && APP_DB_PASSWORD=cliptale APP_REDIS_URL=redis://localhost:6380 \
 *     npx vitest run src/repositories/storyboardReference.repository.test.ts
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
  APP_JWT_SECRET:           'srf-t2-integ-test-secret-exactly-32ch!',
  APP_DEV_AUTH_BYPASS:      'true',
});

import {
  createCastExtractionJob,
  findLatestCastExtractionJobForDraft,
  updateCastExtractionJobStatus,
  createReferenceBlock,
  listReferenceBlocksByDraftId,
  updateReferenceBlockWindowStatus,
  claimNextPendingBlock,
  casIncrementBlockVersion,
  getDraftReadiness,
  getSceneReadiness,
  getReferencelessScenes,
} from './storyboardReference.repository.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

let conn: Connection;

/** Suite-unique prefix to avoid ID collision with other parallel suites */
const PREFIX = 'srb-t2';

const USER_A = `${PREFIX}-ua-${randomUUID().slice(0, 8)}`;
const USER_B = `${PREFIX}-ub-${randomUUID().slice(0, 8)}`;

/** All draft IDs seeded by this suite — deleted in afterAll (CASCADE removes child rows) */
const trackedDraftIds: string[] = [];

/** All storyboard_cast_extraction_jobs IDs inserted by this suite */
const trackedJobIds: string[] = [];

/** All storyboard_reference_blocks IDs inserted by this suite */
const trackedBlockIds: string[] = [];

function newId(tag: string): string {
  return `${PREFIX}-${tag}-${randomUUID().slice(0, 12)}`;
}

/**
 * Minimal valid proposal_json matching data-model.md spec.
 */
const MINIMAL_PROPOSAL = JSON.stringify([
  { type: 'character', name: 'Test Character', scene_block_ids: [] },
]);

// ── Fixture helpers (data-model.md §Test fixtures) ────────────────────────────

async function seedDraft(userId: string): Promise<string> {
  const draftId = newId('draft');
  trackedDraftIds.push(draftId);
  await conn.execute(
    `INSERT INTO generation_drafts (id, user_id, prompt_doc) VALUES (?, ?, ?)`,
    [draftId, userId, JSON.stringify({ text: 'Test prompt' })],
  );
  return draftId;
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

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
  await conn.execute(
    `INSERT IGNORE INTO users (user_id, email, display_name) VALUES (?, ?, ?)`,
    [USER_B, `${USER_B}@example.test`, 'Test Creator B'],
  );
});

afterAll(async () => {
  // FK-safe order: blocks cascade to scene_links and stars; drafts cascade to blocks and jobs.
  // T1-specific: scene blocks, flow_files, flows, files cleaned before their parents.
  if (t1SceneBlockIds.length) {
    const ph = t1SceneBlockIds.map(() => '?').join(',');
    await conn.query(
      `DELETE FROM storyboard_reference_scene_links WHERE scene_block_id IN (${ph})`,
      t1SceneBlockIds,
    );
    await conn.query(
      `DELETE FROM storyboard_blocks WHERE id IN (${ph})`,
      t1SceneBlockIds,
    );
  }
  if (trackedBlockIds.length) {
    const ph = trackedBlockIds.map(() => '?').join(',');
    await conn.query(
      `DELETE FROM storyboard_reference_blocks WHERE id IN (${ph})`,
      trackedBlockIds,
    );
  }
  if (t1FlowIds.length) {
    const ph = t1FlowIds.map(() => '?').join(',');
    // flow_files CASCADE from generation_flows FK
    await conn.query(
      `DELETE FROM generation_flows WHERE flow_id IN (${ph})`,
      t1FlowIds,
    );
  }
  if (t1FileIds.length) {
    const ph = t1FileIds.map(() => '?').join(',');
    await conn.query(
      `DELETE FROM files WHERE file_id IN (${ph})`,
      t1FileIds,
    );
  }
  if (trackedJobIds.length) {
    const ph = trackedJobIds.map(() => '?').join(',');
    await conn.query(
      `DELETE FROM storyboard_cast_extraction_jobs WHERE id IN (${ph})`,
      trackedJobIds,
    );
  }
  if (trackedDraftIds.length) {
    const ph = trackedDraftIds.map(() => '?').join(',');
    await conn.query(
      `DELETE FROM generation_drafts WHERE id IN (${ph})`,
      trackedDraftIds,
    );
  }
  await conn.query(`DELETE FROM users WHERE user_id IN (?, ?)`, [USER_A, USER_B]);
  await conn.end();
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-01: Cast extraction job CRUD and latest-job query
// ─────────────────────────────────────────────────────────────────────────────

describe('storyboardReference.repository — createCastExtractionJob (AC-01)', () => {
  it('inserts a queued job row and returns the inserted id', async () => {
    const draftId = await seedDraft(USER_A);
    const jobId = newId('job');
    trackedJobIds.push(jobId);

    const result = await createCastExtractionJob({
      id: jobId,
      draftId,
      userId: USER_A,
    });

    expect(result.id).toBe(jobId);
    expect(result.draftId).toBe(draftId);
    expect(result.userId).toBe(USER_A);
    expect(result.status).toBe('queued');
    expect(result.proposalJson).toBeNull();
  });

  it('returns null for findLatestCastExtractionJobForDraft when no job exists', async () => {
    const draftId = await seedDraft(USER_A);

    const result = await findLatestCastExtractionJobForDraft({ draftId, userId: USER_A });

    expect(result).toBeNull();
  });

  it('findLatestCastExtractionJobForDraft returns the most recent job for the draft', async () => {
    const draftId = await seedDraft(USER_A);
    const job1Id = newId('job');
    const job2Id = newId('job');
    trackedJobIds.push(job1Id, job2Id);

    await createCastExtractionJob({ id: job1Id, draftId, userId: USER_A });
    // Simulate a later timestamp for job2 by explicit DB update
    await createCastExtractionJob({ id: job2Id, draftId, userId: USER_A });
    await conn.execute(
      `UPDATE storyboard_cast_extraction_jobs
          SET created_at = DATE_ADD(NOW(3), INTERVAL 1 SECOND)
        WHERE id = ?`,
      [job2Id],
    );

    const latest = await findLatestCastExtractionJobForDraft({ draftId, userId: USER_A });

    expect(latest).not.toBeNull();
    expect(latest!.id).toBe(job2Id);
  });

  it('findLatestCastExtractionJobForDraft is owner-scoped (user_id filter)', async () => {
    const draftId = await seedDraft(USER_A);
    const jobId = newId('job');
    trackedJobIds.push(jobId);
    await createCastExtractionJob({ id: jobId, draftId, userId: USER_A });

    // USER_B does not own this draft — must see null (owner scoping, AC-13 invariant)
    const result = await findLatestCastExtractionJobForDraft({ draftId, userId: USER_B });
    expect(result).toBeNull();
  });

  it('updateCastExtractionJobStatus transitions to completed and stores proposalJson', async () => {
    const draftId = await seedDraft(USER_A);
    const jobId = newId('job');
    trackedJobIds.push(jobId);
    await createCastExtractionJob({ id: jobId, draftId, userId: USER_A });

    await updateCastExtractionJobStatus({
      id: jobId,
      status: 'completed',
      proposalJson: MINIMAL_PROPOSAL,
      aggregateEstimateCredits: '0.5000',
    });

    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT status, proposal_json, aggregate_estimate_credits, completed_at
         FROM storyboard_cast_extraction_jobs
        WHERE id = ?`,
      [jobId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!['status']).toBe('completed');
    expect(rows[0]!['completed_at']).not.toBeNull();
    const stored = typeof rows[0]!['proposal_json'] === 'string'
      ? JSON.parse(rows[0]!['proposal_json'] as string)
      : rows[0]!['proposal_json'];
    expect(Array.isArray(stored)).toBe(true);
  });

  it('F4: persists and round-trips the truncated/overflow flag (AC-02)', async () => {
    const draftId = await seedDraft(USER_A);

    // Not truncated by default.
    const jobNo = newId('job');
    trackedJobIds.push(jobNo);
    await createCastExtractionJob({ id: jobNo, draftId, userId: USER_A });
    const created = await findLatestCastExtractionJobForDraft({ draftId, userId: USER_A });
    expect(created!.truncated).toBe(false);

    // Completed with truncated=true must round-trip as true.
    const jobYes = newId('job');
    trackedJobIds.push(jobYes);
    await createCastExtractionJob({ id: jobYes, draftId, userId: USER_A });
    await updateCastExtractionJobStatus({
      id: jobYes,
      status: 'completed',
      proposalJson: MINIMAL_PROPOSAL,
      truncated: true,
      aggregateEstimateCredits: '0.5000',
    });
    const latest = await findLatestCastExtractionJobForDraft({ draftId, userId: USER_A });
    expect(latest!.id).toBe(jobYes);
    expect(latest!.truncated).toBe(true);
  });

  it('updateCastExtractionJobStatus transitions to failed and stores error_message', async () => {
    const draftId = await seedDraft(USER_A);
    const jobId = newId('job');
    trackedJobIds.push(jobId);
    await createCastExtractionJob({ id: jobId, draftId, userId: USER_A });

    await updateCastExtractionJobStatus({
      id: jobId,
      status: 'failed',
      errorMessage: 'LLM provider unavailable',
    });

    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT status, error_message, failed_at FROM storyboard_cast_extraction_jobs WHERE id = ?`,
      [jobId],
    );
    expect(rows[0]!['status']).toBe('failed');
    expect(rows[0]!['error_message']).toBe('LLM provider unavailable');
    expect(rows[0]!['failed_at']).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-03: Reference block CRUD in cast order
// ─────────────────────────────────────────────────────────────────────────────

describe('storyboardReference.repository — createReferenceBlock + listReferenceBlocksByDraftId (AC-03)', () => {
  it('inserts a reference block row and returns it', async () => {
    const draftId = await seedDraft(USER_A);
    const blockId = newId('blk');
    trackedBlockIds.push(blockId);

    const result = await createReferenceBlock({
      id: blockId,
      draftId,
      castType: 'character',
      name: 'Test Character',
      sortOrder: 0,
    });

    expect(result.id).toBe(blockId);
    expect(result.draftId).toBe(draftId);
    expect(result.castType).toBe('character');
    expect(result.name).toBe('Test Character');
    expect(result.sortOrder).toBe(0);
    expect(result.windowStatus).toBeNull(); // manual block default (AC-11)
    expect(result.version).toBe(1);
  });

  it('listReferenceBlocksByDraftId returns blocks in sort_order ASC (cast order — AC-03)', async () => {
    const draftId = await seedDraft(USER_A);
    const b0 = newId('blk');
    const b1 = newId('blk');
    const b2 = newId('blk');
    trackedBlockIds.push(b0, b1, b2);

    await createReferenceBlock({ id: b2, draftId, castType: 'environment', name: 'Test Environment', sortOrder: 2 });
    await createReferenceBlock({ id: b0, draftId, castType: 'character', name: 'Test Character A', sortOrder: 0 });
    await createReferenceBlock({ id: b1, draftId, castType: 'character', name: 'Test Character B', sortOrder: 1 });

    const list = await listReferenceBlocksByDraftId({ draftId, userId: USER_A });

    expect(list).toHaveLength(3);
    expect(list[0]!.id).toBe(b0);
    expect(list[1]!.id).toBe(b1);
    expect(list[2]!.id).toBe(b2);
  });

  it('listReferenceBlocksByDraftId is draft-scoped (excludes other drafts)', async () => {
    const draftA = await seedDraft(USER_A);
    const draftB = await seedDraft(USER_A);
    const bA = newId('blk');
    const bB = newId('blk');
    trackedBlockIds.push(bA, bB);

    await createReferenceBlock({ id: bA, draftId: draftA, castType: 'character', name: 'Test Character', sortOrder: 0 });
    await createReferenceBlock({ id: bB, draftId: draftB, castType: 'character', name: 'Test Character', sortOrder: 0 });

    const list = await listReferenceBlocksByDraftId({ draftId: draftA, userId: USER_A });
    const ids = list.map((b) => b.id);
    expect(ids).toContain(bA);
    expect(ids).not.toContain(bB);
  });

  it('createReferenceBlock with window_status=pending creates a window-participant block (AC-03 rolling window)', async () => {
    const draftId = await seedDraft(USER_A);
    const blockId = newId('blk');
    trackedBlockIds.push(blockId);

    const result = await createReferenceBlock({
      id: blockId,
      draftId,
      castType: 'character',
      name: 'Test Character',
      sortOrder: 0,
      windowStatus: 'pending',
    });

    expect(result.windowStatus).toBe('pending');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-04: Atomic window claim — two concurrent claims → exactly one winner
// ─────────────────────────────────────────────────────────────────────────────

describe('storyboardReference.repository — claimNextPendingBlock (AC-04 atomic claim)', () => {
  it('claims the first pending block in sort_order and marks it running', async () => {
    const draftId = await seedDraft(USER_A);
    const b0 = newId('blk');
    const b1 = newId('blk');
    trackedBlockIds.push(b0, b1);

    await createReferenceBlock({ id: b0, draftId, castType: 'character', name: 'Test Character A', sortOrder: 0, windowStatus: 'pending' });
    await createReferenceBlock({ id: b1, draftId, castType: 'character', name: 'Test Character B', sortOrder: 1, windowStatus: 'pending' });

    const claimed = await claimNextPendingBlock({ draftId });

    expect(claimed).not.toBeNull();
    expect(claimed!.id).toBe(b0); // lowest sort_order wins
    expect(claimed!.windowStatus).toBe('running');

    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT window_status FROM storyboard_reference_blocks WHERE id = ?`,
      [b0],
    );
    expect(rows[0]!['window_status']).toBe('running');
  });

  it('returns null when there are no pending blocks for the draft', async () => {
    const draftId = await seedDraft(USER_A);
    const bDone = newId('blk');
    trackedBlockIds.push(bDone);

    await createReferenceBlock({ id: bDone, draftId, castType: 'character', name: 'Test Character', sortOrder: 0, windowStatus: 'done' });

    const claimed = await claimNextPendingBlock({ draftId });
    expect(claimed).toBeNull();
  });

  it('two concurrent claims on same draft → exactly one winner (atomic idempotent claim, AC-04)', async () => {
    const draftId = await seedDraft(USER_A);
    const blockId = newId('blk');
    trackedBlockIds.push(blockId);

    await createReferenceBlock({
      id: blockId,
      draftId,
      castType: 'character',
      name: 'Test Character',
      sortOrder: 0,
      windowStatus: 'pending',
    });

    // Fire two concurrent claim calls in the same tick — only one should claim the block
    const [r1, r2] = await Promise.all([
      claimNextPendingBlock({ draftId }),
      claimNextPendingBlock({ draftId }),
    ]);

    // Exactly one returns the claimed block; the other returns null
    const claimedCount = [r1, r2].filter((r) => r !== null).length;
    expect(claimedCount).toBe(1);

    // Verify DB shows 'running' (claimed by exactly one)
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT window_status FROM storyboard_reference_blocks WHERE id = ?`,
      [blockId],
    );
    expect(rows[0]!['window_status']).toBe('running');
  });

  it('two concurrent claims on N>1 pending blocks → two DISTINCT block ids (N-concurrent rolling window, AC-03/ADR-0003)', async () => {
    const draftId = await seedDraft(USER_A);
    const b0 = newId('blk');
    const b1 = newId('blk');
    trackedBlockIds.push(b0, b1);

    // Seed TWO pending blocks — simulates the N>1 rolling-window scenario
    await createReferenceBlock({ id: b0, draftId, castType: 'character', name: 'Test Character A', sortOrder: 0, windowStatus: 'pending' });
    await createReferenceBlock({ id: b1, draftId, castType: 'character', name: 'Test Character B', sortOrder: 1, windowStatus: 'pending' });

    // Fire two concurrent claims — each must claim a DISTINCT row
    const [r1, r2] = await Promise.all([
      claimNextPendingBlock({ draftId }),
      claimNextPendingBlock({ draftId }),
    ]);

    expect(r1).not.toBeNull();
    expect(r2).not.toBeNull();
    expect(r1!.id).not.toBe(r2!.id); // DISTINCT block ids — the core invariant

    // Both claimed blocks must be 'running' in DB
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT id, window_status FROM storyboard_reference_blocks WHERE id IN (?, ?) ORDER BY sort_order ASC`,
      [b0, b1],
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]!['window_status']).toBe('running');
    expect(rows[1]!['window_status']).toBe('running');
  });

  it('after a failed generation the next pending block can be claimed (window continues)', async () => {
    const draftId = await seedDraft(USER_A);
    const b0 = newId('blk');
    const b1 = newId('blk');
    trackedBlockIds.push(b0, b1);

    await createReferenceBlock({ id: b0, draftId, castType: 'character', name: 'Test Character A', sortOrder: 0, windowStatus: 'failed' });
    await createReferenceBlock({ id: b1, draftId, castType: 'character', name: 'Test Character B', sortOrder: 1, windowStatus: 'pending' });

    const claimed = await claimNextPendingBlock({ draftId });

    expect(claimed).not.toBeNull();
    expect(claimed!.id).toBe(b1); // b0 is failed, b1 is next pending
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-04: CAS version increment for scene-link saves
// ─────────────────────────────────────────────────────────────────────────────

describe('storyboardReference.repository — casIncrementBlockVersion (AC-04 CAS)', () => {
  it('increments version and returns affectedRows=1 when version matches', async () => {
    const draftId = await seedDraft(USER_A);
    const blockId = newId('blk');
    trackedBlockIds.push(blockId);

    await createReferenceBlock({ id: blockId, draftId, castType: 'character', name: 'Test Character', sortOrder: 0 });

    const affectedRows = await casIncrementBlockVersion({ id: blockId, draftId, currentVersion: 1 });

    expect(affectedRows).toBe(1);

    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT version FROM storyboard_reference_blocks WHERE id = ?`,
      [blockId],
    );
    expect(rows[0]!['version']).toBe(2);
  });

  it('returns affectedRows=0 (stale version → conflict) when version does not match (AC-04 CAS)', async () => {
    const draftId = await seedDraft(USER_A);
    const blockId = newId('blk');
    trackedBlockIds.push(blockId);

    await createReferenceBlock({ id: blockId, draftId, castType: 'character', name: 'Test Character', sortOrder: 0 });

    // Simulate stale: present version 0 when DB has version 1
    const affectedRows = await casIncrementBlockVersion({ id: blockId, draftId, currentVersion: 0 });

    expect(affectedRows).toBe(0);

    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT version FROM storyboard_reference_blocks WHERE id = ?`,
      [blockId],
    );
    // Version must remain 1 — stale save never overwrites
    expect(rows[0]!['version']).toBe(1);
  });

  it('sequential CAS saves keep incrementing version monotonically', async () => {
    const draftId = await seedDraft(USER_A);
    const blockId = newId('blk');
    trackedBlockIds.push(blockId);

    await createReferenceBlock({ id: blockId, draftId, castType: 'character', name: 'Test Character', sortOrder: 0 });

    const r1 = await casIncrementBlockVersion({ id: blockId, draftId, currentVersion: 1 });
    expect(r1).toBe(1);

    const r2 = await casIncrementBlockVersion({ id: blockId, draftId, currentVersion: 2 });
    expect(r2).toBe(1);

    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT version FROM storyboard_reference_blocks WHERE id = ?`,
      [blockId],
    );
    expect(rows[0]!['version']).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-04: updateReferenceBlockWindowStatus (status transitions)
// ─────────────────────────────────────────────────────────────────────────────

describe('storyboardReference.repository — updateReferenceBlockWindowStatus (AC-04)', () => {
  it('transitions window_status from running to done and returns affectedRows=1', async () => {
    const draftId = await seedDraft(USER_A);
    const blockId = newId('blk');
    trackedBlockIds.push(blockId);

    await createReferenceBlock({ id: blockId, draftId, castType: 'character', name: 'Test Character', sortOrder: 0, windowStatus: 'running' });

    const affected = await updateReferenceBlockWindowStatus({ id: blockId, draftId, windowStatus: 'done' });

    expect(affected).toBe(1);

    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT window_status FROM storyboard_reference_blocks WHERE id = ?`,
      [blockId],
    );
    expect(rows[0]!['window_status']).toBe('done');
  });

  it('transitions window_status to failed and stores error_message (AC-04 per-block failed status)', async () => {
    const draftId = await seedDraft(USER_A);
    const blockId = newId('blk');
    trackedBlockIds.push(blockId);

    await createReferenceBlock({ id: blockId, draftId, castType: 'character', name: 'Test Character', sortOrder: 0, windowStatus: 'running' });

    const affected = await updateReferenceBlockWindowStatus({
      id: blockId,
      draftId,
      windowStatus: 'failed',
      errorMessage: 'Image generation timed out',
    });

    expect(affected).toBe(1);

    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT window_status, error_message FROM storyboard_reference_blocks WHERE id = ?`,
      [blockId],
    );
    expect(rows[0]!['window_status']).toBe('failed');
    expect(rows[0]!['error_message']).toBe('Image generation timed out');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T1: Readiness reads — Q1 getDraftReadiness, Q2 getSceneReadiness, Q3 getReferencelessScenes
//
// data-model.md §Readiness-predicate:
//   ready ⟺ flow_id IS NOT NULL  AND  ≥1 flow_files row (deleted_at IS NULL)
//
// Block state matrix (DoD):
//   A: manual / no-flow state          → flow_id = NULL             → NOT ready
//   B: running / no output yet         → flow_id set, 0 flow_files  → NOT ready (AC-07)
//   C: done / has completed output     → flow_id set, flow_files ✓  → ready
//   D: output exists but file deleted  → flow_id set, flow_files all deleted_at → NOT ready
// ─────────────────────────────────────────────────────────────────────────────

/**
 * T1 seed helpers — scoped to this suite via the shared PREFIX/trackedDraftIds registries
 * and their own tracked-ID registries for FK-safe cleanup in afterAll.
 */
const T1_PREFIX = 'srb-t1';

/** Tracked IDs for T1-specific rows (cleaned up after the suite in afterAll via CASCADE) */
const t1FlowIds: string[]        = [];
const t1FileIds: string[]        = [];
const t1SceneBlockIds: string[]  = [];

function t1Id(tag: string): string {
  return `${T1_PREFIX}-${tag}-${randomUUID().slice(0, 12)}`;
}

/**
 * Seed a minimal generation_flows row so a reference block can point its flow_id at it.
 * Returns the flow_id.
 */
async function seedFlow(userId: string): Promise<string> {
  const flowId = t1Id('flow');
  t1FlowIds.push(flowId);
  await conn.execute(
    `INSERT INTO generation_flows (flow_id, user_id, title, canvas)
     VALUES (?, ?, 'Test Reference Flow', '{}')`,
    [flowId, userId],
  );
  return flowId;
}

/**
 * Seed a minimal files row (status='ready', kind='image').
 * Returns the file_id.
 */
async function seedFileT1(userId: string): Promise<string> {
  const fileId = t1Id('file');
  t1FileIds.push(fileId);
  await conn.execute(
    `INSERT INTO files
       (file_id, user_id, kind, storage_uri, mime_type, display_name, status)
     VALUES (?, ?, 'image', ?, 'image/png', 'ref-output.png', 'ready')`,
    [fileId, userId, `s3://test-bucket/${fileId}.png`],
  );
  return fileId;
}

/**
 * Link a file to a flow via flow_files (= "completed output exists").
 * Pass deleted: true to simulate a soft-deleted (unusable) output.
 */
async function seedFlowFile(flowId: string, fileId: string, deleted = false): Promise<void> {
  if (deleted) {
    await conn.execute(
      `INSERT INTO flow_files (flow_id, file_id, deleted_at) VALUES (?, ?, NOW(3))`,
      [flowId, fileId],
    );
  } else {
    await conn.execute(
      `INSERT INTO flow_files (flow_id, file_id) VALUES (?, ?)`,
      [flowId, fileId],
    );
  }
}

/**
 * Seed a storyboard_blocks scene row for a draft.
 * Returns the scene block id.
 */
async function seedSceneBlockT1(draftId: string): Promise<string> {
  const id = t1Id('scene');
  t1SceneBlockIds.push(id);
  await conn.execute(
    `INSERT INTO storyboard_blocks
       (id, draft_id, block_type, name, prompt, duration_s,
        position_x, position_y, sort_order, style)
     VALUES (?, ?, 'scene', 'T1 Test Scene', 'A scene.', 5, 0, 0, 0, NULL)`,
    [id, draftId],
  );
  return id;
}

/**
 * Link a reference block to a scene block.
 */
async function seedSceneLinkT1(referenceBlockId: string, sceneBlockId: string): Promise<void> {
  await conn.execute(
    `INSERT INTO storyboard_reference_scene_links
       (reference_block_id, scene_block_id)
     VALUES (?, ?)`,
    [referenceBlockId, sceneBlockId],
  );
}

// ─── Q1: getDraftReadiness ────────────────────────────────────────────────────

describe('storyboardReference.repository — getDraftReadiness / Q1 (T1: AC-01/02/07)', () => {
  it('Q1/A — manual block (flow_id=NULL) is not ready and appears in blocking list', async () => {
    // Block state A: no-flow state — cannot be ready regardless of window_status
    const draftId = await seedDraft(USER_A);
    const blockId = newId('blk');
    trackedBlockIds.push(blockId);

    // Manual block: flow_id stays NULL (default); window_status stays NULL
    await createReferenceBlock({
      id: blockId,
      draftId,
      castType: 'character',
      name: 'Manual No-Flow Block',
      sortOrder: 0,
    });

    const result = await getDraftReadiness({ draftId });

    expect(result.isReady).toBe(false);
    const blockingIds = result.blockingBlocks.map((b: { id: string }) => b.id);
    expect(blockingIds).toContain(blockId);
  });

  it('Q1/B — running block with no persisted output is not ready (AC-07)', async () => {
    // Block state B: flow linked, rolling window running, but no flow_files row yet
    const draftId = await seedDraft(USER_A);
    const flowId  = await seedFlow(USER_A);
    const blockId = newId('blk');
    trackedBlockIds.push(blockId);

    await createReferenceBlock({
      id: blockId,
      draftId,
      castType: 'environment',
      name: 'Running No-Output Block',
      sortOrder: 0,
      windowStatus: 'running',
    });
    // Wire the flow_id after insert (createReferenceBlock doesn't accept flowId directly)
    await conn.execute(
      `UPDATE storyboard_reference_blocks SET flow_id = ? WHERE id = ?`,
      [flowId, blockId],
    );

    const result = await getDraftReadiness({ draftId });

    expect(result.isReady).toBe(false);
    const blockingIds = result.blockingBlocks.map((b: { id: string }) => b.id);
    expect(blockingIds).toContain(blockId);
  });

  it('Q1/C — done block with completed output is ready; returns empty blocking list', async () => {
    // Block state C: flow linked, flow_files row present (deleted_at=NULL) → ready
    const draftId = await seedDraft(USER_A);
    const flowId  = await seedFlow(USER_A);
    const fileId  = await seedFileT1(USER_A);
    const blockId = newId('blk');
    trackedBlockIds.push(blockId);

    await createReferenceBlock({
      id: blockId,
      draftId,
      castType: 'character',
      name: 'Done With Output',
      sortOrder: 0,
      windowStatus: 'done',
    });
    await conn.execute(
      `UPDATE storyboard_reference_blocks SET flow_id = ? WHERE id = ?`,
      [flowId, blockId],
    );
    await seedFlowFile(flowId, fileId, false /* not deleted */);

    const result = await getDraftReadiness({ draftId });

    expect(result.isReady).toBe(true);
    expect(result.blockingBlocks).toHaveLength(0);
  });

  it('Q1/D — block with only a soft-deleted output is not ready', async () => {
    // Block state D: flow linked, but all flow_files rows have deleted_at set → not ready
    const draftId = await seedDraft(USER_A);
    const flowId  = await seedFlow(USER_A);
    const fileId  = await seedFileT1(USER_A);
    const blockId = newId('blk');
    trackedBlockIds.push(blockId);

    await createReferenceBlock({
      id: blockId,
      draftId,
      castType: 'character',
      name: 'Deleted Output Block',
      sortOrder: 0,
      windowStatus: 'done',
    });
    await conn.execute(
      `UPDATE storyboard_reference_blocks SET flow_id = ? WHERE id = ?`,
      [flowId, blockId],
    );
    await seedFlowFile(flowId, fileId, true /* soft-deleted */);

    const result = await getDraftReadiness({ draftId });

    expect(result.isReady).toBe(false);
    const blockingIds = result.blockingBlocks.map((b: { id: string }) => b.id);
    expect(blockingIds).toContain(blockId);
  });

  it('Q1 — mixed draft: ready block + not-ready block → not ready, only not-ready in list', async () => {
    // One ready block (C) + one manual not-ready block (A): draft is not ready;
    // only the manual block should appear in the blocking list.
    const draftId  = await seedDraft(USER_A);
    const flowId   = await seedFlow(USER_A);
    const fileId   = await seedFileT1(USER_A);
    const readyId  = newId('blk');
    const blockedId = newId('blk');
    trackedBlockIds.push(readyId, blockedId);

    // Ready block (state C)
    await createReferenceBlock({ id: readyId, draftId, castType: 'character', name: 'Ready Block', sortOrder: 0, windowStatus: 'done' });
    await conn.execute(`UPDATE storyboard_reference_blocks SET flow_id = ? WHERE id = ?`, [flowId, readyId]);
    await seedFlowFile(flowId, fileId, false);

    // Not-ready block (state A)
    await createReferenceBlock({ id: blockedId, draftId, castType: 'environment', name: 'Manual Block', sortOrder: 1 });

    const result = await getDraftReadiness({ draftId });

    expect(result.isReady).toBe(false);
    const blockingIds = result.blockingBlocks.map((b: { id: string }) => b.id);
    expect(blockingIds).toContain(blockedId);
    expect(blockingIds).not.toContain(readyId);
  });

  it('Q1 — draft with zero reference blocks is considered ready (AC-04)', async () => {
    const draftId = await seedDraft(USER_A);

    const result = await getDraftReadiness({ draftId });

    expect(result.isReady).toBe(true);
    expect(result.blockingBlocks).toHaveLength(0);
  });
});

// ─── Q2: getSceneReadiness ────────────────────────────────────────────────────

describe('storyboardReference.repository — getSceneReadiness / Q2 (T1: AC-03/03b)', () => {
  it('Q2 — returns not-ready only for blocks linked to the queried scene (AC-03b)', async () => {
    // Unlinked not-ready block must NOT appear; only the linked not-ready block should.
    const draftId       = await seedDraft(USER_A);
    const sceneId       = await seedSceneBlockT1(draftId);
    const linkedBlockId = newId('blk');
    const otherBlockId  = newId('blk');
    trackedBlockIds.push(linkedBlockId, otherBlockId);

    // linked block — state A (not ready)
    await createReferenceBlock({ id: linkedBlockId, draftId, castType: 'character', name: 'Linked Manual', sortOrder: 0 });
    await seedSceneLinkT1(linkedBlockId, sceneId);

    // unlinked block — also not ready, but unlinked to sceneId
    await createReferenceBlock({ id: otherBlockId, draftId, castType: 'environment', name: 'Unlinked Manual', sortOrder: 1 });

    const result = await getSceneReadiness({ sceneBlockId: sceneId, draftId });

    expect(result.isReady).toBe(false);
    const blockingIds = result.blockingBlocks.map((b: { id: string }) => b.id);
    expect(blockingIds).toContain(linkedBlockId);
    expect(blockingIds).not.toContain(otherBlockId);
  });

  it('Q2 — scene with all linked blocks ready returns isReady=true (AC-03)', async () => {
    const draftId = await seedDraft(USER_A);
    const sceneId = await seedSceneBlockT1(draftId);
    const flowId  = await seedFlow(USER_A);
    const fileId  = await seedFileT1(USER_A);
    const blockId = newId('blk');
    trackedBlockIds.push(blockId);

    await createReferenceBlock({ id: blockId, draftId, castType: 'character', name: 'Ready Linked', sortOrder: 0, windowStatus: 'done' });
    await conn.execute(`UPDATE storyboard_reference_blocks SET flow_id = ? WHERE id = ?`, [flowId, blockId]);
    await seedFlowFile(flowId, fileId, false);
    await seedSceneLinkT1(blockId, sceneId);

    const result = await getSceneReadiness({ sceneBlockId: sceneId, draftId });

    expect(result.isReady).toBe(true);
    expect(result.blockingBlocks).toHaveLength(0);
  });

  it('Q2 — scene with no linked blocks is ready (no links = no gate, AC-04)', async () => {
    const draftId = await seedDraft(USER_A);
    const sceneId = await seedSceneBlockT1(draftId);

    const result = await getSceneReadiness({ sceneBlockId: sceneId, draftId });

    expect(result.isReady).toBe(true);
    expect(result.blockingBlocks).toHaveLength(0);
  });

  it('Q2/B — running-no-output block linked to scene is not ready (AC-07 per-scene scope)', async () => {
    const draftId = await seedDraft(USER_A);
    const sceneId = await seedSceneBlockT1(draftId);
    const flowId  = await seedFlow(USER_A);
    const blockId = newId('blk');
    trackedBlockIds.push(blockId);

    await createReferenceBlock({ id: blockId, draftId, castType: 'character', name: 'Running Linked', sortOrder: 0, windowStatus: 'running' });
    await conn.execute(`UPDATE storyboard_reference_blocks SET flow_id = ? WHERE id = ?`, [flowId, blockId]);
    // No flow_files row → output-existence predicate fails
    await seedSceneLinkT1(blockId, sceneId);

    const result = await getSceneReadiness({ sceneBlockId: sceneId, draftId });

    expect(result.isReady).toBe(false);
    const blockingIds = result.blockingBlocks.map((b: { id: string }) => b.id);
    expect(blockingIds).toContain(blockId);
  });
});

// ─── Q3: getReferencelessScenes ──────────────────────────────────────────────

describe('storyboardReference.repository — getReferencelessScenes / Q3 (T1: AC-04b)', () => {
  it('Q3 — scene with no linked reference block is returned', async () => {
    const draftId       = await seedDraft(USER_A);
    const linkedSceneId = await seedSceneBlockT1(draftId);
    const freeSceneId   = await seedSceneBlockT1(draftId);
    const blockId       = newId('blk');
    trackedBlockIds.push(blockId);

    // Block linked to linkedSceneId; freeSceneId has no link
    await createReferenceBlock({ id: blockId, draftId, castType: 'character', name: 'Linked Block', sortOrder: 0 });
    await seedSceneLinkT1(blockId, linkedSceneId);

    const result = await getReferencelessScenes({ draftId });

    const ids = result.map((s: { id: string }) => s.id);
    expect(ids).toContain(freeSceneId);
    expect(ids).not.toContain(linkedSceneId);
  });

  it('Q3 — draft where every scene has a linked reference block returns empty list', async () => {
    const draftId = await seedDraft(USER_A);
    const sceneId = await seedSceneBlockT1(draftId);
    const blockId = newId('blk');
    trackedBlockIds.push(blockId);

    await createReferenceBlock({ id: blockId, draftId, castType: 'character', name: 'Linked Block', sortOrder: 0 });
    await seedSceneLinkT1(blockId, sceneId);

    const result = await getReferencelessScenes({ draftId });

    expect(result).toHaveLength(0);
  });

  it('Q3 — draft with zero reference blocks returns all scenes as reference-less (AC-04b pre-condition)', async () => {
    // When a draft has zero reference blocks, technically every scene is "reference-less",
    // but AC-04b applies only when the draft has ≥1 reference block.
    // The query itself returns the scene ids regardless — caller decides what to do with them.
    const draftId = await seedDraft(USER_A);
    const s1      = await seedSceneBlockT1(draftId);
    const s2      = await seedSceneBlockT1(draftId);

    const result = await getReferencelessScenes({ draftId });

    const ids = result.map((s: { id: string }) => s.id);
    expect(ids).toContain(s1);
    expect(ids).toContain(s2);
  });

  it('Q3 — only scene-type blocks are considered (start/end sentinels excluded)', async () => {
    // The query must filter block_type = 'scene' — start/end rows must not appear.
    const draftId = await seedDraft(USER_A);
    // seed a real scene block (no link)
    const sceneId = await seedSceneBlockT1(draftId);
    // seed a start sentinel directly via SQL (not using the scene helper)
    const startId = t1Id('start');
    t1SceneBlockIds.push(startId);
    await conn.execute(
      `INSERT INTO storyboard_blocks
         (id, draft_id, block_type, name, prompt, duration_s, position_x, position_y, sort_order)
       VALUES (?, ?, 'start', 'START', NULL, 5, 0, 0, -1)`,
      [startId, draftId],
    );

    const result = await getReferencelessScenes({ draftId });

    const ids = result.map((s: { id: string }) => s.id);
    expect(ids).toContain(sceneId);
    expect(ids).not.toContain(startId);
  });
});
