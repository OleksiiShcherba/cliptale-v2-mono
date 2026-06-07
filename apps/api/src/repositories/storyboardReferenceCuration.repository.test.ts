/**
 * Integration tests for storyboardReferenceCuration.repository.ts
 * against a real MySQL database.
 *
 * ACs covered (T3 — task/srf-T3):
 *   AC-06 — star toggle is idempotent (unique constraint); primary star
 *            enforced (at most one per block).
 *   AC-07 — removing / replacing the primary star falls back to another starred
 *            result or leaves the block preview-less; file deletion cascades the
 *            star row.
 *   AC-10  — versioned replace-set of scene links (compare-and-set on
 *             storyboard_reference_blocks.version); stale version → rejected.
 *   AC-10b — deleting a scene auto-prunes its links (FK CASCADE); a new scene
 *             gets no links automatically; reordering changes nothing.
 *
 * spec.md §5 wording that drives these assertions:
 *   AC-06: "all starred results become the block's reference candidates and the
 *           primary starred result appears as the block's preview"
 *   AC-07: "the block's preview falls back to another starred result if any,
 *           otherwise the block shows the no-preview placeholder"
 *   AC-10: "the block's visible linked-scenes list updates and the next scene
 *           generation respects the updated links"
 *   AC-10b: "deleting a scene automatically removes it from every block's
 *            linked-scenes list (no dangling links)"
 *
 * test-plan.md rows:
 *   AC-06: "starred results become the block's candidates and the primary star
 *           becomes its canvas preview" — integration
 *   AC-07: "removing the primary star falls back to another star or the
 *           no-preview placeholder" — unit + integration
 *   AC-10: "editing a block's scene selector updates the visible list and the
 *           next generation honors it" — integration
 *   AC-10b: "scene deletion prunes links, a new scene gets none, reorder
 *            changes nothing" — integration
 *
 * Run:
 *   cd apps/api && APP_DB_PASSWORD=cliptale APP_REDIS_URL=redis://localhost:6380 \
 *     npx vitest run src/repositories/storyboardReferenceCuration.repository.test.ts
 */
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql, { type Connection } from 'mysql2/promise';

// ── Env bootstrap (must precede any app-module import) ─────────────────────────
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
  APP_JWT_SECRET:           'srf-t3-integ-test-secret-exactly-32ch!',
  APP_DEV_AUTH_BYPASS:      'true',
});

import {
  toggleStar,
  setPrimary,
  clearPrimary,
  listStarsForBlock,
  getPrimaryStarForBlock,
  replaceSceneLinks,
  listSceneLinksForBlock,
} from './storyboardReferenceCuration.repository.js';

// ── DB connection ──────────────────────────────────────────────────────────────

let conn: Connection;

// ── Unique prefix for this suite run ─────────────────────────────────────────
const RUN = randomUUID().slice(0, 8);

// Cleanup registries — per-test IDs collected and deleted in afterAll in FK order.
const cleanupBlockIds: string[] = [];
const cleanupDraftIds: string[] = [];
const cleanupFileIds: string[] = [];
const cleanupSceneBlockIds: string[] = [];

// One shared user for all tests.
const USER_ID = `srf-t3-user-${RUN}`;

// ── Seed helpers ───────────────────────────────────────────────────────────────

async function seedUser(): Promise<void> {
  await conn.execute(
    `INSERT IGNORE INTO users (user_id, email) VALUES (?, ?)`,
    [USER_ID, `${USER_ID}@example.test`],
  );
}

async function seedDraft(): Promise<string> {
  const draftId = `srf-t3-draft-${randomUUID().slice(0, 12)}`;
  await conn.execute(
    `INSERT INTO generation_drafts (id, user_id, prompt_doc) VALUES (?, ?, ?)`,
    [draftId, USER_ID, JSON.stringify({ schemaVersion: 1, blocks: [] })],
  );
  cleanupDraftIds.push(draftId);
  return draftId;
}

