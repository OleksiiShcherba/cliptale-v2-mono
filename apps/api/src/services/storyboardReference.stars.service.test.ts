/**
 * Integration tests for storyboardReference.stars.service.ts — the WIRED stars
 * service (the one the controller actually calls).
 *
 * Ported from the now-deleted generation-flow.stars.service.test.ts (F8): that
 * suite only ever exercised a dead duplicate, so the production star path had no
 * genuine coverage. This suite targets `starResult` / `unstarResult` directly.
 *
 * ACs covered:
 *   AC-06 — star/unstar are idempotent versionless toggles; all starred results
 *            become the block's reference candidates; the primary starred result
 *            is the block preview. A file that is NOT a result of the block's
 *            linked flow is REFUSED (F7 — cross-tenant file leak).
 *   AC-07 — removing the primary star falls back to the earliest remaining star,
 *            or leaves the block in the no-preview placeholder state.
 *   AC-13 — every star/unstar by a non-owner is denied (NotFoundError, existence
 *            hiding).
 *
 * Run:
 *   cd apps/api && APP_DB_PASSWORD=cliptale APP_REDIS_URL=redis://localhost:6380 \
 *     npx vitest run src/services/storyboardReference.stars.service.test.ts
 */
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql, { type Connection } from 'mysql2/promise';

// ── Env bootstrap (must precede any app-module import) ────────────────────────
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
  APP_JWT_SECRET:           'srf-stars-integ-test-secret-exactly-32!',
  APP_DEV_AUTH_BYPASS:      'false',
});

// The WIRED service under test.
import { starResult, unstarResult } from './storyboardReference.stars.service.js';

// Repository helpers for assertions (T3).
import {
  listStarsForBlock,
  getPrimaryStarForBlock,
} from '@/repositories/storyboardReferenceCuration.repository.js';

// ── DB connection ─────────────────────────────────────────────────────────────

let conn: Connection;

const RUN = randomUUID().slice(0, 8);
const OWNER_ID = `srf-stars-owner-${RUN}`;
const OTHER_ID = `srf-stars-other-${RUN}`;

const cleanupBlockIds: string[] = [];
const cleanupDraftIds: string[] = [];
const cleanupFileIds:  string[] = [];
const cleanupFlowIds:  string[] = [];

// ── Seed helpers ──────────────────────────────────────────────────────────────

async function seedUser(userId: string): Promise<void> {
  await conn.execute(
    `INSERT IGNORE INTO users (user_id, email, password_hash) VALUES (?, ?, ?)`,
    [userId, `${userId}@example.test`, 'hash'],
  );
}

async function seedDraft(userId: string): Promise<string> {
  const draftId = `srf-stars-draft-${randomUUID().slice(0, 12)}`;
  await conn.execute(
    `INSERT INTO generation_drafts (id, user_id, prompt_doc) VALUES (?, ?, ?)`,
    [draftId, userId, JSON.stringify({ schemaVersion: 1, blocks: [] })],
  );
  cleanupDraftIds.push(draftId);
  return draftId;
}

async function seedFlow(userId: string): Promise<string> {
  const flowId = randomUUID();
  await conn.execute(
    `INSERT INTO generation_flows (flow_id, user_id, title, canvas, version)
     VALUES (?, ?, 'Test Reference Flow', '{"blocks":[],"edges":[]}', 1)`,
    [flowId, userId],
  );
  cleanupFlowIds.push(flowId);
  return flowId;
}

async function seedReferenceBlock(draftId: string, flowId: string | null): Promise<string> {
  const id = `srf-stars-block-${randomUUID().slice(0, 12)}`;
  await conn.execute(
    `INSERT INTO storyboard_reference_blocks
       (id, draft_id, flow_id, cast_type, name, description, sort_order,
        position_x, position_y, window_status, version)
     VALUES (?, ?, ?, 'character', 'Test Character', NULL, 0, 0, 0, NULL, 1)`,
    [id, draftId, flowId],
  );
  cleanupBlockIds.push(id);
  return id;
}

/** Seed a file row and link it to the given flow via flow_files. */
async function seedFlowResultFile(userId: string, flowId: string): Promise<string> {
  const fileId = `srf-stars-file-${randomUUID().slice(0, 12)}`;
  await conn.execute(
    `INSERT INTO files
       (file_id, user_id, kind, storage_uri, mime_type, display_name, status)
     VALUES (?, ?, 'image', ?, 'image/png', 'test-ref.png', 'ready')`,
    [fileId, userId, `s3://test-bucket/${fileId}.png`],
  );
  await conn.execute(
    `INSERT IGNORE INTO flow_files (flow_id, file_id) VALUES (?, ?)`,
    [flowId, fileId],
  );
  cleanupFileIds.push(fileId);
  return fileId;
}

/** Seed a file row that is NOT linked to any flow. */
async function seedUnlinkedFile(userId: string): Promise<string> {
  const fileId = `srf-stars-unlinked-${randomUUID().slice(0, 12)}`;
  await conn.execute(
    `INSERT INTO files
       (file_id, user_id, kind, storage_uri, mime_type, display_name, status)
     VALUES (?, ?, 'image', ?, 'image/png', 'unlinked.png', 'ready')`,
    [fileId, userId, `s3://test-bucket/${fileId}.png`],
  );
  cleanupFileIds.push(fileId);
  return fileId;
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
  await seedUser(OWNER_ID);
  await seedUser(OTHER_ID);
});

