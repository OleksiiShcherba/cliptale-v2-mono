/**
 * Integration tests — GET /storyboards/:draftId/history as the checkpoint list.
 *
 * storyboard-autosave-checkpoints T6 (AC-08, AC-13):
 *   - returns ONLY origin=checkpoint entries, newest first, each with
 *     previewKind exposed (HistoryEntry contract)
 *   - legacy rows are filtered out at the query level but REMAIN stored
 *     (spec non-goal: no legacy cleanup)
 *   - at most 50 entries (HISTORY_CAP)
 *   - non-owner → 403 (AC-13)
 *
 * Requires a live MySQL instance (docker compose up db).
 *
 * Run: cd apps/api && APP_DB_PASSWORD=cliptale npx vitest run
 *       src/__tests__/integration/checkpoint-history-list.test.ts
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
  APP_JWT_SECRET:           'checkpoint-list-test-secret-32chars!',
  APP_DEV_AUTH_BYPASS:      'false',
});

// ─────────────────────────────────────────────────────────────────────────────

let app: Express;
let conn: Connection;

const ownerId = `t6o-${randomUUID().slice(0, 8)}`;
const otherId = `t6x-${randomUUID().slice(0, 8)}`;
const ownerToken = `tok-t6o-${randomUUID()}`;
const otherToken = `tok-t6x-${randomUUID()}`;
const draftId = randomUUID();
const capDraftId = randomUUID();

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

  for (const [uid, name] of [[ownerId, 'T6 Owner'], [otherId, 'T6 Other']] as const) {
    await conn.execute(
      `INSERT INTO users (user_id, email, display_name, email_verified)
       VALUES (?, ?, ?, 1)`,
      [uid, `${uid}@example.test`, name],
    );
  }
  await seedSession(ownerId, ownerToken);
  await seedSession(otherId, otherToken);

  for (const did of [draftId, capDraftId]) {
    await conn.execute(
      'INSERT INTO generation_drafts (id, user_id, prompt_doc) VALUES (?, ?, ?)',
      [did, ownerId, JSON.stringify({ schemaVersion: 1, blocks: [] })],
    );
  }

  // Mixed history for draftId: 3 legacy + 2 checkpoint (screenshot, then minimap newest).
  await conn.query(
    `INSERT INTO storyboard_history (draft_id, snapshot, origin, preview_kind) VALUES
     ('${draftId}', JSON_OBJECT('tag','legacy1'),  'legacy',     NULL),
     ('${draftId}', JSON_OBJECT('tag','legacy2'),  'legacy',     NULL),
     ('${draftId}', JSON_OBJECT('tag','cp1'),      'checkpoint', 'screenshot'),
     ('${draftId}', JSON_OBJECT('tag','legacy3'),  'legacy',     NULL),
     ('${draftId}', JSON_OBJECT('tag','cp2'),      'checkpoint', 'minimap')`,
  );

  // 55 checkpoint rows for the cap check.
  const values = Array.from({ length: 55 }, (_, i) =>
    `('${capDraftId}', JSON_OBJECT('i', ${i}), 'checkpoint', 'screenshot')`);
  await conn.query(
    `INSERT INTO storyboard_history (draft_id, snapshot, origin, preview_kind)
     VALUES ${values.join(', ')}`,
  );
});

afterAll(async () => {
  for (const did of [draftId, capDraftId]) {
    await conn.execute('DELETE FROM storyboard_history WHERE draft_id = ?', [did]);
    await conn.execute('DELETE FROM generation_drafts WHERE id = ?', [did]);
  }
  await conn.execute('DELETE FROM users WHERE user_id IN (?, ?)', [ownerId, otherId]);
  await conn.end();
});

// ── Checkpoint-only filter + previewKind (AC-08) ──────────────────────────────

describe('GET /storyboards/:draftId/history — checkpoint filter', () => {
  it('returns only origin=checkpoint entries, newest first, with previewKind', async () => {
    const res = await request(app)
      .get(`/storyboards/${draftId}/history`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);

    // Newest first: cp2 (minimap) inserted after cp1 (screenshot).
    expect(res.body[0].snapshot).toEqual({ tag: 'cp2' });
    expect(res.body[0].previewKind).toBe('minimap');
    expect(res.body[1].snapshot).toEqual({ tag: 'cp1' });
    expect(res.body[1].previewKind).toBe('screenshot');

    // No legacy entry leaks through.
    const tags = res.body.map((e: { snapshot: { tag: string } }) => e.snapshot.tag);
    expect(tags).not.toContain('legacy1');
  });

  it('legacy rows remain stored in the table (filtered, never deleted)', async () => {
    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM storyboard_history
        WHERE draft_id = ? AND origin = 'legacy'`,
      [draftId],
    );
    expect(Number(rows[0]!['n'])).toBe(3);
  });

  it('caps the list at 50 entries', async () => {
    const res = await request(app)
      .get(`/storyboards/${capDraftId}/history`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(50);
  });
});

// ── Authorization (AC-13) ─────────────────────────────────────────────────────

describe('GET /storyboards/:draftId/history — authorization', () => {
  it('non-owner gets 403', async () => {
    const res = await request(app)
      .get(`/storyboards/${draftId}/history`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(403);
  });
});
