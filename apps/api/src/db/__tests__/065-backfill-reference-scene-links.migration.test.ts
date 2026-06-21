/**
 * Integration test — migration 065_backfill_reference_scene_links.sql
 *
 * RED→GREEN anchor for Bug 1 (zero reference→scene links): reference blocks
 * were created via a path that omitted `scene_block_ids`, leaving the junction
 * table storyboard_reference_scene_links empty even though the authoritative
 * scene_block_ids live in the cast-extraction proposal_json.
 *
 * This migration re-derives the missing links by matching:
 *   proposal entry ($.cast[*].type, $.cast[*].name)
 *     ↔ storyboard_reference_blocks (cast_type, name)
 * and inserts only scene ids that exist in storyboard_blocks (FK guard).
 *
 * The test asserts:
 *   1. The live migration file exists at the expected path.
 *   2. runPendingMigrations() applies it without error.
 *   3. After migration, seeded blocks with zero links now have the correct
 *      scene ids derived from the proposal_json.
 *   4. Blocks that already had links are not touched (NOT EXISTS guard).
 *   5. Re-running runPendingMigrations() is a no-op (migration already recorded
 *      in schema_migrations after the first run).
 *   6. Ambiguous entries (duplicate cast_type+name in proposal) are skipped.
 *   7. Non-existent scene ids in the proposal are not inserted (FK guard).
 *
 * Prerequisites: MySQL 8 running at localhost:3306, db=cliptale, pass=cliptale.
 * Requires the dev DB to have user dev-user-001 (the standard dev seed user).
 *
 * Run: cd apps/api && APP_DB_PASSWORD=cliptale npx vitest run
 *       src/db/__tests__/065-backfill-reference-scene-links.migration.test.ts
 */

import fs from 'node:fs';
import path from 'node:path';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql from 'mysql2/promise';

import { MIGRATIONS_DIR, runPendingMigrations } from '@/db/migrate.js';

// Auth bypass isolation — see memory: api-test-auth-bypass-isolation
import { config } from '@/config.js';

/**
 * Execute the migration SQL directly on the given connection.
 *
 * Why not use runPendingMigrations()?
 * runPendingMigrations() is a one-shot runner: once a file is recorded in
 * schema_migrations it is never re-executed, regardless of whether seed data
 * exists for the current test run.  Migration 065 is a pure DML INSERT IGNORE
 * — it was already applied to the dev DB during development and is recorded in
 * schema_migrations.  Calling runPendingMigrations() here would therefore skip
 * the SQL, leaving the freshly seeded test rows with zero links and causing all
 * data assertions to fail.
 *
 * The correct strategy for a DML migration test is to execute the SQL directly
 * against the test connection after seeding.  The runPendingMigrations() test
 * below still validates the runner itself (resolves without error when 065 is
 * already up-to-date), but the data assertions are driven by direct execution.
 */
async function applyMigrationSql(connection: mysql.Connection, sqlPath: string): Promise<void> {
  const sql = fs.readFileSync(sqlPath, 'utf8');
  // mysql2 single-statement execute — the migration is a single INSERT IGNORE SELECT
  await connection.query(sql);
}

const MIGRATION_FILENAME = '065_backfill_reference_scene_links.sql';
const MIGRATION_PATH = path.join(MIGRATIONS_DIR, MIGRATION_FILENAME);

const DB_NAME = 'cliptale';

// Use the standard dev seed user (always exists in dev DB)
const DEV_USER_ID = 'dev-user-001';

// UUIDs for test-isolated data — prefix 00000065 to avoid collision with real data
const TEST_DRAFT_ID = '00000065-0000-0000-0000-000000000001';
const TEST_EXTRACTION_JOB_ID = '00000065-0000-0000-0000-000000000004';

// Reference block ids
const REF_BLOCK_CHARACTER = '00000065-1000-0000-0000-000000000001'; // zero links → backfilled
const REF_BLOCK_ENVIRONMENT = '00000065-1000-0000-0000-000000000002'; // zero links → backfilled
const REF_BLOCK_AMBIGUOUS = '00000065-1000-0000-0000-000000000003'; // ambiguous name → skipped
const REF_BLOCK_PRELINKED = '00000065-1000-0000-0000-000000000004'; // pre-existing link → not touched

// Scene block ids — seeded into storyboard_blocks so FKs are satisfied
const SCENE_1 = '00000065-2000-0000-0000-000000000001';
const SCENE_2 = '00000065-2000-0000-0000-000000000002';
const SCENE_3 = '00000065-2000-0000-0000-000000000003';
// Scene id that does NOT exist in storyboard_blocks (FK guard test)
const NONEXISTENT_SCENE = '00000065-dead-0000-0000-000000000099';

