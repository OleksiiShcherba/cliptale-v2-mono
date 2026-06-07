/**
 * Integration tests for storyboardReference.repository.ts against real MySQL 8.
 *
 * Covers T2 acceptance criteria:
 *   AC-01 — CRUD of cast extraction jobs; latest-job-for-draft query
 *   AC-03 — CRUD of reference blocks in cast order (sort_order); block creation
 *   AC-04 — Atomic window claim: two concurrent claims on same draft → exactly
 *             one winner; CAS version increment (stale → 0 affected rows)
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
  if (trackedBlockIds.length) {
    const ph = trackedBlockIds.map(() => '?').join(',');
    await conn.query(
      `DELETE FROM storyboard_reference_blocks WHERE id IN (${ph})`,
      trackedBlockIds,
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
