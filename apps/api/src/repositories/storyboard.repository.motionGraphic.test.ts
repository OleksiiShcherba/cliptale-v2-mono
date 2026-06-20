/**
 * Integration tests for the motion-graphic READ + SAVE round-trip on
 * storyboard.repository.ts against real MySQL 8.
 *
 * Defect (AC-04/US-07): after a page reload the read path dropped the frozen
 * snapshot, so an attached motion graphic degraded into an anonymous media row.
 *
 * Covers:
 *   - findBlocksByDraftId hydrates a motion_graphic media item with its frozen
 *     snapshot (code + duration + geometry) via a LEFT JOIN.
 *   - replaceStoryboard preserves motion_graphic_snapshot_id on a save round-trip
 *     (the autosave full delete+reinsert must not null/drop the FK).
 *
 * Prerequisites: Docker Compose `db` service running (migrations 060-061 applied).
 * Run:
 *   cd apps/api && APP_DB_PASSWORD=cliptale \
 *     npx vitest run src/repositories/storyboard.repository.motionGraphic.test.ts
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
  APP_REDIS_URL:            process.env['APP_REDIS_URL']            ?? 'redis://localhost:6379',
  APP_S3_BUCKET:            process.env['APP_S3_BUCKET']            ?? 'test-bucket',
  APP_S3_REGION:            process.env['APP_S3_REGION']            ?? 'us-east-1',
  APP_S3_ACCESS_KEY_ID:     process.env['APP_S3_ACCESS_KEY_ID']     ?? 'test-access-key-id',
  APP_S3_SECRET_ACCESS_KEY: process.env['APP_S3_SECRET_ACCESS_KEY'] ?? 'test-secret-key-value',
  APP_JWT_SECRET:           'sb-mg-read-integ-test-secret-32chr-x!',
  APP_DEV_AUTH_BYPASS:      'false',
});

import {
  findBlocksByDraftId,
  replaceStoryboard,
  getConnection,
} from './storyboard.repository.js';

let conn: Connection;

const PREFIX = 'sbmg';
const USER_ID = `${PREFIX}-u-${randomUUID().slice(0, 8)}`;

let draftId: string;
let sceneBlockId: string;
let snapshotId: string;
let mediaId: string;

const SAMPLE_CODE =
  "export const C = () => { const f = useCurrentFrame(); return <div>{f}</div>; };";

beforeAll(async () => {
  conn = await mysql.createConnection({
    host:     process.env['APP_DB_HOST']     ?? 'localhost',
    port:     Number(process.env['APP_DB_PORT'] ?? 3306),
    database: process.env['APP_DB_NAME']     ?? 'cliptale',
    user:     process.env['APP_DB_USER']     ?? 'cliptale',
    password: process.env['APP_DB_PASSWORD'] ?? 'cliptale',
  });

  await conn.execute(
    `INSERT INTO users (user_id, email, display_name, email_verified)
     VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE user_id = user_id`,
    [USER_ID, `${USER_ID}@test.com`, USER_ID],
  );

  draftId = randomUUID();
  await conn.execute(
    'INSERT INTO generation_drafts (id, user_id, prompt_doc) VALUES (?, ?, ?)',
    [draftId, USER_ID, JSON.stringify({ schemaVersion: 1, blocks: [] })],
  );

  sceneBlockId = randomUUID();
  await conn.execute(
    `INSERT INTO storyboard_blocks
       (id, draft_id, block_type, name, prompt, duration_s, position_x, position_y, sort_order)
     VALUES (?, ?, 'scene', 'Scene 1', 'A prompt', 5, 100, 100, 0)`,
    [sceneBlockId, draftId],
  );

  // Frozen snapshot + the attaching media row (mirrors insertBlockSnapshotWithMedia).
  snapshotId = randomUUID();
  mediaId = randomUUID();
  await conn.execute(
    `INSERT INTO motion_graphic_block_snapshots
       (id, source_motion_graphic_id, code, props_schema, duration_seconds,
        fps, width, height, runtime_version, source_version)
     VALUES (?, NULL, ?, NULL, 4.00, 30, 1920, 1080, 'remotion-4', NULL)`,
    [snapshotId, SAMPLE_CODE],
  );
  await conn.execute(
    `INSERT INTO storyboard_block_media
       (id, block_id, file_id, motion_graphic_snapshot_id, media_type, sort_order)
     VALUES (?, ?, NULL, ?, 'motion_graphic', 0)`,
    [mediaId, sceneBlockId, snapshotId],
  );
});

afterAll(async () => {
  if (!conn) return;
  await conn.execute('DELETE FROM storyboard_block_media WHERE block_id = ?', [sceneBlockId]);
  await conn.execute('DELETE FROM motion_graphic_block_snapshots WHERE id = ?', [snapshotId]);
  await conn.execute('DELETE FROM storyboard_edges WHERE draft_id = ?', [draftId]);
  await conn.execute('DELETE FROM storyboard_blocks WHERE draft_id = ?', [draftId]);
  await conn.execute('DELETE FROM generation_drafts WHERE id = ?', [draftId]);
  await conn.execute('DELETE FROM users WHERE user_id = ?', [USER_ID]);
  await conn.end();
});

describe('storyboard.repository — motion-graphic read hydration', () => {
  it('hydrates a motion_graphic media item with its frozen snapshot', async () => {
    const blocks = await findBlocksByDraftId(draftId);
    const scene = blocks.find((b) => b.id === sceneBlockId);
    expect(scene).toBeDefined();

    const item = scene!.mediaItems.find((m) => m.mediaType === 'motion_graphic');
    expect(item).toBeDefined();
    expect(item!.fileId).toBeNull();
    expect(item!.motionGraphic).toBeDefined();
    expect(item!.motionGraphic!.snapshotId).toBe(snapshotId);
    expect(item!.motionGraphic!.code).toBe(SAMPLE_CODE);
    expect(Number(item!.motionGraphic!.durationSeconds)).toBeCloseTo(4.0, 2);
    expect(item!.motionGraphic!.fps).toBe(30);
    expect(item!.motionGraphic!.width).toBe(1920);
    expect(item!.motionGraphic!.height).toBe(1080);
  });
});

describe('storyboard.repository — motion-graphic save round-trip', () => {
  it('preserves motion_graphic_snapshot_id through replaceStoryboard', async () => {
    // Read current state, then PUT it straight back (the autosave path).
    const before = await findBlocksByDraftId(draftId);
    const scene = before.find((b) => b.id === sceneBlockId)!;

    const txn = await getConnection();
    try {
      await txn.beginTransaction();
      await replaceStoryboard(
        txn,
        draftId,
        before.map((b) => ({
          id: b.id,
          draftId,
          blockType: b.blockType,
          name: b.name,
          prompt: b.prompt,
          videoPrompt: b.videoPrompt,
          durationS: b.durationS,
          positionX: b.positionX,
          positionY: b.positionY,
          sortOrder: b.sortOrder,
          style: b.style,
          mediaItems: b.mediaItems,
        })),
        [],
        [],
      );
      await txn.commit();
    } catch (err) {
      await txn.rollback();
      throw err;
    } finally {
      txn.release();
    }

    // The new media row id will differ (full reinsert), but the snapshot FK must survive.
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT motion_graphic_snapshot_id, media_type, file_id
         FROM storyboard_block_media WHERE block_id = ?`,
      [scene.id],
    );
    const mgRow = rows.find((r) => r['media_type'] === 'motion_graphic');
    expect(mgRow).toBeDefined();
    expect(mgRow!['motion_graphic_snapshot_id']).toBe(snapshotId);
    expect(mgRow!['file_id']).toBeNull();

    // And the re-read still hydrates the snapshot.
    const after = await findBlocksByDraftId(draftId);
    const item = after
      .find((b) => b.id === sceneBlockId)!
      .mediaItems.find((m) => m.mediaType === 'motion_graphic');
    expect(item?.motionGraphic?.code).toBe(SAMPLE_CODE);
  });
});
