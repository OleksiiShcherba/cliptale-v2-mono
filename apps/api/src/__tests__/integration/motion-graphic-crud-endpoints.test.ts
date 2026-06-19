/**
 * Integration tests for motionGraphic.routes.ts + motionGraphic.controller.ts (T10).
 *
 * Level: integration (real MySQL 8, real session-based auth, supertest mini-app).
 * The router is mounted on its OWN minimal Express app here. The central errorHandler
 * is reused from index.js so the `{ error, code, details }` envelope matches reality.
 *
 * The six non-streaming CRUD operations per
 * docs/features/ai-motion-graphic/contracts/openapi.yaml:
 *   GET    /motion-graphics                  list (owner-scoped, newest-first) — AC-13
 *   POST   /motion-graphics                  create (ready/failed verdict)     — AC-01/AC-06
 *   GET    /motion-graphics/{id}             get (code + chat)                 — AC-02
 *   PATCH  /motion-graphics/{id}             rename
 *   POST   /motion-graphics/{id}/turns       append-turn (ready→update/failed→keep) — AC-03/AC-14
 *   POST   /motion-graphics/{id}/duplicate   duplicate (copied turns)          — AC-12
 *
 * Existence hiding (AC-07): a non-owner / absent graphic → opaque 404, indistinguishable.
 *
 * Run:
 *   cd apps/api && APP_DB_PASSWORD=cliptale \
 *     npx vitest run src/__tests__/integration/motion-graphic-crud-endpoints.test.ts
 */
import { createHash, randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import mysql, { type Connection } from 'mysql2/promise';

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
  APP_JWT_SECRET:           'mg-t10-integ-test-secret-exactly-32ch!',
  APP_DEV_AUTH_BYPASS:      'false',
});

import express from 'express';
import { config } from '../../config.js';
import { errorHandler } from '../../index.js';
import { motionGraphicRouter } from '../../routes/motionGraphic.routes.js';