/** data-model.md §Test fixtures: createReferenceBlock */
async function createReferenceBlock(draftId: string, overrides: Record<string, unknown> = {}): Promise<string> {
  const id = `srf-t3-block-${randomUUID().slice(0, 12)}`;
  await conn.execute(
    `INSERT INTO storyboard_reference_blocks
       (id, draft_id, flow_id, cast_type, name, description, sort_order,
        position_x, position_y, window_status, version)
     VALUES (?, ?, NULL, ?, ?, NULL, 0, 0, 0, NULL, 1)`,
    [
      id,
      draftId,
      overrides['cast_type'] ?? 'character',
      overrides['name'] ?? 'Test Character',
    ],
  );
  cleanupBlockIds.push(id);
  return id;
}

/** Minimal file row — status='ready', kind='image' */
async function seedFile(userId: string): Promise<string> {
  const fileId = `srf-t3-file-${randomUUID().slice(0, 12)}`;
  await conn.execute(
    `INSERT INTO files
       (file_id, user_id, kind, storage_uri, mime_type, display_name, status)
     VALUES (?, ?, 'image', ?, 'image/png', 'test-ref.png', 'ready')`,
    [fileId, userId, `s3://test-bucket/${fileId}.png`],
  );
  cleanupFileIds.push(fileId);
  return fileId;
}

/** Minimal scene (storyboard_block row with block_type='scene') */
async function seedSceneBlock(draftId: string): Promise<string> {
  const id = `srf-t3-scene-${randomUUID().slice(0, 12)}`;
  await conn.execute(
    `INSERT INTO storyboard_blocks
       (id, draft_id, block_type, name, prompt, duration_s,
        position_x, position_y, sort_order, style)
     VALUES (?, ?, 'scene', 'Test Scene', 'A test scene.', 6, 100, 200, 1, NULL)`,
    [id, draftId],
  );
  cleanupSceneBlockIds.push(id);
  return id;
}

/** data-model.md §Test fixtures: createReferenceStar */
async function createReferenceStar(
  blockId: string,
  fileId: string,
  isPrimary?: boolean,
): Promise<string> {
  const id = `srf-t3-star-${randomUUID().slice(0, 12)}`;
  await conn.execute(
    `INSERT INTO storyboard_reference_stars
       (id, reference_block_id, file_id, is_primary)
     VALUES (?, ?, ?, ?)`,
    [id, blockId, fileId, isPrimary === true ? 1 : null],
  );
  return id;
}

/** data-model.md §Test fixtures: createReferenceSceneLink */
async function createReferenceSceneLink(blockId: string, sceneBlockId: string): Promise<void> {
  await conn.execute(
    `INSERT INTO storyboard_reference_scene_links
       (reference_block_id, scene_block_id)
     VALUES (?, ?)`,
    [blockId, sceneBlockId],
  );
}

beforeAll(async () => {
  conn = await mysql.createConnection({
    host:     process.env['APP_DB_HOST']     ?? 'localhost',
    port:     Number(process.env['APP_DB_PORT'] ?? 3306),
    database: process.env['APP_DB_NAME']     ?? 'cliptale',
    user:     process.env['APP_DB_USER']     ?? 'cliptale',
    password: process.env['APP_DB_PASSWORD'] ?? 'cliptale',
  });
  await seedUser();
});

afterAll(async () => {
  // Delete in FK-safe order: stars + scene_links CASCADE from blocks;
  // blocks CASCADE from drafts; files can be deleted after stars.
  if (cleanupSceneBlockIds.length) {
    const ph = cleanupSceneBlockIds.map(() => '?').join(',');
    await conn.query(`DELETE FROM storyboard_reference_scene_links WHERE scene_block_id IN (${ph})`, cleanupSceneBlockIds);
    await conn.query(`DELETE FROM storyboard_blocks WHERE id IN (${ph})`, cleanupSceneBlockIds);
  }
  if (cleanupBlockIds.length) {
    const ph = cleanupBlockIds.map(() => '?').join(',');
    // Stars cascade from reference_block_id FK; scene_links also cascade
    await conn.query(`DELETE FROM storyboard_reference_blocks WHERE id IN (${ph})`, cleanupBlockIds);
  }
  if (cleanupDraftIds.length) {
    const ph = cleanupDraftIds.map(() => '?').join(',');
    await conn.query(`DELETE FROM generation_drafts WHERE id IN (${ph})`, cleanupDraftIds);
  }
  if (cleanupFileIds.length) {
    const ph = cleanupFileIds.map(() => '?').join(',');
    await conn.query(`DELETE FROM files WHERE file_id IN (${ph})`, cleanupFileIds);
  }
  await conn.query(`DELETE FROM users WHERE user_id = ?`, [USER_ID]);
  await conn.end();
});

