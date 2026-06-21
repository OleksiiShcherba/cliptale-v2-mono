/**
 * Integration test — `replaceStoryboard` preserves `storyboard_reference_scene_links`
 * across the delete+reinsert cycle (the durable Issue-1 fix).
 *
 * Verifies:
 *   AC-1 — Links whose scene_block_id is in the incoming blocks are preserved.
 *   AC-2 — Links whose scene_block_id is NOT in the incoming blocks (scene removed) are dropped.
 *   AC-3 — Calling replace twice is idempotent (INSERT IGNORE — no duplicates, no error).
 *   AC-4 — Reference blocks are untouched by the replace.
 *
 * Prerequisites: Docker Compose `db` service running (all migrations applied).
 * Run:
 *   cd apps/api && APP_DB_PASSWORD=cliptale APP_REDIS_URL=redis://localhost:6380 \
 *     npx vitest run src/repositories/storyboard.replaceStoryboard.sceneLinks.test.ts
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
  APP_JWT_SECRET:           'sb-scl-integ-test-secret-exactly-32ch!',
  APP_DEV_AUTH_BYPASS:      'false',
});

import { config } from '@/config.js';
import { replaceStoryboard, getConnection } from './storyboard.repository.js';

// Force auth bypass OFF — guard against singleFork process.env leakage from
// other test files that set APP_DEV_AUTH_BYPASS=true (memory: api-test-auth-bypass-isolation).
beforeAll(() => {
  config.auth.devAuthBypass = false;
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

let conn: Connection;

const PREFIX = 'rsl';
const USER_ID = `${PREFIX}-u-${randomUUID().slice(0, 8)}`;

let draftId: string;
/** Scene A — retained across all replace calls */
let sceneAId: string;
/** Scene B — retained across all replace calls */
let sceneBId: string;
/** Scene C — dropped from the second replace call */
let sceneCId: string;
/** Reference block 1 — linked to scenes A and C before first replace */
let refBlock1Id: string;
/** Reference block 2 — linked to scene B before first replace */
let refBlock2Id: string;

/** Minimal BlockInsert for replaceStoryboard. */
function makeBlock(id: string, sortOrder: number) {
  return {
    id,
    draftId,
    blockType: 'scene' as const,
    name: `Scene ${id.slice(-4)}`,
    prompt: 'test',
    videoPrompt: null,
    durationS: 5,
    positionX: 0,
    positionY: 0,
    sortOrder,
    style: null,
    mediaItems: [],
  };
}

beforeAll(async () => {
  conn = await mysql.createConnection({
    host:     process.env['APP_DB_HOST']     ?? 'localhost',
    port:     Number(process.env['APP_DB_PORT'] ?? 3306),
    database: process.env['APP_DB_NAME']     ?? 'cliptale',
    user:     process.env['APP_DB_USER']     ?? 'cliptale',
    password: process.env['APP_DB_PASSWORD'] ?? 'cliptale',
  });

  // Seed user
  await conn.execute(
    `INSERT IGNORE INTO users (user_id, email, display_name)
     VALUES (?, ?, ?)`,
    [USER_ID, `${USER_ID}@test.com`, USER_ID],
  );

  // Seed draft
  draftId = randomUUID();
  await conn.execute(
    `INSERT INTO generation_drafts (id, user_id, prompt_doc) VALUES (?, ?, ?)`,
    [draftId, USER_ID, JSON.stringify({ schemaVersion: 1, blocks: [] })],
  );

  // Seed three scene blocks
  sceneAId = randomUUID();
  sceneBId = randomUUID();
  sceneCId = randomUUID();
  for (const [id, order] of [[sceneAId, 0], [sceneBId, 1], [sceneCId, 2]] as [string, number][]) {
    await conn.execute(
      `INSERT INTO storyboard_blocks
         (id, draft_id, block_type, name, prompt, duration_s, position_x, position_y, sort_order)
       VALUES (?, ?, 'scene', 'Test Scene', 'prompt', 5, 0, 0, ?)`,
      [id, draftId, order],
    );
  }

  // Seed two reference blocks (no flow_id — manually-added)
  refBlock1Id = randomUUID();
  refBlock2Id = randomUUID();
  for (const [id, order] of [[refBlock1Id, 0], [refBlock2Id, 1]] as [string, number][]) {
    await conn.execute(
      `INSERT INTO storyboard_reference_blocks
         (id, draft_id, cast_type, name, sort_order, position_x, position_y)
       VALUES (?, ?, 'character', 'Test Ref', ?, 0, 0)`,
      [id, draftId, order],
    );
  }

  // Seed initial links:
  //   ref1 → scene A
  //   ref1 → scene C  (will be dropped when scene C is removed)
  //   ref2 → scene B
  await conn.execute(
    `INSERT INTO storyboard_reference_scene_links (reference_block_id, scene_block_id)
     VALUES (?, ?), (?, ?), (?, ?)`,
    [refBlock1Id, sceneAId, refBlock1Id, sceneCId, refBlock2Id, sceneBId],
  );
});