function sha256(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const PREFIX = 'mg-t10';
const OWNER_ID = `${PREFIX}-owner-${randomUUID().slice(0, 8)}`;
const OTHER_ID = `${PREFIX}-other-${randomUUID().slice(0, 8)}`;
const OWNER_TOKEN = `tok-${PREFIX}-owner-${randomUUID()}`;
const OTHER_TOKEN = `tok-${PREFIX}-other-${randomUUID()}`;
const OWNER_SESSION = randomUUID();
const OTHER_SESSION = randomUUID();

const ownerAuth = `Bearer ${OWNER_TOKEN}`;
const otherAuth = `Bearer ${OTHER_TOKEN}`;

const SAMPLE_CODE = 'export const MotionGraphic = () => { const f = useCurrentFrame(); return null; };';

let app: Express;
let conn: Connection;

const createdGraphicIds = new Set<string>();

/** Track a graphic id returned by the API for afterAll cleanup. */
function track(id: string): string {
  if (id) createdGraphicIds.add(id);
  return id;
}

beforeAll(async () => {
  // Order-independence: force the real auth path regardless of a leaked
  // APP_DEV_AUTH_BYPASS=true from a prior test file (config is parsed at import time).
  config.auth.devAuthBypass = false;

  conn = await mysql.createConnection({
    host:     process.env['APP_DB_HOST'],
    port:     Number(process.env['APP_DB_PORT']),
    database: process.env['APP_DB_NAME'],
    user:     process.env['APP_DB_USER'],
    password: process.env['APP_DB_PASSWORD'],
  });

  await conn.execute(
    `INSERT IGNORE INTO users (user_id, email, display_name, email_verified) VALUES (?, ?, ?, 1)`,
    [OWNER_ID, `${OWNER_ID}@example.test`, 'Owner'],
  );
  await conn.execute(
    `INSERT IGNORE INTO users (user_id, email, display_name, email_verified) VALUES (?, ?, ?, 1)`,
    [OTHER_ID, `${OTHER_ID}@example.test`, 'Other'],
  );
  await conn.execute(
    `INSERT INTO sessions (session_id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`,
    [OWNER_SESSION, OWNER_ID, sha256(OWNER_TOKEN), new Date(Date.now() + 3_600_000)],
  );
  await conn.execute(
    `INSERT INTO sessions (session_id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`,
    [OTHER_SESSION, OTHER_ID, sha256(OTHER_TOKEN), new Date(Date.now() + 3_600_000)],
  );

  app = express();
  app.use(express.json());
  app.use(motionGraphicRouter);
  app.use(errorHandler);
});

afterAll(async () => {
  const ids = [...createdGraphicIds];
  if (ids.length) {
    const ph = ids.map(() => '?').join(',');
    await conn.query(
      `DELETE FROM motion_graphic_chat_turns WHERE motion_graphic_id IN (${ph})`,
      ids,
    );
    await conn.query(`DELETE FROM motion_graphics WHERE id IN (${ph})`, ids);
  }
  await conn.query(`DELETE FROM sessions WHERE session_id IN (?, ?)`, [OWNER_SESSION, OTHER_SESSION]);
  await conn.query(`DELETE FROM users WHERE user_id IN (?, ?)`, [OWNER_ID, OTHER_ID]);
  await conn.end();
  const { pool } = await import('@/db/connection.js');
  await pool.end();
});

/** Helper: create a ready graphic via the API and return its body. */
async function createReady(
  auth: string,
  overrides: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const res = await request(app)
    .post('/motion-graphics')
    .set('Authorization', auth)
    .send({
      prompt: 'A lower-third sliding in the guest name over 4 seconds.',
      durationSeconds: 4.5,
      outcome: 'ready',
      code: SAMPLE_CODE,
      ...overrides,
    });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  track(res.body.id as string);
  return res.body as Record<string, unknown>;
}

// ── POST /motion-graphics — create (AC-01 ready / AC-06 failed) ─────────────────

describe('POST /motion-graphics — create', () => {
  it('outcome=ready → 201 with status ready, code stored, version 1, chat turns', async () => {
    const body = await createReady(ownerAuth, { title: 'Lower third' });

    expect(body.status).toBe('ready');
    expect(body.code).toBe(SAMPLE_CODE);
    expect(body.version).toBe(1);
    expect(body.title).toBe('Lower third');
    expect(Array.isArray(body.chatTurns)).toBe(true);
    expect((body.chatTurns as unknown[]).length).toBe(2);
  });

  it('outcome=failed → 201 with status failed and null code (AC-06)', async () => {
    const res = await request(app)
      .post('/motion-graphics')
      .set('Authorization', ownerAuth)
      .send({
        prompt: 'something that did not work',
        durationSeconds: 3,
        outcome: 'failed',
        errorMessage: 'transpile error',
      });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    track(res.body.id as string);
    expect(res.body.status).toBe('failed');
    expect(res.body.code).toBeNull();
  });

  it('invalid body (missing outcome) → 400', async () => {
    const res = await request(app)
      .post('/motion-graphics')
      .set('Authorization', ownerAuth)
      .send({ prompt: 'x', durationSeconds: 3 });
    expect(res.status, JSON.stringify(res.body)).toBe(400);
  });

  it('no auth → 401', async () => {
    const res = await request(app)
      .post('/motion-graphics')
      .send({ prompt: 'x', durationSeconds: 3, outcome: 'ready', code: SAMPLE_CODE });
    expect(res.status).toBe(401);
  });
});

// ── GET /motion-graphics — list owner-scoped, newest-first (AC-13) ─────────────

describe('GET /motion-graphics — list', () => {
  it('returns only my graphics, newest-first, with nextCursor', async () => {
    const first = await createReady(ownerAuth, { title: 'older' });
    const second = await createReady(ownerAuth, { title: 'newer' });
    // a graphic owned by someone else must NOT appear
    await createReady(otherAuth, { title: 'not mine' });

    const res = await request(app)
      .get('/motion-graphics')
      .set('Authorization', ownerAuth);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body).toHaveProperty('nextCursor');

    const ids = (res.body.items as Array<{ id: string }>).map((i) => i.id);
    expect(ids).toContain(first.id);
    expect(ids).toContain(second.id);

    // newest-first: 'newer' appears before 'older'
    expect(ids.indexOf(second.id as string)).toBeLessThan(ids.indexOf(first.id as string));

    // owner-scoping: the other user's graphic is absent
    const titles = (res.body.items as Array<{ title: string }>).map((i) => i.title);
    expect(titles).not.toContain('not mine');

    // summary shape: no code / chatTurns on list items
    const item = (res.body.items as Array<Record<string, unknown>>)[0]!;
    expect(item).not.toHaveProperty('code');
    expect(item).not.toHaveProperty('chatTurns');
  });
});

// ── GET /motion-graphics/{id} — get (AC-02 + AC-07) ────────────────────────────

describe('GET /motion-graphics/{id} — get', () => {
  it('owner → 200 with code + chat history', async () => {
    const created = await createReady(ownerAuth);
    const res = await request(app)
      .get(`/motion-graphics/${created.id}`)
      .set('Authorization', ownerAuth);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.id).toBe(created.id);
    expect(res.body.code).toBe(SAMPLE_CODE);
    expect((res.body.chatTurns as unknown[]).length).toBe(2);
  });

  it('someone-else’s graphic → 404, indistinguishable from absent (AC-07)', async () => {
    const created = await createReady(ownerAuth);

    const nonOwner = await request(app)
      .get(`/motion-graphics/${created.id}`)
      .set('Authorization', otherAuth);
    const ghost = await request(app)
      .get(`/motion-graphics/${randomUUID()}`)
      .set('Authorization', otherAuth);

    expect(nonOwner.status).toBe(404);
    expect(ghost.status).toBe(404);
    // Existence hiding (AC-07): a graphic owned by someone else answers EXACTLY like a
    // truly-absent one. The 404 body reflects only the id the caller already supplied in
    // the URL (no ownership/state leak), and both branches are byte-identical in shape:
    // bare `{ error }`, no machine `code`, nothing distinguishing "yours-but-hidden" from
    // "does not exist". (The id echo is the SAME requested id in both cases.)
    expect(nonOwner.body).not.toHaveProperty('code');
    expect(ghost.body).not.toHaveProperty('code');
    expect(Object.keys(nonOwner.body).sort()).toEqual(Object.keys(ghost.body).sort());
    // The owner's graphic content (the code) never leaks to a non-owner.
    expect(JSON.stringify(nonOwner.body)).not.toContain(SAMPLE_CODE);
  });
});