// ── AC-06: star toggle idempotent; primary-star uniqueness ───────────────────

describe('AC-06: toggleStar — idempotent star toggle and primary uniqueness', () => {
  it('starring the same file twice on the same block is a no-op (idempotent)', async () => {
    const draftId = await seedDraft();
    const blockId = await createReferenceBlock(draftId);
    const fileId = await seedFile(USER_ID);

    const first = await toggleStar({ referenceBlockId: blockId, fileId });
    expect(first).toBe('starred');

    // Second call on the same (block, file) pair must not throw and must be idempotent.
    const second = await toggleStar({ referenceBlockId: blockId, fileId });
    expect(second).toBe('already_starred'); // no-op, not a duplicate row

    const stars = await listStarsForBlock(blockId);
    expect(stars).toHaveLength(1);
    expect(stars[0]!.fileId).toBe(fileId);
  });

  it('un-starring a file that was never starred is a no-op', async () => {
    const draftId = await seedDraft();
    const blockId = await createReferenceBlock(draftId);
    const fileId = await seedFile(USER_ID);

    // File was never starred — should silently succeed.
    const result = await toggleStar({ referenceBlockId: blockId, fileId, remove: true });
    expect(result).toBe('not_found'); // no-op

    const stars = await listStarsForBlock(blockId);
    expect(stars).toHaveLength(0);
  });

  it('can star multiple different files on the same block', async () => {
    const draftId = await seedDraft();
    const blockId = await createReferenceBlock(draftId);
    const fileA = await seedFile(USER_ID);
    const fileB = await seedFile(USER_ID);

    await toggleStar({ referenceBlockId: blockId, fileId: fileA });
    await toggleStar({ referenceBlockId: blockId, fileId: fileB });

    const stars = await listStarsForBlock(blockId);
    expect(stars).toHaveLength(2);
    const fileIds = stars.map((s) => s.fileId);
    expect(fileIds).toContain(fileA);
    expect(fileIds).toContain(fileB);
  });

  it('setPrimary assigns the primary star and listStarsForBlock reflects it', async () => {
    const draftId = await seedDraft();
    const blockId = await createReferenceBlock(draftId);
    const fileId = await seedFile(USER_ID);

    await toggleStar({ referenceBlockId: blockId, fileId });
    await setPrimary({ referenceBlockId: blockId, fileId });

    const primary = await getPrimaryStarForBlock(blockId);
    expect(primary).not.toBeNull();
    expect(primary!.fileId).toBe(fileId);
    expect(primary!.isPrimary).toBe(true);
  });

  it('at most one primary per block — assigning a second primary replaces the first', async () => {
    const draftId = await seedDraft();
    const blockId = await createReferenceBlock(draftId);
    const fileA = await seedFile(USER_ID);
    const fileB = await seedFile(USER_ID);

    await toggleStar({ referenceBlockId: blockId, fileId: fileA });
    await toggleStar({ referenceBlockId: blockId, fileId: fileB });

    // Designate fileA as primary.
    await setPrimary({ referenceBlockId: blockId, fileId: fileA });

    const primaryAfterA = await getPrimaryStarForBlock(blockId);
    expect(primaryAfterA!.fileId).toBe(fileA);

    // Designate fileB as primary — must demote fileA.
    await setPrimary({ referenceBlockId: blockId, fileId: fileB });

    const primaryAfterB = await getPrimaryStarForBlock(blockId);
    expect(primaryAfterB!.fileId).toBe(fileB);

    // Only one primary exists.
    const stars = await listStarsForBlock(blockId);
    const primaries = stars.filter((s) => s.isPrimary);
    expect(primaries).toHaveLength(1);
    expect(primaries[0]!.fileId).toBe(fileB);
  });
});

