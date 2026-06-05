/**
 * Integration tests — POST /storyboards/:draftId/history as the checkpoint push.
 *
 * storyboard-autosave-checkpoints T5 (AC-03, AC-04, AC-07, AC-12 — server half):
 *   - push with previewKind 'screenshot' → 201 {id}; row stamped
 *     origin='checkpoint', preview_kind='screenshot' (server stamp, ADR-0003)
 *   - push with previewKind 'minimap' (capture-failure fallback, AC-04) → row
 *     stamped accordingly — a checkpoint is never silently dropped
 *   - missing / invalid previewKind → 400 (CheckpointPush requires it)
 *   - non-owner → 403 (existing ownership rule on the path)
 *   - prune across MIXED origins: the 50-cap applies to all rows of the draft
 *     together — legacy rows age out (spec non-goal: no legacy cleanup)
 *   - plan-apply server-side insert writes explicit origin='checkpoint' +
 *     preview_kind='minimap' (insertHistoryAndPruneInTx — task T5 default)
 *
 * Requires a live MySQL instance (docker compose up db).
 *
 * Run: cd apps/api && APP_DB_PASSWORD=cliptale npx vitest run
 *       src/__tests__/integration/checkpoint-push-endpoints.test.ts
 */
import { randomUUID, createHash } from 'node:crypto';

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import mysql, { type Connection, type RowDataPacket } from 'mysql2/promise';

// ── Mock S3 — not used by history endpoints; needed to load the app ──────────
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/presigned-test-url'),
}));

vi.mock('@/lib/s3.js', () => ({
  s3Client: { send: vi.fn().mockResolvedValue({}) },
}));

// ── Env vars must be set before app import ────────────────────────────────────
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
  APP_JWT_SECRET:           'checkpoint-push-test-secret-32chars!',
  APP_DEV_AUTH_BYPASS:      'false',
});

// ─────────────────────────────────────────────────────────────────────────────

let app: Express;
let conn: Connection;

const ownerId = `t5o-${randomUUID().slice(0, 8)}`;
const otherId = `t5x-${randomUUID().slice(0, 8)}`;
const ownerToken = `tok-t5o-${randomUUID()}`;
const otherToken = `tok-t5x-${randomUUID()}`;
const draftId = randomUUID();
const pruneDraftId = randomUUID();
const txDraftId = randomUUID();

const SNAPSHOT = { blocks: [], edges: [], screenshot: 'data:image/jpeg;base64,abc' };

async function seedSession(userId: string, token: string): Promise<void> {
  await conn.execute(
    'INSERT INTO sessions (session_id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
    [randomUUID(), userId, createHash('sha256').update(token).digest('hex'),
     new Date(Date.now() + 3_600_000)],
  );
}

beforeAll(async () => {
  const mod = await import('../../index.js');
  app = mod.default;

  conn = await mysql.createConnection({
    host:     process.env['APP_DB_HOST']     ?? 'localhost',
    port:     Number(process.env['APP_DB_PORT'] ?? 3306),
    database: process.env['APP_DB_NAME']     ?? 'cliptale',
    user:     process.env['APP_DB_USER']     ?? 'cliptale',
    password: process.env['APP_DB_PASSWORD'] ?? 'cliptale',
  });

  for (const [uid, name] of [[ownerId, 'T5 Owner'], [otherId, 'T5 Other']] as const) {
    await conn.execute(
      `INSERT INTO users (user_id, email, display_name, email_verified)
       VALUES (?, ?, ?, 1)`,
      [uid, `${uid}@example.test`, name],
    );
  }
  await seedSession(ownerId, ownerToken);
  await seedSession(otherId, otherToken);

  for (const did of [draftId, pruneDraftId, txDraftId]) {
    await conn.execute(
      'INSERT INTO generation_drafts (id, user_id, prompt_doc) VALUES (?, ?, ?)',
      [did, ownerId, JSON.stringify({ schemaVersion: 1, blocks: [] })],
    );
  }
});

afterAll(async () => {
  for (const did of [draftId, pruneDraftId, txDraftId]) {
    await conn.execute('DELETE FROM storyboard_history WHERE draft_id = ?', [did]);
    await conn.execute('DELETE FROM generation_drafts WHERE id = ?', [did]);
  }
  await conn.execute('DELETE FROM users WHERE user_id IN (?, ?)', [ownerId, otherId]);
  await conn.end();
});

// ── Server stamp (ADR-0003) ───────────────────────────────────────────────────

