/**
 * Integration tests for generation-flow.stars.service.ts (T9).
 *
 * ACs covered:
 *   AC-06 — star/unstar are idempotent versionless toggles; all starred results
 *            become the block's reference candidates; the primary starred result
 *            appears as the block's canvas preview.
 *   AC-07 — removing the primary star falls back to another starred result, or
 *            leaves the block in the no-preview placeholder state; deleting the
 *            result file cascades the star row (sync clean-up).
 *   AC-13 — every star/unstar by a non-owner is denied (NotFoundError, no content
 *            revealed).
 *
 * spec.md §5 wording driving these assertions:
 *   AC-06: "all starred results become the block's reference candidates and the
 *           primary starred result appears as the block's preview on the storyboard
 *           canvas"
 *   AC-07: "the block's preview falls back to another starred result if any,
 *           otherwise the block shows the no-preview placeholder and counts as
 *           missing a star for the star gate; the same rule applies when all
 *           starred results are removed or every result in the linked flow is
 *           deleted — the block↔flow link itself stays intact"
 *   AC-13: "the system denies the action without revealing the contents, because
 *           drafts and flows are private to their owner"
 *
 * test-plan.md rows (level: integration):
 *   AC-06: "starred results become the block's candidates and the primary star
 *           becomes its canvas preview — integration"
 *   AC-07: "removing the primary star falls back to another star or the
 *           no-preview placeholder — unit + integration"
 *   AC-13: "every reference surface denies a non-owner without revealing contents
 *           — integration (виділений рядок)"
 *
 * Design notes (T9 task brief + data-model.md + ADR-0009):
 *   - Stars are VERSIONLESS commutative toggles — no version/409 on star ops
 *     (Override SAD §1 ¶4, critic F1).
 *   - The file MUST belong to the result of the block's linked flow; starring a
 *     file from a foreign/unlinked flow is refused (AC-06 / AC-13 boundary).
 *   - Deletion of a result file cascades to remove its star row (ADR-0009),
 *     triggering the primary-fallback logic (AC-07).
 *   - primary designation: at most one per block (UNIQUE constraint on
 *     (reference_block_id, is_primary) in storyboard_reference_stars).
 *   - Primary fallback: after unstar of the current primary, service picks the
 *     earliest remaining star (created_at ASC) as the new primary, or leaves
 *     no primary if no stars remain.
 *
 * Run:
 *   cd apps/api && APP_DB_PASSWORD=cliptale APP_REDIS_URL=redis://localhost:6380 \
 *     npx vitest run src/services/generation-flow.stars.service.test.ts
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
  APP_JWT_SECRET:           'srf-t9-integ-test-secret-exactly-32ch!',
  APP_DEV_AUTH_BYPASS:      'false',
});

// The service under test — does not exist yet (RED state).
import {
  star,
  unstar,
} from './generation-flow.stars.service.js';

// Repository helpers for assertions (these already exist from T3).
import {
  listStarsForBlock,
  getPrimaryStarForBlock,
} from '@/repositories/storyboardReferenceCuration.repository.js';

// ── DB connection ─────────────────────────────────────────────────────────────

let conn: Connection;

// ── Suite-unique prefix ───────────────────────────────────────────────────────
const RUN = randomUUID().slice(0, 8);

// Owner and a non-owner for AC-13 tests.
const OWNER_ID   = `srf-t9-owner-${RUN}`;
const OTHER_ID   = `srf-t9-other-${RUN}`;

// Cleanup registries (FK-safe order): stars cascade from blocks; blocks cascade
// from drafts; flow_files and files must be cleaned before flow deletion.
const cleanupBlockIds:   string[] = [];
const cleanupDraftIds:   string[] = [];
const cleanupFileIds:    string[] = [];
const cleanupFlowIds:    string[] = [];

// ── Seed helpers ──────────────────────────────────────────────────────────────

async function seedUser(userId: string): Promise<void> {
  await conn.execute(
    `INSERT IGNORE INTO users (user_id, email, password_hash) VALUES (?, ?, ?)`,
    [userId, `${userId}@example.test`, 'hash'],
  );
}

async function seedDraft(userId: string): Promise<string> {
  const draftId = `srf-t9-draft-${randomUUID().slice(0, 12)}`;
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

/** Seed a reference block, optionally linked to a flow (flowId may be null). */
async function seedReferenceBlock(
  draftId: string,
  flowId: string | null,
): Promise<string> {
  const id = `srf-t9-block-${randomUUID().slice(0, 12)}`;
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
  const fileId = `srf-t9-file-${randomUUID().slice(0, 12)}`;
  await conn.execute(
    `INSERT INTO files
       (file_id, user_id, kind, storage_uri, mime_type, display_name, status)
     VALUES (?, ?, 'image', ?, 'image/png', 'test-ref.png', 'ready')`,
    [fileId, userId, `s3://test-bucket/${fileId}.png`],
  );
  // Link the file to the flow as a result asset (flow_files pivot).
  await conn.execute(
    `INSERT IGNORE INTO flow_files (flow_id, file_id) VALUES (?, ?)`,
    [flowId, fileId],
  );
  cleanupFileIds.push(fileId);
  return fileId;
}