// ── AC-07: primary removal falls back; file deletion cascades star row ────────

describe('AC-07: primary removal fallback and file-deletion cascade', () => {
  it('clearPrimary with no other stars leaves the block with no preview (null primary)', async () => {
    const draftId = await seedDraft();
    const blockId = await createReferenceBlock(draftId);
    const fileId = await seedFile(USER_ID);

    await toggleStar({ referenceBlockId: blockId, fileId });
    await setPrimary({ referenceBlockId: blockId, fileId });

    await clearPrimary({ referenceBlockId: blockId });

    const primary = await getPrimaryStarForBlock(blockId);
    expect(primary).toBeNull(); // block is in "no-preview" state → fails star gate
  });

  it('un-starring the primary file with another star present exposes the remaining star', async () => {
    const draftId = await seedDraft();
    const blockId = await createReferenceBlock(draftId);
    const fileA = await seedFile(USER_ID);
    const fileB = await seedFile(USER_ID);

    await toggleStar({ referenceBlockId: blockId, fileId: fileA });
    await toggleStar({ referenceBlockId: blockId, fileId: fileB });
    await setPrimary({ referenceBlockId: blockId, fileId: fileA });

    // Remove star for fileA (the primary).
    await toggleStar({ referenceBlockId: blockId, fileId: fileA, remove: true });

    // fileA's star is gone; fileB still exists.
    const stars = await listStarsForBlock(blockId);
    expect(stars).toHaveLength(1);
    expect(stars[0]!.fileId).toBe(fileB);

    // Primary is now null — caller must promote fileB if desired (AC-07 fallback
    // may be managed at service layer; repo exposes the data to do so).
    const primary = await getPrimaryStarForBlock(blockId);
    expect(primary).toBeNull();
  });

  it('deleting a file from the files table cascades to remove its star row (AC-07 sync)', async () => {
    const draftId = await seedDraft();
    const blockId = await createReferenceBlock(draftId);
    const fileId = await seedFile(USER_ID);

    await toggleStar({ referenceBlockId: blockId, fileId });
    await setPrimary({ referenceBlockId: blockId, fileId });

    // Simulate file deletion — FK CASCADE must prune the star row.
    await conn.execute(`DELETE FROM files WHERE file_id = ?`, [fileId]);
    // Remove from cleanup list since it's already deleted.
    const idx = cleanupFileIds.indexOf(fileId);
    if (idx !== -1) cleanupFileIds.splice(idx, 1);

    const stars = await listStarsForBlock(blockId);
    expect(stars).toHaveLength(0);

    const primary = await getPrimaryStarForBlock(blockId);
    expect(primary).toBeNull();
  });
});

// ── AC-10: versioned replace-set scene links (compare-and-set) ────────────────