describe('POST /storyboards/:draftId/history — checkpoint stamp', () => {
  it('previewKind screenshot → 201 {id}; row origin=checkpoint, preview_kind=screenshot', async () => {
    const res = await request(app)
      .post(`/storyboards/${draftId}/history`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ snapshot: SNAPSHOT, previewKind: 'screenshot' });
    expect(res.status).toBe(201);
    expect(typeof res.body.id).toBe('number');

    const [rows] = await conn.execute<RowDataPacket[]>(
      'SELECT origin, preview_kind FROM storyboard_history WHERE id = ?',
      [res.body.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!['origin']).toBe('checkpoint');
    expect(rows[0]!['preview_kind']).toBe('screenshot');
  });

  it('previewKind minimap (AC-04 fallback) → row preview_kind=minimap', async () => {
    const res = await request(app)
      .post(`/storyboards/${draftId}/history`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ snapshot: { blocks: [], edges: [] }, previewKind: 'minimap' });
    expect(res.status).toBe(201);

    const [rows] = await conn.execute<RowDataPacket[]>(
      'SELECT origin, preview_kind FROM storyboard_history WHERE id = ?',
      [res.body.id],
    );
    expect(rows[0]!['origin']).toBe('checkpoint');
    expect(rows[0]!['preview_kind']).toBe('minimap');
  });
});

// ── Validation (CheckpointPush requires previewKind) ──────────────────────────

describe('POST /storyboards/:draftId/history — validation', () => {
  it('missing previewKind → 400', async () => {
    const res = await request(app)
      .post(`/storyboards/${draftId}/history`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ snapshot: SNAPSHOT });
    expect(res.status).toBe(400);
  });

  it('invalid previewKind → 400', async () => {
    const res = await request(app)
      .post(`/storyboards/${draftId}/history`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ snapshot: SNAPSHOT, previewKind: 'thumbnail' });
    expect(res.status).toBe(400);
  });

  it('non-owner → 403', async () => {
    const res = await request(app)
      .post(`/storyboards/${draftId}/history`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ snapshot: SNAPSHOT, previewKind: 'screenshot' });
    expect(res.status).toBe(403);
  });
});

// ── Prune across mixed origins (50-cap is origin-agnostic) ────────────────────

describe('POST /storyboards/:draftId/history — mixed-origin prune', () => {
  it('cap 50 applies to legacy + checkpoint rows together; oldest legacy age out', async () => {
    // Seed 49 legacy rows (origin defaults to 'legacy').
    const values = Array.from({ length: 49 }, () => `('${pruneDraftId}', JSON_OBJECT())`);
    await conn.query(
      `INSERT INTO storyboard_history (draft_id, snapshot) VALUES ${values.join(', ')}`,
    );
    const [oldest] = await conn.execute<RowDataPacket[]>(
      'SELECT MIN(id) AS minId FROM storyboard_history WHERE draft_id = ?',
      [pruneDraftId],
    );
    const oldestLegacyId = Number(oldest[0]!['minId']);

    // Two checkpoint pushes → 51 rows → prune to 50.
    for (let i = 0; i < 2; i++) {
      const res = await request(app)
        .post(`/storyboards/${pruneDraftId}/history`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ snapshot: { blocks: [], edges: [] }, previewKind: 'screenshot' });
      expect(res.status).toBe(201);
    }

    const [count] = await conn.execute<RowDataPacket[]>(
      'SELECT COUNT(*) AS n FROM storyboard_history WHERE draft_id = ?',
      [pruneDraftId],
    );
    expect(Number(count[0]!['n'])).toBe(50);

    // The pruned row is the OLDEST one — a legacy row, not a checkpoint.
    const [gone] = await conn.execute<RowDataPacket[]>(
      'SELECT id FROM storyboard_history WHERE id = ?',
      [oldestLegacyId],
    );
    expect(gone).toHaveLength(0);
  });
});

// ── Plan-apply server-side insert (explicit origin — T5 default) ──────────────

describe('insertHistoryAndPruneInTx — explicit origin for plan-apply', () => {
  it('writes origin=checkpoint, preview_kind=minimap', async () => {
    const { pool } = await import('@/db/connection.js');
    const { insertHistoryAndPruneInTx } = await import(
      '@/repositories/storyboardHistory.repository.js'
    );

    const txConn = await pool.getConnection();
    try {
      await txConn.beginTransaction();
      const id = await insertHistoryAndPruneInTx(
        txConn,
        txDraftId,
        { blocks: [], edges: [] },
        50,
      );
      await txConn.commit();

      const [rows] = await conn.execute<RowDataPacket[]>(
        'SELECT origin, preview_kind FROM storyboard_history WHERE id = ?',
        [id],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!['origin']).toBe('checkpoint');
      expect(rows[0]!['preview_kind']).toBe('minimap');
    } finally {
      txConn.release();
    }
  });
});
