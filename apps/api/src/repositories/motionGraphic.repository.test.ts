/**
 * Integration tests for motionGraphic.repository.ts against real MySQL 8.
 *
 * Covers T5 (the three motion-graphic tables + the storyboard_block_media attach):
 *   AC-01 — create a graphic; rename it.
 *   AC-03 — append chat turns with an app-assigned monotonic seq.
 *   AC-04 — attach freezes a snapshot copy (code + duration + geometry).
 *   AC-10 — the snapshot is INDEPENDENT of its source (mutate / soft-delete the source,
 *           the snapshot row is byte-identical).
 *   AC-12 — duplicate copies all chat turns in seq order, preserving generated_code.
 *   AC-13 — list-my-graphics is owner-filtered, newest-first, excludes soft-deleted,
 *           cursor-paged.
 *   AC-14 — a failed refine records a failed assistant turn and leaves the last code.
 *
 * Prerequisites: Docker Compose `db` service running (real MySQL, migrations 058-061 applied).
 * Run:
 *   cd apps/api && APP_DB_PASSWORD=cliptale \
 *     npx vitest run src/repositories/motionGraphic.repository.test.ts
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
  APP_JWT_SECRET:           'mg-t5-integ-test-secret-exactly-32chr!',
  APP_DEV_AUTH_BYPASS:      'true',
});

import {
  insertMotionGraphic,
  findMotionGraphicWithChat,
  listMotionGraphicsByOwner,
  updateMotionGraphicCode,
  renameMotionGraphic,
  appendChatTurn,
  copyChatTurns,
  insertBlockSnapshotWithMedia,
  findBlockMediaSnapshot,
} from './motionGraphic.repository.js';

let conn: Connection;

const PREFIX = 'mg-t5';
const USER_A = `${PREFIX}-ua-${randomUUID().slice(0, 8)}`;
const USER_B = `${PREFIX}-ub-${randomUUID().slice(0, 8)}`;

const trackedGraphicIds: string[] = [];
const trackedDraftIds: string[] = [];
const trackedBlockIds: string[] = [];
const trackedSnapshotIds: string[] = [];
const trackedMediaIds: string[] = [];

// ids must fit CHAR(36) — a raw UUID is exactly 36 chars. The `tag` arg is kept for
// call-site readability only.
function newId(_tag: string): string {
  return randomUUID();
}

const SAMPLE_CODE =
  "export const C = () => { const f = useCurrentFrame(); return <div>{f}</div>; };";

/** Inserts a motion_graphics row directly and tracks it for cleanup. */
async function seedGraphic(userId: string, overrides: Record<string, unknown> = {}): Promise<string> {
  const id = newId('mg');
  trackedGraphicIds.push(id);
  const cols = {
    id,
    user_id: userId,
    title: 'Untitled motion graphic',
    code: SAMPLE_CODE,
    duration_seconds: 4.5,
    status: 'ready',
    ...overrides,
  } as Record<string, unknown>;
  await conn.execute(
    `INSERT INTO motion_graphics (id, user_id, title, code, duration_seconds, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [cols['id'], cols['user_id'], cols['title'], cols['code'], cols['duration_seconds'], cols['status']],
  );
  return id;
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

async function seedBlock(draftId: string): Promise<string> {
  const blockId = newId('block');
  trackedBlockIds.push(blockId);
  await conn.execute(
    `INSERT INTO storyboard_blocks (id, draft_id, block_type, sort_order)
     VALUES (?, ?, 'scene', 0)`,
    [blockId, draftId],
  );
  return blockId;
}

beforeAll(async () => {
  conn = await mysql.createConnection({
    host:     process.env['APP_DB_HOST']     ?? 'localhost',
    port:     Number(process.env['APP_DB_PORT'] ?? 3306),
    database: process.env['APP_DB_NAME']     ?? 'cliptale',
    user:     process.env['APP_DB_USER']     ?? 'cliptale',
    password: process.env['APP_DB_PASSWORD'] ?? 'cliptale',
  });
  for (const u of [USER_A, USER_B]) {
    await conn.execute(
      `INSERT IGNORE INTO users (user_id, email, display_name) VALUES (?, ?, ?)`,
      [u, `${u}@example.test`, 'Test Creator'],
    );
  }
});

afterAll(async () => {
  const del = async (table: string, col: string, ids: string[]) => {
    if (!ids.length) return;
    const ph = ids.map(() => '?').join(',');
    await conn.query(`DELETE FROM ${table} WHERE ${col} IN (${ph})`, ids);
  };
  // children → parents
  await del('storyboard_block_media', 'id', trackedMediaIds);
  await del('motion_graphic_block_snapshots', 'id', trackedSnapshotIds);
  await del('storyboard_blocks', 'id', trackedBlockIds);
  await del('generation_drafts', 'id', trackedDraftIds);
  // chat turns cascade with the graphic, but delete the graphics
  await del('motion_graphics', 'id', trackedGraphicIds);
  await conn.query(`DELETE FROM users WHERE user_id IN (?, ?)`, [USER_A, USER_B]);
  await conn.end();
  const { pool } = await import('@/db/connection.js');
  await pool.end();
});

// ── insert + read (AC-01) ─────────────────────────────────────────────────────

describe('insertMotionGraphic + findMotionGraphicWithChat', () => {
  it('inserts a graphic with defaults and reads it back with an empty chat', async () => {
    const id = newId('mg');
    trackedGraphicIds.push(id);
    const created = await insertMotionGraphic({
      id,
      userId: USER_A,
      title: 'My graphic',
      durationSeconds: 3.25,
    });

    expect(created.id).toBe(id);
    expect(created.userId).toBe(USER_A);
    expect(created.title).toBe('My graphic');
    expect(created.status).toBe('generating'); // DB default
    expect(created.version).toBe(1);
    expect(created.fps).toBe(30);
    expect(Number(created.durationSeconds)).toBeCloseTo(3.25, 2);

    const read = await findMotionGraphicWithChat(id);
    expect(read).not.toBeNull();
    expect(read!.graphic.id).toBe(id);
    expect(read!.turns).toEqual([]);
  });

  it('returns null for an unknown graphic id', async () => {
    expect(await findMotionGraphicWithChat(newId('absent'))).toBeNull();
  });
});

// ── append-turn monotonic seq (AC-03) ─────────────────────────────────────────

describe('appendChatTurn — monotonic seq', () => {
  it('assigns increasing seq values starting at 0 and reads them in seq order', async () => {
    const id = await seedGraphic(USER_A);

    const t0 = await appendChatTurn({ motionGraphicId: id, role: 'user', content: 'make it spin' });
    const t1 = await appendChatTurn({
      motionGraphicId: id,
      role: 'assistant',
      content: 'done',
      generatedCode: SAMPLE_CODE,
      outcome: 'ready',
    });
    const t2 = await appendChatTurn({ motionGraphicId: id, role: 'user', content: 'faster' });

    expect(t0.seq).toBe(0);
    expect(t1.seq).toBe(1);
    expect(t2.seq).toBe(2);

    const read = await findMotionGraphicWithChat(id);
    expect(read!.turns.map((t) => t.seq)).toEqual([0, 1, 2]);
    expect(read!.turns.map((t) => t.content)).toEqual(['make it spin', 'done', 'faster']);
    expect(read!.turns[1]!.generatedCode).toBe(SAMPLE_CODE);
  });

  it('records a failed assistant turn with an error message (AC-14)', async () => {
    const id = await seedGraphic(USER_A);
    const turn = await appendChatTurn({
      motionGraphicId: id,
      role: 'assistant',
      content: 'I could not build that',
      outcome: 'failed',
      errorMessage: 'syntax error in generated code',
    });
    expect(turn.outcome).toBe('failed');
    const read = await findMotionGraphicWithChat(id);
    expect(read!.turns[0]!.errorMessage).toBe('syntax error in generated code');
    expect(read!.turns[0]!.generatedCode).toBeNull();
  });
});

// ── update code + version (AC-14: last-working preserved is the service's job;
//    here we just prove the bump) ───────────────────────────────────────────────

describe('updateMotionGraphicCode — bumps version', () => {
  it('sets new code, marks ready, and increments version', async () => {
    const id = await seedGraphic(USER_A, { status: 'generating', version: 1, code: null });
    const before = await findMotionGraphicWithChat(id);
    expect(before!.graphic.version).toBe(1);

    const updated = await updateMotionGraphicCode({ id, code: SAMPLE_CODE });
    expect(updated).toBe(true);

    const after = await findMotionGraphicWithChat(id);
    expect(after!.graphic.code).toBe(SAMPLE_CODE);
    expect(after!.graphic.status).toBe('ready');
    expect(after!.graphic.version).toBe(2);
  });
});

// ── rename (AC-01) ────────────────────────────────────────────────────────────

describe('renameMotionGraphic', () => {
  it('renames the graphic and returns true', async () => {
    const id = await seedGraphic(USER_A, { title: 'old' });
    expect(await renameMotionGraphic(id, 'brand new title')).toBe(true);
    const read = await findMotionGraphicWithChat(id);
    expect(read!.graphic.title).toBe('brand new title');
  });

  it('returns false for an unknown id', async () => {
    expect(await renameMotionGraphic(newId('absent'), 'x')).toBe(false);
  });
});

// ── list by owner, cursor, newest-first, soft-delete filter (AC-13) ───────────

describe('listMotionGraphicsByOwner', () => {
  it('returns only the owner\'s non-deleted graphics, newest-first, cursor-paged', async () => {
    // three graphics for USER_B with staggered updated_at (newest last-inserted)
    const g1 = await seedGraphic(USER_B, { title: 'b-1' });
    const g2 = await seedGraphic(USER_B, { title: 'b-2' });
    const g3 = await seedGraphic(USER_B, { title: 'b-3' });
    // force a strict updated_at ordering g3 > g2 > g1
    await conn.execute(`UPDATE motion_graphics SET updated_at = ? WHERE id = ?`, [new Date(Date.now() - 3000), g1]);
    await conn.execute(`UPDATE motion_graphics SET updated_at = ? WHERE id = ?`, [new Date(Date.now() - 2000), g2]);
    await conn.execute(`UPDATE motion_graphics SET updated_at = ? WHERE id = ?`, [new Date(Date.now() - 1000), g3]);
    // a graphic for a different owner must NOT appear
    await seedGraphic(USER_A, { title: 'a-other' });
    // a soft-deleted graphic must NOT appear
    const deleted = await seedGraphic(USER_B, { title: 'b-deleted' });
    await conn.execute(`UPDATE motion_graphics SET deleted_at = NOW(3) WHERE id = ?`, [deleted]);

    const page1 = await listMotionGraphicsByOwner({ userId: USER_B, limit: 2 });
    expect(page1.items.map((g) => g.id)).toEqual([g3, g2]);
    expect(page1.nextCursor).not.toBeNull();
    for (const g of page1.items) expect(g.userId).toBe(USER_B);

    const page2 = await listMotionGraphicsByOwner({ userId: USER_B, limit: 2, cursor: page1.nextCursor! });
    expect(page2.items.map((g) => g.id)).toEqual([g1]);
    expect(page2.nextCursor).toBeNull();

    const allIds = [...page1.items, ...page2.items].map((g) => g.id);
    expect(allIds).not.toContain(deleted);
  });
});

// ── copy turns preserves order + generated_code (AC-12) ───────────────────────

describe('copyChatTurns — duplicate preserves seq order + generated_code', () => {
  it('copies all turns from source to target in the same seq order', async () => {
    const src = await seedGraphic(USER_A);
    await appendChatTurn({ motionGraphicId: src, role: 'user', content: 'one' });
    await appendChatTurn({
      motionGraphicId: src,
      role: 'assistant',
      content: 'reply one',
      generatedCode: 'CODE_A',
      outcome: 'ready',
    });
    await appendChatTurn({ motionGraphicId: src, role: 'user', content: 'two' });

    const target = await seedGraphic(USER_A);
    const copied = await copyChatTurns({ sourceId: src, targetId: target });
    expect(copied).toBe(3);

    const read = await findMotionGraphicWithChat(target);
    expect(read!.turns.map((t) => t.seq)).toEqual([0, 1, 2]);
    expect(read!.turns.map((t) => t.content)).toEqual(['one', 'reply one', 'two']);
    expect(read!.turns[1]!.generatedCode).toBe('CODE_A');
    expect(read!.turns[1]!.role).toBe('assistant');
  });
});

// ── atomic snapshot + block-media insert; snapshot independence (AC-04 / AC-10) ─

describe('insertBlockSnapshotWithMedia + findBlockMediaSnapshot', () => {
  it('inserts both the snapshot and the block-media row in one transaction', async () => {
    const graphic = await seedGraphic(USER_A, { code: 'FROZEN_CODE', duration_seconds: 6.5 });
    const draft = await seedDraft(USER_A);
    const block = await seedBlock(draft);

    const snapshotId = newId('snap');
    const mediaId = newId('media');
    trackedSnapshotIds.push(snapshotId);
    trackedMediaIds.push(mediaId);

    const result = await insertBlockSnapshotWithMedia({
      snapshotId,
      mediaId,
      blockId: block,
      sourceMotionGraphicId: graphic,
      code: 'FROZEN_CODE',
      durationSeconds: 6.5,
      fps: 30,
      width: 1920,
      height: 1080,
      runtimeVersion: '4.0.443',
      sourceVersion: 1,
      sortOrder: 0,
    });
    expect(result.snapshotId).toBe(snapshotId);
    expect(result.mediaId).toBe(mediaId);

    const joined = await findBlockMediaSnapshot(mediaId);
    expect(joined).not.toBeNull();
    expect(joined!.mediaId).toBe(mediaId);
    expect(joined!.blockId).toBe(block);
    expect(joined!.mediaType).toBe('motion_graphic');
    expect(joined!.fileId).toBeNull();
    expect(joined!.snapshot.id).toBe(snapshotId);
    expect(joined!.snapshot.code).toBe('FROZEN_CODE');
    expect(Number(joined!.snapshot.durationSeconds)).toBeCloseTo(6.5, 2);
  });

  it('keeps the snapshot byte-identical after the source is mutated then soft-deleted (AC-10)', async () => {
    const graphic = await seedGraphic(USER_A, { code: 'ORIGINAL', duration_seconds: 2.0 });
    const draft = await seedDraft(USER_A);
    const block = await seedBlock(draft);

    const snapshotId = newId('snap');
    const mediaId = newId('media');
    trackedSnapshotIds.push(snapshotId);
    trackedMediaIds.push(mediaId);

    await insertBlockSnapshotWithMedia({
      snapshotId,
      mediaId,
      blockId: block,
      sourceMotionGraphicId: graphic,
      code: 'ORIGINAL',
      durationSeconds: 2.0,
      fps: 30,
      width: 1920,
      height: 1080,
      runtimeVersion: '4.0.443',
      sourceVersion: 1,
      sortOrder: 0,
    });

    // mutate + soft-delete the SOURCE graphic
    await conn.execute(
      `UPDATE motion_graphics SET code = 'MUTATED', duration_seconds = 9.99, deleted_at = NOW(3) WHERE id = ?`,
      [graphic],
    );

    const joined = await findBlockMediaSnapshot(mediaId);
    expect(joined!.snapshot.code).toBe('ORIGINAL');
    expect(Number(joined!.snapshot.durationSeconds)).toBeCloseTo(2.0, 2);
  });
});