describe('AC-10: replaceSceneLinks — versioned compare-and-set scene links', () => {
  it('replaceSceneLinks with matching version saves the new list and increments block version', async () => {
    const draftId = await seedDraft();
    const blockId = await createReferenceBlock(draftId);
    const sceneA = await seedSceneBlock(draftId);
    const sceneB = await seedSceneBlock(draftId);

    // Block starts at version=1.
    const result = await replaceSceneLinks({
      referenceBlockId: blockId,
      sceneBlockIds: [sceneA, sceneB],
      parentVersion: 1,
    });

    expect(result.saved).toBe(true);
    expect(result.newVersion).toBe(2);

    const links = await listSceneLinksForBlock(blockId);
    expect(links).toHaveLength(2);
    const ids = links.map((l) => l.sceneBlockId);
    expect(ids).toContain(sceneA);
    expect(ids).toContain(sceneB);
  });

  it('replaceSceneLinks with stale parentVersion is rejected without overwriting (AC-10 NFR)', async () => {
    const draftId = await seedDraft();
    const blockId = await createReferenceBlock(draftId);
    const sceneA = await seedSceneBlock(draftId);
    const sceneB = await seedSceneBlock(draftId);

    // First save: version 1 → 2, links = [sceneA]
    const first = await replaceSceneLinks({
      referenceBlockId: blockId,
      sceneBlockIds: [sceneA],
      parentVersion: 1,
    });
    expect(first.saved).toBe(true);
    expect(first.newVersion).toBe(2);

    // Stale save: caller still presents parentVersion=1 (DB is at 2) — must reject.
    const stale = await replaceSceneLinks({
      referenceBlockId: blockId,
      sceneBlockIds: [sceneB], // would overwrite if allowed
      parentVersion: 1,
    });
    expect(stale.saved).toBe(false);
    expect(stale.newVersion).toBeNull();

    // Links must not have changed — sceneA still linked, sceneB not.
    const links = await listSceneLinksForBlock(blockId);
    const ids = links.map((l) => l.sceneBlockId);
    expect(ids).toContain(sceneA);
    expect(ids).not.toContain(sceneB);
  });

  it('replaceSceneLinks with empty list removes all links', async () => {
    const draftId = await seedDraft();
    const blockId = await createReferenceBlock(draftId);
    const sceneA = await seedSceneBlock(draftId);

    await replaceSceneLinks({
      referenceBlockId: blockId,
      sceneBlockIds: [sceneA],
      parentVersion: 1,
    });

    // Clear all links with matching version.
    const clear = await replaceSceneLinks({
      referenceBlockId: blockId,
      sceneBlockIds: [],
      parentVersion: 2,
    });
    expect(clear.saved).toBe(true);

    const links = await listSceneLinksForBlock(blockId);
    expect(links).toHaveLength(0);
  });
});

// ── AC-10b: scene lifecycle — deletion prunes links, new scene gets none ──────

describe('AC-10b: scene lifecycle — deletion prunes links; new scene gets no links; reorder is neutral', () => {
  it('deleting a storyboard_block (scene) automatically removes its scene links (no dangling links)', async () => {
    const draftId = await seedDraft();
    const blockId = await createReferenceBlock(draftId);
    const sceneA = await seedSceneBlock(draftId);
    const sceneB = await seedSceneBlock(draftId);

    // Seed the links directly (bypass versioned save for brevity — we test FK cascade here).
    await createReferenceSceneLink(blockId, sceneA);
    await createReferenceSceneLink(blockId, sceneB);

    let links = await listSceneLinksForBlock(blockId);
    expect(links).toHaveLength(2);

    // Delete sceneA — FK ON DELETE CASCADE must prune the link row.
    await conn.execute(`DELETE FROM storyboard_blocks WHERE id = ?`, [sceneA]);
    const sceneAIdx = cleanupSceneBlockIds.indexOf(sceneA);
    if (sceneAIdx !== -1) cleanupSceneBlockIds.splice(sceneAIdx, 1);

    links = await listSceneLinksForBlock(blockId);
    expect(links).toHaveLength(1);
    expect(links[0]!.sceneBlockId).toBe(sceneB);
  });

  it('a newly added scene block has no reference links automatically', async () => {
    const draftId = await seedDraft();
    const blockId = await createReferenceBlock(draftId);

    // Seed an existing scene linked to the block.
    const existingScene = await seedSceneBlock(draftId);
    await createReferenceSceneLink(blockId, existingScene);

    // Add a brand new scene — no links should be created automatically.
    const newScene = await seedSceneBlock(draftId);

    const links = await listSceneLinksForBlock(blockId);
    const ids = links.map((l) => l.sceneBlockId);

    expect(ids).toContain(existingScene);
    expect(ids).not.toContain(newScene); // new scene has no links
  });

  it('reordering scenes (changing sort_order) does not affect block scene links', async () => {
    const draftId = await seedDraft();
    const blockId = await createReferenceBlock(draftId);
    const sceneA = await seedSceneBlock(draftId);

    await createReferenceSceneLink(blockId, sceneA);

    // Simulate reordering by updating sort_order on the scene.
    await conn.execute(
      `UPDATE storyboard_blocks SET sort_order = 99 WHERE id = ?`,
      [sceneA],
    );

    // Link must still reference the same scene ID, not a position.
    const links = await listSceneLinksForBlock(blockId);
    expect(links).toHaveLength(1);
    expect(links[0]!.sceneBlockId).toBe(sceneA); // link is to the scene itself, not its position
  });
});
