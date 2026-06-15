/**
 * Integration test — T21 storyboard-generation-pipeline cut-over backfill
 *
 * Verifies that backfillStoryboardPipeline():
 *   1. dry-run: reports in-flight drafts with correct mapped state, inserts nothing.
 *   2. apply: inserts one storyboard_pipeline row per in-flight draft with
 *      the correct active_phase / active_run_phase / *_status per phase-mapping rules.
 *   3. no orphaned jobs: every in-flight draft has a storyboard_pipeline row after apply.
 *   4. idempotent: re-running apply returns seeded:0, skipped >= n, row count unchanged.
 *
 * Prerequisites: MySQL 8 running at localhost:3306, db=cliptale, migration 057 applied.
 *
 * Run:
 *   cd apps/api && APP_DB_PASSWORD=cliptale \
 *     npx vitest run src/db/cutover/storyboardPipelineBackfill.integration.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql, { type Connection, type Pool } from 'mysql2/promise';
import { randomUUID } from 'node:crypto';

// ── Env bootstrap (must happen before any app import) ──────────────────────────
Object.assign(process.env, {
  APP_DB_HOST:              process.env['APP_DB_HOST']              ?? 'localhost',
  APP_DB_PORT:              process.env['APP_DB_PORT']              ?? '3306',
  APP_DB_NAME:              process.env['APP_DB_NAME']              ?? 'cliptale',
  APP_DB_USER:              process.env['APP_DB_USER']              ?? 'cliptale',
  APP_DB_PASSWORD:          process.env['APP_DB_PASSWORD']          ?? 'cliptale',
  APP_REDIS_URL:            process.env['APP_REDIS_URL']            ?? 'redis://localhost:6379',
  APP_S3_BUCKET:            process.env['APP_S3_BUCKET']            ?? 'test-bucket',
  APP_S3_REGION:            process.env['APP_S3_REGION']            ?? 'us-east-1',
  APP_S3_ACCESS_KEY_ID:     process.env['APP_S3_ACCESS_KEY_ID']     ?? 'test-access-key-id',
  APP_S3_SECRET_ACCESS_KEY: process.env['APP_S3_SECRET_ACCESS_KEY'] ?? 'test-secret-key-value',
  APP_JWT_SECRET:           't21-cutover-integ-test-secret-32chars!',
  APP_DEV_AUTH_BYPASS:      'true',
});

import {
  backfillStoryboardPipeline,
} from './storyboardPipelineBackfill.js';

// ── Unique prefix to namespace all test rows ───────────────────────────────────
const PREFIX = 'cutover-it';

// Scenario draft IDs — short enough to fit CHAR(36).
const DRAFT_SCENE    = `${PREFIX}-scene-0001`;   // plan job queued/running → scene phase
const DRAFT_CASTRUN  = `${PREFIX}-castr-0002`;   // cast_extraction running → reference_data running
const DRAFT_CASTAWT  = `${PREFIX}-casta-0003`;   // cast_extraction completed with proposal_json → awaiting_review
const DRAFT_IMGRUN   = `${PREFIX}-imgr-00004`;   // scene_illustration queued/running → scene_image running
const DRAFT_ALREADY  = `${PREFIX}-alrdy-0005`;   // already has a storyboard_pipeline row → skipped

const ALL_DRAFT_IDS = [DRAFT_SCENE, DRAFT_CASTRUN, DRAFT_CASTAWT, DRAFT_IMGRUN, DRAFT_ALREADY];
const IN_FLIGHT_DRAFT_IDS = [DRAFT_SCENE, DRAFT_CASTRUN, DRAFT_CASTAWT, DRAFT_IMGRUN];

// Seed user reused across all drafts — INSERT IGNORE so the user persists
// across parallel test runs without collision.
const SEED_USER_ID = `${PREFIX}-user-0001`;

let conn: Connection;
let pool: Pool;

// ── Valid enum members (for assertion) ────────────────────────────────────────
const VALID_PHASES   = new Set(['scene', 'reference_data', 'reference_image', 'scene_image']);
const VALID_STATUSES = new Set([
  'idle', 'running', 'awaiting_review', 'completed', 'cancelled', 'failed', 'skipped',
]);

// ── Helpers ───────────────────────────────────────────────────────────────────
async function countPipelineRows(draftIds: string[]): Promise<number> {
  if (draftIds.length === 0) return 0;
  const ph = draftIds.map(() => '?').join(',');
  const [rows] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS n FROM storyboard_pipeline WHERE draft_id IN (${ph})`,
    draftIds,
  );
  return Number(rows[0]!['n']);
}

async function getPipelineRow(draftId: string): Promise<mysql.RowDataPacket | null> {
  const [rows] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT draft_id, active_phase, active_run_phase,
            scene_status, reference_data_status, reference_image_status, scene_image_status
       FROM storyboard_pipeline
      WHERE draft_id = ?`,
    [draftId],
  );
  return rows[0] ?? null;
}

// ── Setup ─────────────────────────────────────────────────────────────────────
beforeAll(async () => {
  conn = await mysql.createConnection({
    host:     process.env['APP_DB_HOST']     ?? 'localhost',
    port:     Number(process.env['APP_DB_PORT'] ?? 3306),
    database: process.env['APP_DB_NAME']     ?? 'cliptale',
    user:     process.env['APP_DB_USER']     ?? 'cliptale',
    password: process.env['APP_DB_PASSWORD'] ?? 'cliptale',
  });

  pool = mysql.createPool({
    host:     process.env['APP_DB_HOST']     ?? 'localhost',
    port:     Number(process.env['APP_DB_PORT'] ?? 3306),
    database: process.env['APP_DB_NAME']     ?? 'cliptale',
    user:     process.env['APP_DB_USER']     ?? 'cliptale',
    password: process.env['APP_DB_PASSWORD'] ?? 'cliptale',
    connectionLimit: 5,
  });

  // Seed user (idempotent).
  await conn.execute(
    `INSERT IGNORE INTO users (user_id, email, display_name) VALUES (?, ?, ?)`,
    [SEED_USER_ID, `${SEED_USER_ID}@cutover.test`, 'Cutover Test User'],
  );

  // Seed generation_drafts for all scenarios.
  for (const draftId of ALL_DRAFT_IDS) {
    await conn.execute(
      `INSERT IGNORE INTO generation_drafts (id, user_id, prompt_doc, status)
       VALUES (?, ?, ?, ?)`,
      [draftId, SEED_USER_ID, JSON.stringify({ text: 'cutover test prompt' }), 'step2'],
    );
  }

  // Scenario 1 — DRAFT_SCENE: plan job queued (signals in-flight scene planning).
  await conn.execute(
    `INSERT IGNORE INTO storyboard_plan_jobs
       (job_id, draft_id, user_id, status, model, prompt_snapshot_json)
     VALUES (?, ?, ?, 'queued', 'gpt-cutover-test', ?)`,
    [
      `${PREFIX}-plan-job-0001`,
      DRAFT_SCENE,
      SEED_USER_ID,
      JSON.stringify({ text: 'cutover test' }),
    ],
  );

  // Scenario 2 — DRAFT_CASTRUN: cast_extraction job running.
  await conn.execute(
    `INSERT IGNORE INTO storyboard_cast_extraction_jobs
       (id, draft_id, user_id, status, proposal_json)
     VALUES (?, ?, ?, 'running', NULL)`,
    [`${PREFIX}-cast-job-0002`, DRAFT_CASTRUN, SEED_USER_ID],
  );

  // Scenario 3 — DRAFT_CASTAWT: cast_extraction completed with proposal_json.
  await conn.execute(
    `INSERT IGNORE INTO storyboard_cast_extraction_jobs
       (id, draft_id, user_id, status, proposal_json)
     VALUES (?, ?, ?, 'completed', ?)`,
    [
      `${PREFIX}-cast-job-0003`,
      DRAFT_CASTAWT,
      SEED_USER_ID,
      JSON.stringify({ characters: [] }),
    ],
  );

  // Scenario 4 — DRAFT_IMGRUN: scene_illustration job queued.
  // storyboard_scene_illustration_jobs has FKs to storyboard_blocks and ai_generation_jobs.
  // We disable FK checks only for this INSERT to avoid seeding the full project/asset chain.
  await conn.execute(`SET FOREIGN_KEY_CHECKS = 0`);
  const blockId = `${PREFIX}-block-00004`;
  const aiJobId = `${PREFIX}-aijob-00004`;
  await conn.execute(
    `INSERT IGNORE INTO storyboard_scene_illustration_jobs
       (id, draft_id, block_id, ai_job_id, status)
     VALUES (?, ?, ?, ?, 'queued')`,
    [`${PREFIX}-illus-job-0004`, DRAFT_IMGRUN, blockId, aiJobId],
  );
  await conn.execute(`SET FOREIGN_KEY_CHECKS = 1`);

  // Scenario 5 — DRAFT_ALREADY: pre-existing storyboard_pipeline row.
  await conn.execute(
    `INSERT IGNORE INTO storyboard_pipeline
       (draft_id, active_phase, active_run_phase,
        scene_status, reference_data_status, reference_image_status, scene_image_status)
     VALUES (?, 'scene', NULL, 'completed', 'idle', 'idle', 'idle')`,
    [DRAFT_ALREADY],
  );
});

// ── Teardown ──────────────────────────────────────────────────────────────────
afterAll(async () => {
  // Delete in reverse FK order; ON DELETE CASCADE handles child rows, but be explicit.
  await conn.execute(`SET FOREIGN_KEY_CHECKS = 0`);

  const ph = ALL_DRAFT_IDS.map(() => '?').join(',');

  await conn.query(
    `DELETE FROM storyboard_pipeline WHERE draft_id IN (${ph})`,
    ALL_DRAFT_IDS,
  );
  await conn.query(
    `DELETE FROM storyboard_scene_illustration_jobs WHERE draft_id IN (${ph})`,
    ALL_DRAFT_IDS,
  );
  await conn.query(
    `DELETE FROM storyboard_cast_extraction_jobs WHERE draft_id IN (${ph})`,
    ALL_DRAFT_IDS,
  );
  await conn.query(
    `DELETE FROM storyboard_plan_jobs WHERE draft_id IN (${ph})`,
    ALL_DRAFT_IDS,
  );
  await conn.query(
    `DELETE FROM generation_drafts WHERE id IN (${ph})`,
    ALL_DRAFT_IDS,
  );
  await conn.query(
    `DELETE FROM users WHERE user_id = ?`,
    [SEED_USER_ID],
  );

  await conn.execute(`SET FOREIGN_KEY_CHECKS = 1`);

  await conn.end();
  await pool.end();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('T21 — backfillStoryboardPipeline (cut-over)', () => {
  /**
   * Test 1 — dry-run: reports in-flight drafts with correct mapped state,
   * inserts NOTHING.
   */
  describe('dry-run seeds nothing', () => {
    it('reports at least 4 examined entries (the 4 in-flight scenarios)', async () => {
      const report = await backfillStoryboardPipeline(pool, { dryRun: true });
      expect(report.examined).toBeGreaterThanOrEqual(4);
    });

    it('returns an entry for the plan-job-queued draft with scene mapping', async () => {
      const report = await backfillStoryboardPipeline(pool, { dryRun: true });
      const entry = report.entries.find((e) => e.draftId === DRAFT_SCENE);
      expect(entry).toBeDefined();
      expect(entry!.activePhase).toBe('scene');
      expect(entry!.activeRunPhase).toBe('scene');
      expect(entry!.sceneStatus).toBe('running');
    });

    it('returns an entry for the cast-extraction-running draft with reference_data running', async () => {
      const report = await backfillStoryboardPipeline(pool, { dryRun: true });
      const entry = report.entries.find((e) => e.draftId === DRAFT_CASTRUN);
      expect(entry).toBeDefined();
      expect(entry!.activePhase).toBe('reference_data');
      expect(entry!.activeRunPhase).toBe('reference_data');
      expect(entry!.sceneStatus).toBe('completed');
      expect(entry!.referenceDataStatus).toBe('running');
    });

    it('returns an entry for the cast-extraction-completed draft with awaiting_review', async () => {
      const report = await backfillStoryboardPipeline(pool, { dryRun: true });
      const entry = report.entries.find((e) => e.draftId === DRAFT_CASTAWT);
      expect(entry).toBeDefined();
      expect(entry!.activePhase).toBe('reference_data');
      expect(entry!.activeRunPhase).toBeNull();
      expect(entry!.sceneStatus).toBe('completed');
      expect(entry!.referenceDataStatus).toBe('awaiting_review');
    });

    it('returns an entry for the scene_illustration-queued draft with scene_image running', async () => {
      const report = await backfillStoryboardPipeline(pool, { dryRun: true });
      const entry = report.entries.find((e) => e.draftId === DRAFT_IMGRUN);
      expect(entry).toBeDefined();
      expect(entry!.activePhase).toBe('scene_image');
      expect(entry!.activeRunPhase).toBe('scene_image');
      expect(entry!.sceneImageStatus).toBe('running');
    });

    it('inserts NO storyboard_pipeline rows for the in-flight drafts', async () => {
      await backfillStoryboardPipeline(pool, { dryRun: true });
      const count = await countPipelineRows(IN_FLIGHT_DRAFT_IDS);
      expect(count).toBe(0);
    });
  });

  /**
   * Test 2 — apply: inserts one storyboard_pipeline row per in-flight draft
   * with the expected column values.
   */
  describe('apply seeds valid rows', () => {
    it('seeds exactly 4 rows (one per in-flight draft) and skips the already-seeded one', async () => {
      const report = await backfillStoryboardPipeline(pool, { dryRun: false });
      expect(report.seeded).toBe(4);
      expect(report.skipped).toBeGreaterThanOrEqual(1);
    });

    it('DRAFT_SCENE row has active_phase=scene, active_run_phase=scene, scene_status=running', async () => {
      await backfillStoryboardPipeline(pool, { dryRun: false });
      const row = await getPipelineRow(DRAFT_SCENE);
      expect(row).not.toBeNull();
      expect(row!['active_phase']).toBe('scene');
      expect(row!['active_run_phase']).toBe('scene');
      expect(row!['scene_status']).toBe('running');
    });

    it('DRAFT_CASTRUN row has active_phase=reference_data, active_run_phase=reference_data, scene_status=completed, reference_data_status=running', async () => {
      await backfillStoryboardPipeline(pool, { dryRun: false });
      const row = await getPipelineRow(DRAFT_CASTRUN);
      expect(row).not.toBeNull();
      expect(row!['active_phase']).toBe('reference_data');
      expect(row!['active_run_phase']).toBe('reference_data');
      expect(row!['scene_status']).toBe('completed');
      expect(row!['reference_data_status']).toBe('running');
    });

    it('DRAFT_CASTAWT row has active_phase=reference_data, active_run_phase=NULL, reference_data_status=awaiting_review', async () => {
      await backfillStoryboardPipeline(pool, { dryRun: false });
      const row = await getPipelineRow(DRAFT_CASTAWT);
      expect(row).not.toBeNull();
      expect(row!['active_phase']).toBe('reference_data');
      expect(row!['active_run_phase']).toBeNull();
      expect(row!['scene_status']).toBe('completed');
      expect(row!['reference_data_status']).toBe('awaiting_review');
    });

    it('DRAFT_IMGRUN row has active_phase=scene_image, active_run_phase=scene_image, scene_image_status=running, earlier phases=completed', async () => {
      await backfillStoryboardPipeline(pool, { dryRun: false });
      const row = await getPipelineRow(DRAFT_IMGRUN);
      expect(row).not.toBeNull();
      expect(row!['active_phase']).toBe('scene_image');
      expect(row!['active_run_phase']).toBe('scene_image');
      expect(row!['scene_image_status']).toBe('running');
      expect(row!['scene_status']).toBe('completed');
      expect(row!['reference_data_status']).toBe('completed');
      expect(row!['reference_image_status']).toBe('completed');
    });

    it('every seeded row has valid enum values for active_phase, active_run_phase and *_status columns', async () => {
      await backfillStoryboardPipeline(pool, { dryRun: false });
      const ph = IN_FLIGHT_DRAFT_IDS.map(() => '?').join(',');
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT active_phase, active_run_phase,
                scene_status, reference_data_status,
                reference_image_status, scene_image_status
           FROM storyboard_pipeline
          WHERE draft_id IN (${ph})`,
        IN_FLIGHT_DRAFT_IDS,
      );
      expect(rows).toHaveLength(4);
      for (const row of rows) {
        expect(VALID_PHASES.has(String(row['active_phase']))).toBe(true);
        if (row['active_run_phase'] !== null) {
          expect(VALID_PHASES.has(String(row['active_run_phase']))).toBe(true);
        }
        for (const col of [
          'scene_status',
          'reference_data_status',
          'reference_image_status',
          'scene_image_status',
        ]) {
          expect(VALID_STATUSES.has(String(row[col])), col).toBe(true);
        }
      }
    });
  });

  /**
   * Test 3 — no orphaned jobs: every in-flight draft has a pipeline row after apply.
   */
  describe('no orphaned jobs', () => {
    it('zero drafts with an in-flight job remain without a storyboard_pipeline row', async () => {
      await backfillStoryboardPipeline(pool, { dryRun: false });

      // Left-join: find in-flight drafts (job present) that have no pipeline row.
      const [orphans] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT d.id
           FROM generation_drafts d
           LEFT JOIN storyboard_pipeline sp ON sp.draft_id = d.id
          WHERE d.id IN (?, ?, ?, ?)
            AND sp.draft_id IS NULL`,
        IN_FLIGHT_DRAFT_IDS,
      );
      expect(orphans).toHaveLength(0);
    });
  });

  /**
   * Test 4 — idempotent: calling apply again returns seeded:0, skipped >= n,
   * row count unchanged.
   */
  describe('idempotent on re-run', () => {
    it('second apply returns seeded:0 and skipped >= 4, row count stays at 4', async () => {
      // First apply — seeds the 4 rows.
      await backfillStoryboardPipeline(pool, { dryRun: false });
      const countAfterFirst = await countPipelineRows(IN_FLIGHT_DRAFT_IDS);

      // Second apply — must be a no-op.
      const second = await backfillStoryboardPipeline(pool, { dryRun: false });
      expect(second.seeded).toBe(0);
      expect(second.skipped).toBeGreaterThanOrEqual(4);

      const countAfterSecond = await countPipelineRows(IN_FLIGHT_DRAFT_IDS);
      expect(countAfterSecond).toBe(countAfterFirst);
    });
  });
});