afterAll(async () => {
  if (cleanupBlockIds.length) {
    const ph = cleanupBlockIds.map(() => '?').join(',');
    await conn.query(`DELETE FROM storyboard_reference_blocks WHERE id IN (${ph})`, cleanupBlockIds);
  }
  if (cleanupDraftIds.length) {
    const ph = cleanupDraftIds.map(() => '?').join(',');
    await conn.query(`DELETE FROM generation_drafts WHERE id IN (${ph})`, cleanupDraftIds);
  }
  if (cleanupFlowIds.length) {
    const ph = cleanupFlowIds.map(() => '?').join(',');
    await conn.query(`DELETE FROM flow_files WHERE flow_id IN (${ph})`, cleanupFlowIds);
    await conn.query(`DELETE FROM generation_flows WHERE flow_id IN (${ph})`, cleanupFlowIds);
  }
  if (cleanupFileIds.length) {
    const ph = cleanupFileIds.map(() => '?').join(',');
    await conn.query(`DELETE FROM files WHERE file_id IN (${ph})`, cleanupFileIds);
  }
  await conn.execute('DELETE FROM users WHERE user_id = ?', [OWNER_ID]);
  await conn.execute('DELETE FROM users WHERE user_id = ?', [OTHER_ID]);
  await conn.end();
});

// ── AC-06: star/unstar idempotent toggle; primary designation ─────────────────

describe('AC-06: starResult — idempotent toggle; starred file becomes candidate', () => {
  it('starring a flow-result file records it as a candidate and returns it', async () => {
    const draftId = await seedDraft(OWNER_ID);
    const flowId  = await seedFlow(OWNER_ID);
    const blockId = await seedReferenceBlock(draftId, flowId);
    const fileId  = await seedFlowResultFile(OWNER_ID, flowId);

    const state = await starResult({ blockId, draftId, userId: OWNER_ID, fileId, isPrimary: false });

    expect(state.stars).toHaveLength(1);
    expect(state.stars[0]!.fileId).toBe(fileId);

    const stars = await listStarsForBlock(blockId);
    expect(stars).toHaveLength(1);
    expect(stars[0]!.fileId).toBe(fileId);
  });

  it('starring the same file twice is a no-op (idempotent — unique constraint)', async () => {
    const draftId = await seedDraft(OWNER_ID);
    const flowId  = await seedFlow(OWNER_ID);
    const blockId = await seedReferenceBlock(draftId, flowId);
    const fileId  = await seedFlowResultFile(OWNER_ID, flowId);

    await starResult({ blockId, draftId, userId: OWNER_ID, fileId, isPrimary: false });
    await starResult({ blockId, draftId, userId: OWNER_ID, fileId, isPrimary: false });

    const stars = await listStarsForBlock(blockId);
    expect(stars).toHaveLength(1);
  });

  it('designating isPrimary=true sets the file as the block preview (at most one primary)', async () => {
    const draftId = await seedDraft(OWNER_ID);
    const flowId  = await seedFlow(OWNER_ID);
    const blockId = await seedReferenceBlock(draftId, flowId);
    const fileA   = await seedFlowResultFile(OWNER_ID, flowId);
    const fileB   = await seedFlowResultFile(OWNER_ID, flowId);

    await starResult({ blockId, draftId, userId: OWNER_ID, fileId: fileA, isPrimary: true });
    const state = await starResult({ blockId, draftId, userId: OWNER_ID, fileId: fileB, isPrimary: false });

    expect(state.previewFileId).toBe(fileA);

    const primary = await getPrimaryStarForBlock(blockId);
    expect(primary!.fileId).toBe(fileA);
    const stars = await listStarsForBlock(blockId);
    expect(stars.filter((s) => s.isPrimary)).toHaveLength(1);
  });

  it('promoting a second file to primary demotes the first (unique primary per block)', async () => {
    const draftId = await seedDraft(OWNER_ID);
    const flowId  = await seedFlow(OWNER_ID);
    const blockId = await seedReferenceBlock(draftId, flowId);
    const fileA   = await seedFlowResultFile(OWNER_ID, flowId);
    const fileB   = await seedFlowResultFile(OWNER_ID, flowId);

    await starResult({ blockId, draftId, userId: OWNER_ID, fileId: fileA, isPrimary: true });
    const state = await starResult({ blockId, draftId, userId: OWNER_ID, fileId: fileB, isPrimary: true });

    expect(state.previewFileId).toBe(fileB);
    const stars = await listStarsForBlock(blockId);
    expect(stars.filter((s) => s.isPrimary)).toHaveLength(1);
  });

  // ── F7: cross-tenant file leak ──────────────────────────────────────────────
  it('starring a file NOT linked to the block flow is refused (F7)', async () => {
    const draftId       = await seedDraft(OWNER_ID);
    const flowId        = await seedFlow(OWNER_ID);
    const blockId       = await seedReferenceBlock(draftId, flowId);
    const foreignFileId = await seedUnlinkedFile(OWNER_ID); // exists, but not in flowId's flow_files

    const { NotFoundError } = await import('@/lib/errors.js');

    await expect(
      starResult({ blockId, draftId, userId: OWNER_ID, fileId: foreignFileId, isPrimary: false }),
    ).rejects.toBeInstanceOf(NotFoundError);

    const stars = await listStarsForBlock(blockId);
    expect(stars).toHaveLength(0);
  });

  it('starring a private file from ANOTHER tenant\'s flow is refused (F7 cross-tenant)', async () => {
    // Owner's block + flow.
    const draftId = await seedDraft(OWNER_ID);
    const flowId  = await seedFlow(OWNER_ID);
    const blockId = await seedReferenceBlock(draftId, flowId);

    // A different tenant's flow with its own private result file.
    const otherFlowId = await seedFlow(OTHER_ID);
    const otherFileId = await seedFlowResultFile(OTHER_ID, otherFlowId);

    const { NotFoundError } = await import('@/lib/errors.js');

    await expect(
      starResult({ blockId, draftId, userId: OWNER_ID, fileId: otherFileId, isPrimary: true }),
    ).rejects.toBeInstanceOf(NotFoundError);

    const stars = await listStarsForBlock(blockId);
    expect(stars).toHaveLength(0);
  });
});