// Proposal JSON for the test extraction job:
//   - 'test character' → SCENE_1 + SCENE_2 + NONEXISTENT_SCENE (only existing ids inserted)
//   - 'test environment' → SCENE_2 + SCENE_3
//   - 'ambiguous entry' appears twice (same cast_type+name) → both are skipped
//   - 'prelinked environment' in proposal but block already has a link → NOT EXISTS skips it
const PROPOSAL_JSON = JSON.stringify({
  cast: [
    {
      name: 'test character',
      type: 'character',
      description: 'a test character',
      image_file_ids: [],
      scene_block_ids: [SCENE_1, SCENE_2, NONEXISTENT_SCENE],
      per_run_estimate: 0,
    },
    {
      name: 'test environment',
      type: 'environment',
      description: 'a test environment',
      image_file_ids: [],
      scene_block_ids: [SCENE_2, SCENE_3],
      per_run_estimate: 0,
    },
    {
      name: 'ambiguous entry',
      type: 'character',
      description: 'first copy — same name makes matching ambiguous',
      image_file_ids: [],
      scene_block_ids: [SCENE_1],
      per_run_estimate: 0,
    },
    {
      name: 'ambiguous entry',
      type: 'character',
      description: 'second copy — duplicate name, block should be skipped',
      image_file_ids: [],
      scene_block_ids: [SCENE_2],
      per_run_estimate: 0,
    },
    {
      name: 'prelinked environment',
      type: 'environment',
      description: 'this block already has a link — NOT EXISTS guard prevents backfill',
      image_file_ids: [],
      scene_block_ids: [SCENE_1, SCENE_2, SCENE_3],
      per_run_estimate: 0,
    },
  ],
});

let conn: mysql.Connection;

async function getLinks(referenceBlockId: string): Promise<string[]> {
  const [rows] = await conn.execute<mysql.RowDataPacket[]>(
    `SELECT scene_block_id
       FROM storyboard_reference_scene_links
      WHERE reference_block_id = ?
      ORDER BY scene_block_id`,
    [referenceBlockId],
  );
  return rows.map((r) => r['scene_block_id'] as string);
}

