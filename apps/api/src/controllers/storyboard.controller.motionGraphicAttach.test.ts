/**
 * Integration tests for the Motion Graphic attach-to-block endpoint (T12).
 *
 * Drives the storyboard controller handler `attachMotionGraphic` against a REAL
 * MySQL 8 (real motionGraphic.service T6 + motionGraphic.repository T5 +
 * storyboard.service ownership guard) — only the Express req/res/next are faked.
 *
 * ACs covered:
 *   AC-04 / AC-10 — a READY graphic → 201 BlockMediaMotionGraphic; a frozen snapshot
 *                   row exists with code/duration COPIED (a later source refine cannot
 *                   alter the placed instance — proved by mutating the source after).
 *   AC-08        — a NON-ready (generating / failed) graphic → 422
 *                  `motion_graphic.not_ready` with details.status, and NO snapshot /
 *                  block-media row written.
 *   AC-07        — a graphic owned by ANOTHER user → 404 (existence hiding); a draft
 *                  not owned by the caller → the existing storyboard ownership answer.
 *
 * Run:
 *   cd apps/api && APP_DB_PASSWORD=cliptale \
 *     npx vitest run src/controllers/storyboard.controller.motionGraphicAttach.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mysql, { type Connection } from 'mysql2/promise';
import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

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
  APP_JWT_SECRET:           'mg-t12-integ-test-secret-exactly-32ch!',
  APP_DEV_AUTH_BYPASS:      'true',
});

import { attachMotionGraphic } from './storyboard.controller.js';
import { GateError, NotFoundError, ForbiddenError } from '@/lib/errors.js';

let conn: Connection;

const PREFIX = 'mg-t12';
const USER_A = `${PREFIX}-ua-${randomUUID().slice(0, 8)}`;
const USER_B = `${PREFIX}-ub-${randomUUID().slice(0, 8)}`;

const trackedGraphicIds: string[] = [];
const trackedDraftIds: string[] = [];
const trackedBlockIds: string[] = [];
const trackedSnapshotIds: string[] = [];
const trackedMediaIds: string[] = [];

const SAMPLE_CODE =
  "export const C = () => { const f = useCurrentFrame(); return <div>{f}</div>; };";

async function seedGraphic(
  userId: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const id = randomUUID();
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
  const draftId = randomUUID();
  trackedDraftIds.push(draftId);
  await conn.execute(
    `INSERT INTO generation_drafts (id, user_id, prompt_doc) VALUES (?, ?, ?)`,
    [draftId, userId, JSON.stringify({ text: 'Test prompt' })],
  );
  return draftId;
}

async function seedBlock(draftId: string): Promise<string> {
  const blockId = randomUUID();
  trackedBlockIds.push(blockId);
  await conn.execute(
    `INSERT INTO storyboard_blocks (id, draft_id, block_type, sort_order)
     VALUES (?, ?, 'scene', 0)`,
    [blockId, draftId],
  );
  return blockId;
}

// ── Express fakes ─────────────────────────────────────────────────────────────

function makeReq(userId: string, params: Record<string, string>, body: unknown): Request {
  return {
    params,
    body,
    query: {},
    headers: {},
    user: { userId, email: `${userId}@example.test`, displayName: 'Creator' },
  } as unknown as Request;
}

function makeRes(): {
  res: Response;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  statusCode: { value: number | null };
  body: { value: unknown };
} {
  const captured = { statusCode: { value: null as number | null }, body: { value: null as unknown } };
  const json = vi.fn((payload: unknown) => {
    captured.body.value = payload;
    return res;
  });
  const status = vi.fn((code: number) => {
    captured.statusCode.value = code;
    return res;
  });
  const res = { status, json } as unknown as Response;
  return { res, status, json, statusCode: captured.statusCode, body: captured.body };
}

function captureNext(): { next: NextFunction; err: { value: unknown } } {
  const holder = { value: null as unknown };
  const next = vi.fn((e?: unknown) => {
    holder.value = e ?? null;
  }) as unknown as NextFunction;
  return { next, err: holder };
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
  // children → parents. Sentinels are seeded by loadStoryboard; clear all media+blocks
  // for the tracked drafts to be safe.
  if (trackedDraftIds.length) {
    const ph = trackedDraftIds.map(() => '?').join(',');
    const [blockRows] = await conn.query<any[]>(
      `SELECT id FROM storyboard_blocks WHERE draft_id IN (${ph})`,
      trackedDraftIds,
    );
    const allBlockIds = (blockRows as Array<{ id: string }>).map((r) => r.id);
    if (allBlockIds.length) {
      const bph = allBlockIds.map(() => '?').join(',');
      await conn.query(`DELETE FROM storyboard_block_media WHERE block_id IN (${bph})`, allBlockIds);
    }
  }
  await del('storyboard_block_media', 'id', trackedMediaIds);
  await del('motion_graphic_block_snapshots', 'id', trackedSnapshotIds);
  if (trackedDraftIds.length) {
    const ph = trackedDraftIds.map(() => '?').join(',');
    await conn.query(`DELETE FROM storyboard_edges WHERE draft_id IN (${ph})`, trackedDraftIds);
    await conn.query(`DELETE FROM storyboard_blocks WHERE draft_id IN (${ph})`, trackedDraftIds);
  }
  await del('storyboard_blocks', 'id', trackedBlockIds);
  await del('generation_drafts', 'id', trackedDraftIds);
  await del('motion_graphics', 'id', trackedGraphicIds);
  await conn.query(`DELETE FROM users WHERE user_id IN (?, ?)`, [USER_A, USER_B]);
  await conn.end();
  const { pool } = await import('@/db/connection.js');
  await pool.end();
});

// ── AC-04 / AC-10 — ready graphic attaches a frozen snapshot ──────────────────

describe('attachMotionGraphic — ready graphic (AC-04/AC-10)', () => {
  it('returns 201 BlockMediaMotionGraphic and writes a frozen snapshot copy', async () => {
    const graphic = await seedGraphic(USER_A, { code: 'FROZEN_CODE', duration_seconds: 6.5, status: 'ready' });
    const draft = await seedDraft(USER_A);
    const block = await seedBlock(draft);

    const { res, statusCode, body } = makeRes();
    const { next, err } = captureNext();
    await attachMotionGraphic(
      makeReq(USER_A, { draftId: draft, blockId: block }, { motionGraphicId: graphic, sortOrder: 2 }),
      res,
      next,
    );

    expect(err.value).toBeNull();
    expect(statusCode.value).toBe(201);

    const payload = body.value as {
      id: string;
      blockId: string;
      mediaType: string;
      sortOrder: number;
      snapshot: { id: string; code: string; durationSeconds: number };
    };
    trackedMediaIds.push(payload.id);
    trackedSnapshotIds.push(payload.snapshot.id);

    expect(payload.blockId).toBe(block);
    expect(payload.mediaType).toBe('motion_graphic');
    expect((payload as { fileId?: unknown }).fileId ?? null).toBeNull();
    expect(payload.sortOrder).toBe(2);
    expect(payload.snapshot.code).toBe('FROZEN_CODE');
    expect(Number(payload.snapshot.durationSeconds)).toBeCloseTo(6.5, 2);

    // The snapshot row exists in the DB with the frozen copy.
    const [snapRows] = await conn.query<any[]>(
      `SELECT code, duration_seconds FROM motion_graphic_block_snapshots WHERE id = ?`,
      [payload.snapshot.id],
    );
    expect(snapRows.length).toBe(1);
    expect(snapRows[0].code).toBe('FROZEN_CODE');

    // AC-10: mutate the SOURCE graphic — the snapshot stays byte-identical.
    await conn.execute(
      `UPDATE motion_graphics SET code = 'MUTATED', duration_seconds = 9.99 WHERE id = ?`,
      [graphic],
    );
    const [afterRows] = await conn.query<any[]>(
      `SELECT code, duration_seconds FROM motion_graphic_block_snapshots WHERE id = ?`,
      [payload.snapshot.id],
    );
    expect(afterRows[0].code).toBe('FROZEN_CODE');
    expect(Number(afterRows[0].duration_seconds)).toBeCloseTo(6.5, 2);
  });
});

// ── AC-08 — non-ready graphic → 422 motion_graphic.not_ready, nothing written ─

describe('attachMotionGraphic — non-ready graphic (AC-08)', () => {
  for (const status of ['generating', 'failed'] as const) {
    it(`returns 422 motion_graphic.not_ready for a ${status} graphic and writes nothing`, async () => {
      const graphic = await seedGraphic(USER_A, {
        code: status === 'failed' ? null : SAMPLE_CODE,
        status,
      });
      const draft = await seedDraft(USER_A);
      const block = await seedBlock(draft);

      const { res, statusCode } = makeRes();
      const { next, err } = captureNext();
      await attachMotionGraphic(
        makeReq(USER_A, { draftId: draft, blockId: block }, { motionGraphicId: graphic }),
        res,
        next,
      );

      // 422 is surfaced via next(GateError) → the central error handler maps it.
      expect(statusCode.value).toBeNull();
      expect(err.value).toBeInstanceOf(GateError);
      const gate = err.value as GateError;
      expect(gate.code).toBe('motion_graphic.not_ready');
      expect(gate.details).toMatchObject({ status });

      // No snapshot / block-media row was written for this block.
      const [mediaRows] = await conn.query<any[]>(
        `SELECT id FROM storyboard_block_media WHERE block_id = ?`,
        [block],
      );
      expect(mediaRows.length).toBe(0);
      const [snapRows] = await conn.query<any[]>(
        `SELECT id FROM motion_graphic_block_snapshots WHERE source_motion_graphic_id = ?`,
        [graphic],
      );
      expect(snapRows.length).toBe(0);
    });
  }
});

// ── AC-07 — non-owner graphic → 404; non-owner draft → ownership answer ────────

describe('attachMotionGraphic — ownership (AC-07)', () => {
  it('returns 404 (NotFoundError) when the graphic is owned by another user', async () => {
    const graphic = await seedGraphic(USER_B, { status: 'ready' }); // owned by B
    const draft = await seedDraft(USER_A);
    const block = await seedBlock(draft);

    const { res, statusCode } = makeRes();
    const { next, err } = captureNext();
    await attachMotionGraphic(
      makeReq(USER_A, { draftId: draft, blockId: block }, { motionGraphicId: graphic }),
      res,
      next,
    );

    expect(statusCode.value).toBeNull();
    expect(err.value).toBeInstanceOf(NotFoundError);

    const [mediaRows] = await conn.query<any[]>(
      `SELECT id FROM storyboard_block_media WHERE block_id = ?`,
      [block],
    );
    expect(mediaRows.length).toBe(0);
  });

  it('refuses when the DRAFT is not owned by the caller (existing storyboard guard)', async () => {
    const graphic = await seedGraphic(USER_A, { status: 'ready' });
    const draft = await seedDraft(USER_B); // draft owned by B
    const block = await seedBlock(draft);

    const { res, statusCode } = makeRes();
    const { next, err } = captureNext();
    await attachMotionGraphic(
      makeReq(USER_A, { draftId: draft, blockId: block }, { motionGraphicId: graphic }),
      res,
      next,
    );

    expect(statusCode.value).toBeNull();
    // The existing storyboard ownership guard answers 403 ForbiddenError / 404 NotFoundError.
    expect(
      err.value instanceof ForbiddenError || err.value instanceof NotFoundError,
    ).toBe(true);
  });
});