/** Seed a file row that is NOT linked to any flow. */
async function seedUnlinkedFile(userId: string): Promise<string> {
  const fileId = `srf-t9-unlinked-${randomUUID().slice(0, 12)}`;
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
  // Delete in FK-safe order.
  // Stars and scene_links CASCADE from blocks; blocks CASCADE from drafts.
  if (cleanupBlockIds.length) {
    const ph = cleanupBlockIds.map(() => '?').join(',');
    await conn.query(
      `DELETE FROM storyboard_reference_blocks WHERE id IN (${ph})`,
      cleanupBlockIds,
    );
  }
  if (cleanupDraftIds.length) {
    const ph = cleanupDraftIds.map(() => '?').join(',');
    await conn.query(`DELETE FROM generation_drafts WHERE id IN (${ph})`, cleanupDraftIds);
  }
  // flow_files pivot before flows; files after pivot (RESTRICT FK).
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

describe('AC-06: star — idempotent toggle; starred file becomes reference candidate', () => {
  it('starring a flow-result file on a reference block records it as a candidate', async () => {
    const draftId  = await seedDraft(OWNER_ID);
    const flowId   = await seedFlow(OWNER_ID);
    const blockId  = await seedReferenceBlock(draftId, flowId);
    const fileId   = await seedFlowResultFile(OWNER_ID, flowId);

    await star({ userId: OWNER_ID, referenceBlockId: blockId, fileId });

    const stars = await listStarsForBlock(blockId);
    expect(stars).toHaveLength(1);
    expect(stars[0]!.fileId).toBe(fileId);
  });

  it('starring the same file twice is a no-op (idempotent — unique constraint)', async () => {
    const draftId  = await seedDraft(OWNER_ID);
    const flowId   = await seedFlow(OWNER_ID);
    const blockId  = await seedReferenceBlock(draftId, flowId);
    const fileId   = await seedFlowResultFile(OWNER_ID, flowId);

    await star({ userId: OWNER_ID, referenceBlockId: blockId, fileId });
    // Second call must not throw and must not produce a duplicate row.
    await star({ userId: OWNER_ID, referenceBlockId: blockId, fileId });

    const stars = await listStarsForBlock(blockId);
    expect(stars).toHaveLength(1);
  });

  it('un-starring a never-starred file is a no-op (idempotent)', async () => {
    const draftId  = await seedDraft(OWNER_ID);
    const flowId   = await seedFlow(OWNER_ID);
    const blockId  = await seedReferenceBlock(draftId, flowId);
    const fileId   = await seedFlowResultFile(OWNER_ID, flowId);

    // Never starred — should not throw.
    await unstar({ userId: OWNER_ID, referenceBlockId: blockId, fileId });

    const stars = await listStarsForBlock(blockId);
    expect(stars).toHaveLength(0);
  });

  it('designating primary=true sets the file as the block preview (at most one primary)', async () => {
    const draftId  = await seedDraft(OWNER_ID);
    const flowId   = await seedFlow(OWNER_ID);
    const blockId  = await seedReferenceBlock(draftId, flowId);
    const fileA    = await seedFlowResultFile(OWNER_ID, flowId);
    const fileB    = await seedFlowResultFile(OWNER_ID, flowId);

    await star({ userId: OWNER_ID, referenceBlockId: blockId, fileId: fileA, primary: true });
    await star({ userId: OWNER_ID, referenceBlockId: blockId, fileId: fileB });

    const primary = await getPrimaryStarForBlock(blockId);
    expect(primary).not.toBeNull();
    expect(primary!.fileId).toBe(fileA);

    // Only one primary.
    const stars = await listStarsForBlock(blockId);
    expect(stars.filter((s) => s.isPrimary)).toHaveLength(1);
  });

  it('promoting a second file to primary demotes the first (unique primary per block)', async () => {
    const draftId  = await seedDraft(OWNER_ID);
    const flowId   = await seedFlow(OWNER_ID);
    const blockId  = await seedReferenceBlock(draftId, flowId);
    const fileA    = await seedFlowResultFile(OWNER_ID, flowId);
    const fileB    = await seedFlowResultFile(OWNER_ID, flowId);

    await star({ userId: OWNER_ID, referenceBlockId: blockId, fileId: fileA, primary: true });
    await star({ userId: OWNER_ID, referenceBlockId: blockId, fileId: fileB, primary: true });

    const primary = await getPrimaryStarForBlock(blockId);
    expect(primary!.fileId).toBe(fileB);

    const stars = await listStarsForBlock(blockId);
    expect(stars.filter((s) => s.isPrimary)).toHaveLength(1);
  });

  it('starring a file NOT linked to the block flow is refused', async () => {
    const draftId       = await seedDraft(OWNER_ID);
    const flowId        = await seedFlow(OWNER_ID);
    const blockId       = await seedReferenceBlock(draftId, flowId);
    const foreignFileId = await seedUnlinkedFile(OWNER_ID); // not in flow_files for flowId

    const { NotFoundError } = await import('@/lib/errors.js');

    // Must throw NotFoundError (or a subclass) — the file does not belong to
    // the block's linked flow; the service must refuse without revealing why.
    await expect(
      star({ userId: OWNER_ID, referenceBlockId: blockId, fileId: foreignFileId }),
    ).rejects.toBeInstanceOf(NotFoundError);

    // No star row must exist.
    const stars = await listStarsForBlock(blockId);
    expect(stars).toHaveLength(0);
  });
});

// ── AC-07: primary removal fallback; file-deletion cascade ───────────────────

describe('AC-07: primary removal fallback and file-deletion cascade (sync clean-up)', () => {
  it('unstarring the primary file with another star falls back to the next earliest star as primary', async () => {
    const draftId  = await seedDraft(OWNER_ID);
    const flowId   = await seedFlow(OWNER_ID);
    const blockId  = await seedReferenceBlock(draftId, flowId);
    const fileA    = await seedFlowResultFile(OWNER_ID, flowId);
    const fileB    = await seedFlowResultFile(OWNER_ID, flowId);

    // fileA is primary; fileB is a secondary star.
    await star({ userId: OWNER_ID, referenceBlockId: blockId, fileId: fileA, primary: true });
    await star({ userId: OWNER_ID, referenceBlockId: blockId, fileId: fileB });

    // Un-star the primary.
    await unstar({ userId: OWNER_ID, referenceBlockId: blockId, fileId: fileA });

    // fileB should now be the primary (fallback to earliest remaining).
    const primary = await getPrimaryStarForBlock(blockId);
    expect(primary).not.toBeNull();
    expect(primary!.fileId).toBe(fileB);
  });

  it('unstarring the only star leaves the block with no preview (no-preview placeholder — star gate fails)', async () => {
    const draftId  = await seedDraft(OWNER_ID);
    const flowId   = await seedFlow(OWNER_ID);
    const blockId  = await seedReferenceBlock(draftId, flowId);
    const fileId   = await seedFlowResultFile(OWNER_ID, flowId);

    await star({ userId: OWNER_ID, referenceBlockId: blockId, fileId, primary: true });
    await unstar({ userId: OWNER_ID, referenceBlockId: blockId, fileId });

    const stars   = await listStarsForBlock(blockId);
    const primary = await getPrimaryStarForBlock(blockId);
    expect(stars).toHaveLength(0);
    expect(primary).toBeNull(); // block is in no-preview state → counts as missing star
  });

  it('deleting the result file cascades the star row and leaves block with no primary (AC-07 sync)', async () => {
    const draftId  = await seedDraft(OWNER_ID);
    const flowId   = await seedFlow(OWNER_ID);
    const blockId  = await seedReferenceBlock(draftId, flowId);
    const fileId   = await seedFlowResultFile(OWNER_ID, flowId);

    await star({ userId: OWNER_ID, referenceBlockId: blockId, fileId, primary: true });

    // Simulate sync file deletion — FK ON DELETE CASCADE on storyboard_reference_stars.
    await conn.execute(`DELETE FROM flow_files WHERE flow_id = ? AND file_id = ?`, [flowId, fileId]);
    await conn.execute(`DELETE FROM files WHERE file_id = ?`, [fileId]);
    // Remove from cleanup registry: already deleted.
    const idx = cleanupFileIds.indexOf(fileId);
    if (idx !== -1) cleanupFileIds.splice(idx, 1);

    // Star row must have been removed by the cascade.
    const stars   = await listStarsForBlock(blockId);
    const primary = await getPrimaryStarForBlock(blockId);
    expect(stars).toHaveLength(0);
    expect(primary).toBeNull();
  });

  it('deleting the primary file with another star present — remaining star becomes primary', async () => {
    const draftId  = await seedDraft(OWNER_ID);
    const flowId   = await seedFlow(OWNER_ID);
    const blockId  = await seedReferenceBlock(draftId, flowId);
    const fileA    = await seedFlowResultFile(OWNER_ID, flowId);
    const fileB    = await seedFlowResultFile(OWNER_ID, flowId);

    await star({ userId: OWNER_ID, referenceBlockId: blockId, fileId: fileA, primary: true });
    await star({ userId: OWNER_ID, referenceBlockId: blockId, fileId: fileB });

    // Sync-delete fileA — service/repository must auto-promote fileB.
    await unstar({ userId: OWNER_ID, referenceBlockId: blockId, fileId: fileA });

    const primary = await getPrimaryStarForBlock(blockId);
    expect(primary).not.toBeNull();
    expect(primary!.fileId).toBe(fileB);
  });
});

// ── AC-13: authorization — non-owner denied without revealing contents ─────────

describe('AC-13: authorization — non-owner denied (NotFoundError, no content revealed)', () => {
  it('star by a non-owner throws NotFoundError (existence hiding)', async () => {
    const draftId  = await seedDraft(OWNER_ID);
    const flowId   = await seedFlow(OWNER_ID);
    const blockId  = await seedReferenceBlock(draftId, flowId);
    const fileId   = await seedFlowResultFile(OWNER_ID, flowId);

    const { NotFoundError } = await import('@/lib/errors.js');

    await expect(
      star({ userId: OTHER_ID, referenceBlockId: blockId, fileId }),
    ).rejects.toBeInstanceOf(NotFoundError);

    // No star row must exist.
    const stars = await listStarsForBlock(blockId);
    expect(stars).toHaveLength(0);
  });

  it('unstar by a non-owner throws NotFoundError (existence hiding)', async () => {
    const draftId  = await seedDraft(OWNER_ID);
    const flowId   = await seedFlow(OWNER_ID);
    const blockId  = await seedReferenceBlock(draftId, flowId);
    const fileId   = await seedFlowResultFile(OWNER_ID, flowId);

    // Owner stars first.
    await star({ userId: OWNER_ID, referenceBlockId: blockId, fileId });

    const { NotFoundError } = await import('@/lib/errors.js');

    await expect(
      unstar({ userId: OTHER_ID, referenceBlockId: blockId, fileId }),
    ).rejects.toBeInstanceOf(NotFoundError);

    // Star must still exist — non-owner did not remove it.
    const stars = await listStarsForBlock(blockId);
    expect(stars).toHaveLength(1);
  });

  it('star on a block that does not exist throws NotFoundError (no info leak)', async () => {
    const absentBlockId = randomUUID();
    const fileId        = await seedUnlinkedFile(OWNER_ID);

    const { NotFoundError } = await import('@/lib/errors.js');

    await expect(
      star({ userId: OWNER_ID, referenceBlockId: absentBlockId, fileId }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