async function getLinkCount(referenceBlockId: string): Promise<number> {
  const [rows] = await conn.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt
       FROM storyboard_reference_scene_links
      WHERE reference_block_id = ?`,
    [referenceBlockId],
  );
  return (rows[0]?.['cnt'] as number) ?? 0;
}

beforeAll(async () => {
  // Auth bypass isolation — prevent singleFork config leak affecting auth tests
  config.auth.devAuthBypass = false;

  conn = await mysql.createConnection({
    host: 'localhost',
    port: 3306,
    database: DB_NAME,
    user: 'cliptale',
    password: process.env['APP_DB_PASSWORD'] ?? 'cliptale',
  });

  // Seed a generation_draft (parent of all storyboard tables for this test)
  await conn.execute(
    `INSERT IGNORE INTO generation_drafts (id, user_id, prompt_doc, status, created_at, updated_at)
     VALUES (?, ?, '{}', 'draft', NOW(), NOW())`,
    [TEST_DRAFT_ID, DEV_USER_ID],
  );

  // Seed three scene blocks (SCENE_1, SCENE_2, SCENE_3 exist; NONEXISTENT_SCENE is intentionally absent)
  for (const [idx, sceneId] of [SCENE_1, SCENE_2, SCENE_3].entries()) {
    await conn.execute(
      `INSERT IGNORE INTO storyboard_blocks
         (id, draft_id, block_type, sort_order, created_at, updated_at)
       VALUES (?, ?, 'scene', ?, NOW(), NOW())`,
      [sceneId, TEST_DRAFT_ID, idx + 1],
    );
  }

  // Seed four reference blocks (all zero links at seed time)
  const refBlocks: [string, string, string][] = [
    [REF_BLOCK_CHARACTER, 'character', 'test character'],
    [REF_BLOCK_ENVIRONMENT, 'environment', 'test environment'],
    [REF_BLOCK_AMBIGUOUS, 'character', 'ambiguous entry'],
    [REF_BLOCK_PRELINKED, 'environment', 'prelinked environment'],
  ];
  for (const [id, castType, name] of refBlocks) {
    await conn.execute(
      `INSERT IGNORE INTO storyboard_reference_blocks
         (id, draft_id, cast_type, name, description, window_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'test description', 'done', NOW(), NOW())`,
      [id, TEST_DRAFT_ID, castType, name],
    );
  }

  // Pre-seed one link for REF_BLOCK_PRELINKED to simulate a block already linked
  await conn.execute(
    `INSERT IGNORE INTO storyboard_reference_scene_links (reference_block_id, scene_block_id)
     VALUES (?, ?)`,
    [REF_BLOCK_PRELINKED, SCENE_1],
  );

  // Seed the completed cast extraction job with proposal_json
  await conn.execute(
    `INSERT IGNORE INTO storyboard_cast_extraction_jobs
       (id, draft_id, user_id, status, proposal_json, created_at, updated_at)
     VALUES (?, ?, ?, 'completed', ?, NOW(), NOW())`,
    [TEST_EXTRACTION_JOB_ID, TEST_DRAFT_ID, DEV_USER_ID, PROPOSAL_JSON],
  );

  // Execute the migration SQL directly against the seeded data.
  // runPendingMigrations() cannot be used here because migration 065 is already
  // recorded in schema_migrations (it was applied to the shared dev DB during
  // development) and the runner skips already-applied files unconditionally.
  // Direct execution is the only way to validate the backfill logic against
  // fresh seed data on every test run.
  await applyMigrationSql(conn, MIGRATION_PATH);
});

afterAll(async () => {
  // Clean up test data in reverse FK order
  await conn.execute(
    `DELETE FROM storyboard_reference_scene_links
      WHERE reference_block_id IN (?, ?, ?, ?)`,
    [REF_BLOCK_CHARACTER, REF_BLOCK_ENVIRONMENT, REF_BLOCK_AMBIGUOUS, REF_BLOCK_PRELINKED],
  );
  await conn.execute(
    `DELETE FROM storyboard_cast_extraction_jobs WHERE id = ?`,
    [TEST_EXTRACTION_JOB_ID],
  );
  await conn.execute(
    `DELETE FROM storyboard_reference_blocks WHERE draft_id = ?`,
    [TEST_DRAFT_ID],
  );
  await conn.execute(
    `DELETE FROM storyboard_blocks WHERE draft_id = ?`,
    [TEST_DRAFT_ID],
  );
  await conn.execute(
    `DELETE FROM generation_drafts WHERE id = ?`,
    [TEST_DRAFT_ID],
  );
  await conn.end();
});

describe('migration 065 — backfill reference scene links', () => {
  it('live file exists at apps/api/src/db/migrations/065_backfill_reference_scene_links.sql', () => {
    expect(fs.existsSync(MIGRATION_PATH)).toBe(true);
  });

  it('runPendingMigrations() resolves without error (migration already recorded — no-op)', async () => {
    // 065 is already in schema_migrations; the runner must not throw on an
    // up-to-date database.  Data assertions are driven by direct SQL execution
    // in beforeAll (see applyMigrationSql) rather than by this call.
    await expect(runPendingMigrations()).resolves.toBeUndefined();
  });

  it('character block with zero links gets scene ids from proposal (existing scenes only)', async () => {
    const links = await getLinks(REF_BLOCK_CHARACTER);
    // proposal has SCENE_1, SCENE_2, NONEXISTENT_SCENE — FK guard excludes NONEXISTENT_SCENE
    expect(links).toContain(SCENE_1);
    expect(links).toContain(SCENE_2);
    expect(links).not.toContain(NONEXISTENT_SCENE);
    expect(links).toHaveLength(2);
  });

  it('environment block with zero links gets its scene ids from proposal', async () => {
    const links = await getLinks(REF_BLOCK_ENVIRONMENT);
    expect(links).toContain(SCENE_2);
    expect(links).toContain(SCENE_3);
    expect(links).toHaveLength(2);
  });

  it('ambiguous block (duplicate cast_type+name in proposal) is skipped — zero links inserted', async () => {
    const count = await getLinkCount(REF_BLOCK_AMBIGUOUS);
    expect(count).toBe(0);
  });

  it('pre-linked block is not touched — NOT EXISTS guard preserves exactly the 1 pre-existing link', async () => {
    const links = await getLinks(REF_BLOCK_PRELINKED);
    // Migration must NOT have added the 3 scenes from the proposal
    expect(links).toHaveLength(1);
    expect(links).toContain(SCENE_1);
  });

  it('migration SQL is idempotent — re-executing inserts nothing new (INSERT IGNORE + NOT EXISTS)', async () => {
    // Re-run the SQL directly a second time.  INSERT IGNORE combined with the
    // NOT EXISTS predicate must leave all counts unchanged: blocks with links
    // (CHARACTER, ENVIRONMENT, PRELINKED) are excluded by NOT EXISTS; the
    // ambiguous block stays at 0 because the duplicate-name guard still fires.
    await applyMigrationSql(conn, MIGRATION_PATH);

    expect(await getLinkCount(REF_BLOCK_CHARACTER)).toBe(2);
    expect(await getLinkCount(REF_BLOCK_ENVIRONMENT)).toBe(2);
    expect(await getLinkCount(REF_BLOCK_AMBIGUOUS)).toBe(0);
    expect(await getLinkCount(REF_BLOCK_PRELINKED)).toBe(1);
  });
});