afterAll(async () => {
  if (!conn) return;
  // storyboard_blocks CASCADE deletes reference_scene_links (on scene_block_id FK)
  await conn.execute(
    `DELETE FROM storyboard_reference_blocks WHERE draft_id = ?`,
    [draftId],
  );
  await conn.execute('DELETE FROM storyboard_edges WHERE draft_id = ?', [draftId]);
  await conn.execute('DELETE FROM storyboard_blocks WHERE draft_id = ?', [draftId]);
  await conn.execute('DELETE FROM generation_drafts WHERE id = ?', [draftId]);
  await conn.execute('DELETE FROM users WHERE user_id = ?', [USER_ID]);
  await conn.end();
});

// ── Helper to query current links for this draft ───────────────────────────────

async function queryLinks(): Promise<Array<{ reference_block_id: string; scene_block_id: string }>> {
  const [rows] = await conn.execute<mysql.RowDataPacket[]>(
    `SELECT l.reference_block_id, l.scene_block_id
       FROM storyboard_reference_scene_links l
       JOIN storyboard_reference_blocks rb ON rb.id = l.reference_block_id
      WHERE rb.draft_id = ?
      ORDER BY l.reference_block_id, l.scene_block_id`,
    [draftId],
  );
  return rows as Array<{ reference_block_id: string; scene_block_id: string }>;
}

async function countReferenceBlocks(): Promise<number> {
  const [rows] = await conn.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt FROM storyboard_reference_blocks WHERE draft_id = ?`,
    [draftId],
  );
  return Number((rows[0] as { cnt: number }).cnt);
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('replaceStoryboard — reference→scene link preservation (AC-1 through AC-4)', () => {
  it('AC-1: preserves links for all retained scene block ids', async () => {
    // Replace with all three scenes — all links must survive.
    const txn = await getConnection();
    try {
      await txn.beginTransaction();
      await replaceStoryboard(
        txn,
        draftId,
        [makeBlock(sceneAId, 0), makeBlock(sceneBId, 1), makeBlock(sceneCId, 2)],
        [],
      );
      await txn.commit();
    } catch (err) {
      await txn.rollback();
      throw err;
    } finally {
      txn.release();
    }

    const links = await queryLinks();
    const pairs = links.map((r) => `${r.reference_block_id}:${r.scene_block_id}`);

    // All three original links must be present.
    expect(pairs).toContain(`${refBlock1Id}:${sceneAId}`);
    expect(pairs).toContain(`${refBlock1Id}:${sceneCId}`);
    expect(pairs).toContain(`${refBlock2Id}:${sceneBId}`);
    expect(links).toHaveLength(3);
  });

  it('AC-2: drops links whose scene_block_id is removed from incoming blocks', async () => {
    // Replace with only scenes A and B — scene C is absent, so ref1→C must be dropped.
    const txn = await getConnection();
    try {
      await txn.beginTransaction();
      await replaceStoryboard(
        txn,
        draftId,
        [makeBlock(sceneAId, 0), makeBlock(sceneBId, 1)],
        [],
      );
      await txn.commit();
    } catch (err) {
      await txn.rollback();
      throw err;
    } finally {
      txn.release();
    }

    const links = await queryLinks();
    const pairs = links.map((r) => `${r.reference_block_id}:${r.scene_block_id}`);

    // ref1→A and ref2→B survive; ref1→C must be gone.
    expect(pairs).toContain(`${refBlock1Id}:${sceneAId}`);
    expect(pairs).toContain(`${refBlock2Id}:${sceneBId}`);
    expect(pairs).not.toContain(`${refBlock1Id}:${sceneCId}`);
    expect(links).toHaveLength(2);
  });

  it('AC-3: idempotent — calling replace twice produces no duplicates and no error', async () => {
    // Same blocks as after AC-2 (scenes A + B). Call replace again; INSERT IGNORE must not
    // raise an error and the count must remain at 2.
    const txn = await getConnection();
    try {
      await txn.beginTransaction();
      await replaceStoryboard(
        txn,
        draftId,
        [makeBlock(sceneAId, 0), makeBlock(sceneBId, 1)],
        [],
      );
      await txn.commit();
    } catch (err) {
      await txn.rollback();
      throw err;
    } finally {
      txn.release();
    }

    const links = await queryLinks();
    expect(links).toHaveLength(2);
  });

  it('AC-4: reference blocks are untouched by replaceStoryboard', async () => {
    // Both reference blocks seeded in beforeAll must still exist after all the replace calls.
    const count = await countReferenceBlocks();
    expect(count).toBe(2);
  });
});