// ── AC-07: primary removal fallback ───────────────────────────────────────────

describe('AC-07: primary removal fallback (wired unstarResult)', () => {
  it('unstarring the primary with another star falls back to the earliest remaining star', async () => {
    const draftId = await seedDraft(OWNER_ID);
    const flowId  = await seedFlow(OWNER_ID);
    const blockId = await seedReferenceBlock(draftId, flowId);
    const fileA   = await seedFlowResultFile(OWNER_ID, flowId);
    const fileB   = await seedFlowResultFile(OWNER_ID, flowId);

    await starResult({ blockId, draftId, userId: OWNER_ID, fileId: fileA, isPrimary: true });
    await starResult({ blockId, draftId, userId: OWNER_ID, fileId: fileB, isPrimary: false });

    const state = await unstarResult({ blockId, draftId, userId: OWNER_ID, fileId: fileA });

    expect(state.previewFileId).toBe(fileB);
    const primary = await getPrimaryStarForBlock(blockId);
    expect(primary!.fileId).toBe(fileB);
  });

  it('unstarring the only star leaves the block with no preview (placeholder)', async () => {
    const draftId = await seedDraft(OWNER_ID);
    const flowId  = await seedFlow(OWNER_ID);
    const blockId = await seedReferenceBlock(draftId, flowId);
    const fileId  = await seedFlowResultFile(OWNER_ID, flowId);

    await starResult({ blockId, draftId, userId: OWNER_ID, fileId, isPrimary: true });
    const state = await unstarResult({ blockId, draftId, userId: OWNER_ID, fileId });

    expect(state.stars).toHaveLength(0);
    expect(state.previewFileId).toBeNull();
  });
});

// ── AC-13: authorization — non-owner denied without revealing contents ─────────

describe('AC-13: authorization — non-owner denied (NotFoundError, existence hiding)', () => {
  it('star by a non-owner throws NotFoundError', async () => {
    const draftId = await seedDraft(OWNER_ID);
    const flowId  = await seedFlow(OWNER_ID);
    const blockId = await seedReferenceBlock(draftId, flowId);
    const fileId  = await seedFlowResultFile(OWNER_ID, flowId);

    const { NotFoundError } = await import('@/lib/errors.js');

    await expect(
      starResult({ blockId, draftId, userId: OTHER_ID, fileId, isPrimary: false }),
    ).rejects.toBeInstanceOf(NotFoundError);

    const stars = await listStarsForBlock(blockId);
    expect(stars).toHaveLength(0);
  });

  it('unstar by a non-owner throws NotFoundError and leaves the star intact', async () => {
    const draftId = await seedDraft(OWNER_ID);
    const flowId  = await seedFlow(OWNER_ID);
    const blockId = await seedReferenceBlock(draftId, flowId);
    const fileId  = await seedFlowResultFile(OWNER_ID, flowId);

    await starResult({ blockId, draftId, userId: OWNER_ID, fileId, isPrimary: false });

    const { NotFoundError } = await import('@/lib/errors.js');

    await expect(
      unstarResult({ blockId, draftId, userId: OTHER_ID, fileId }),
    ).rejects.toBeInstanceOf(NotFoundError);

    const stars = await listStarsForBlock(blockId);
    expect(stars).toHaveLength(1);
  });

  it('star on a block that does not exist throws NotFoundError', async () => {
    const draftId       = await seedDraft(OWNER_ID);
    const absentBlockId = randomUUID();
    const fileId        = await seedUnlinkedFile(OWNER_ID);

    const { NotFoundError } = await import('@/lib/errors.js');

    await expect(
      starResult({ blockId: absentBlockId, draftId, userId: OWNER_ID, fileId, isPrimary: false }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