// ── PATCH /motion-graphics/{id} — rename ───────────────────────────────────────

describe('PATCH /motion-graphics/{id} — rename', () => {
  it('owner → 200, title updated', async () => {
    const created = await createReady(ownerAuth, { title: 'before' });
    const res = await request(app)
      .patch(`/motion-graphics/${created.id}`)
      .set('Authorization', ownerAuth)
      .send({ title: 'after' });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.title).toBe('after');
  });

  it('non-owner → 404 (no write performed)', async () => {
    const created = await createReady(ownerAuth, { title: 'keep' });
    const res = await request(app)
      .patch(`/motion-graphics/${created.id}`)
      .set('Authorization', otherAuth)
      .send({ title: 'hacked' });
    expect(res.status).toBe(404);

    // confirm unchanged
    const check = await request(app)
      .get(`/motion-graphics/${created.id}`)
      .set('Authorization', ownerAuth);
    expect(check.body.title).toBe('keep');
  });

  it('invalid body (empty title) → 400', async () => {
    const created = await createReady(ownerAuth);
    const res = await request(app)
      .patch(`/motion-graphics/${created.id}`)
      .set('Authorization', ownerAuth)
      .send({ title: '' });
    expect(res.status).toBe(400);
  });
});

// ── POST /motion-graphics/{id}/turns — append-turn (AC-03 / AC-14) ─────────────

describe('POST /motion-graphics/{id}/turns — append turn', () => {
  it('outcome=ready → code updated + version bumped (AC-03)', async () => {
    const created = await createReady(ownerAuth);
    const newCode = 'export const MotionGraphic = () => null; // v2';

    const res = await request(app)
      .post(`/motion-graphics/${created.id}/turns`)
      .set('Authorization', ownerAuth)
      .send({ instruction: 'make it blue', outcome: 'ready', code: newCode });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.code).toBe(newCode);
    expect(res.body.version).toBe(2);
    expect(res.body.status).toBe('ready');
  });

  it('outcome=failed → last working code/version kept (AC-14)', async () => {
    const created = await createReady(ownerAuth);

    const res = await request(app)
      .post(`/motion-graphics/${created.id}/turns`)
      .set('Authorization', ownerAuth)
      .send({ instruction: 'broken refine', outcome: 'failed', errorMessage: 'nope' });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    // code + version unchanged from the ready create
    expect(res.body.code).toBe(SAMPLE_CODE);
    expect(res.body.version).toBe(1);
    expect(res.body.status).toBe('ready');
    // the failed turn is still recorded
    const turns = res.body.chatTurns as Array<{ outcome: string | null }>;
    expect(turns.some((t) => t.outcome === 'failed')).toBe(true);
  });

  it('non-owner → 404 (AC-07)', async () => {
    const created = await createReady(ownerAuth);
    const res = await request(app)
      .post(`/motion-graphics/${created.id}/turns`)
      .set('Authorization', otherAuth)
      .send({ instruction: 'x', outcome: 'ready', code: 'y' });
    expect(res.status).toBe(404);
  });
});

// ── POST /motion-graphics/{id}/duplicate — duplicate (AC-12) ───────────────────

describe('POST /motion-graphics/{id}/duplicate — duplicate', () => {
  it('owner → 201 independent copy with copied turns (AC-12)', async () => {
    const created = await createReady(ownerAuth, { title: 'original' });

    const res = await request(app)
      .post(`/motion-graphics/${created.id}/duplicate`)
      .set('Authorization', ownerAuth);

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    track(res.body.id as string);
    expect(res.body.id).not.toBe(created.id);
    expect(res.body.code).toBe(SAMPLE_CODE);
    expect(String(res.body.title)).toContain('copy');
    // chat turns copied
    expect((res.body.chatTurns as unknown[]).length).toBe(2);
  });

  it('non-owner → 404 (AC-07)', async () => {
    const created = await createReady(ownerAuth);
    const res = await request(app)
      .post(`/motion-graphics/${created.id}/duplicate`)
      .set('Authorization', otherAuth);
    expect(res.status).toBe(404);
  });
});
