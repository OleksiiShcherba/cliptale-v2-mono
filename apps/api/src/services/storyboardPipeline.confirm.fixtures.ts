/**
 * storyboardPipeline.confirm.fixtures.ts — shared seed helpers for T6 integration tests.
 *
 * Imported by:
 *   - storyboardPipeline.confirm.service.test.ts     (core AC-03/AC-09/AC-14/AC-13 tests)
 *   - storyboardPipeline.confirm.sceneLinks.test.ts  (AC-10 + MAIN ADJ flow tests)
 *
 * All functions accept an open mysql2 Connection so each test file manages its own
 * connection lifecycle independently.
 */

import { randomUUID } from 'node:crypto';

import type { Connection, RowDataPacket } from 'mysql2/promise';

import {
  insertPipelineRow,
  getPipelineByDraftId,
  casUpdateState,
} from '@/repositories/storyboardPipeline.repository.js';

// ── ID factory ────────────────────────────────────────────────────────────────

export function makeId(prefix: string, tag: string): string {
  return `${prefix}-${tag}-${randomUUID().slice(0, 12)}`;
}

// ── Seed helpers ──────────────────────────────────────────────────────────────

export async function seedDraft(conn: Connection, prefix: string, userId: string, trackedDraftIds: string[]): Promise<string> {
  const draftId = makeId(prefix, 'draft');
  trackedDraftIds.push(draftId);
  await conn.execute(
    `INSERT INTO generation_drafts (id, user_id, prompt_doc) VALUES (?, ?, ?)`,
    [draftId, userId, JSON.stringify({ text: 'Test prompt' })],
  );
  return draftId;
}

/** Seed scene blocks + music blocks (music spans two scenes, with sort_order). */
export async function seedSceneAndMusic(
  conn: Connection,
  prefix: string,
  draftId: string,
  musicSortOrders: number[],
): Promise<{ sceneA: string; sceneB: string }> {
  const sceneA = makeId(prefix, 'scene');
  const sceneB = makeId(prefix, 'scene');
  await conn.execute(
    `INSERT INTO storyboard_blocks (id, draft_id, block_type, name, sort_order)
     VALUES (?, ?, 'scene', 'Scene A', 0), (?, ?, 'scene', 'Scene B', 1)`,
    [sceneA, draftId, sceneB, draftId],
  );
  for (let i = 0; i < musicSortOrders.length; i++) {
    await conn.execute(
      `INSERT INTO storyboard_music_blocks
         (id, draft_id, name, source_mode, prompt, start_scene_block_id, end_scene_block_id,
          position_x, position_y, sort_order, volume, fade_in_s, fade_out_s, loop_mode)
       VALUES (?, ?, ?, 'generate_now', 'a tune', ?, ?, 0, 0, ?, 1.0, 0, 0, 'loop')`,
      [makeId(prefix, 'music'), draftId, `Music ${i}`, sceneA, sceneB, musicSortOrders[i]],
    );
  }
  return { sceneA, sceneB };
}

/** Seed a completed cast-extraction proposal (the cast confirmCast turns into blocks). */
export async function seedCastProposal(
  conn: Connection,
  prefix: string,
  draftId: string,
  userId: string,
  cast: Array<{ type: 'character' | 'environment'; name: string; description?: string; scene_block_ids?: string[] }>,
): Promise<void> {
  await conn.execute(
    `INSERT INTO storyboard_cast_extraction_jobs (id, draft_id, user_id, status, proposal_json, completed_at)
     VALUES (?, ?, ?, 'completed', ?, NOW(3))`,
    [
      makeId(prefix, 'cast'),
      draftId,
      userId,
      JSON.stringify({
        cast: cast.map((c) => ({
          type: c.type,
          name: c.name,
          description: c.description ?? '',
          scene_block_ids: c.scene_block_ids ?? [],
        })),
      }),
    ],
  );
}

// ── Query helpers ─────────────────────────────────────────────────────────────

export async function countReferenceBlocks(conn: Connection, draftId: string): Promise<number> {
  const [rows] = await conn.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt FROM storyboard_reference_blocks WHERE draft_id = ?`,
    [draftId],
  );
  return Number((rows[0] as { cnt: number }).cnt);
}

export async function maxMusicSort(conn: Connection, draftId: string): Promise<number> {
  const [rows] = await conn.execute<RowDataPacket[]>(
    `SELECT COALESCE(MAX(sort_order), -1) AS m FROM storyboard_music_blocks WHERE draft_id = ?`,
    [draftId],
  );
  return Number((rows[0] as { m: number }).m);
}

export async function countReferenceSceneLinks(conn: Connection, referenceBlockId: string): Promise<number> {
  const [rows] = await conn.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt FROM storyboard_reference_scene_links WHERE reference_block_id = ?`,
    [referenceBlockId],
  );
  return Number((rows[0] as { cnt: number }).cnt);
}

export async function getReferenceBlockIdsByDraftId(conn: Connection, draftId: string): Promise<string[]> {
  const [rows] = await conn.execute<RowDataPacket[]>(
    `SELECT id FROM storyboard_reference_blocks WHERE draft_id = ? ORDER BY sort_order`,
    [draftId],
  );
  return (rows as Array<{ id: string }>).map((r) => r.id);
}

export async function getSceneLinksForDraft(
  conn: Connection,
  draftId: string,
): Promise<Array<{ reference_block_id: string; scene_block_id: string }>> {
  const [rows] = await conn.execute<RowDataPacket[]>(
    `SELECT srsl.reference_block_id, srsl.scene_block_id
       FROM storyboard_reference_scene_links srsl
       JOIN storyboard_reference_blocks srb ON srb.id = srsl.reference_block_id
      WHERE srb.draft_id = ?
      ORDER BY srsl.reference_block_id, srsl.scene_block_id`,
    [draftId],
  );
  return rows as Array<{ reference_block_id: string; scene_block_id: string }>;
}

// ── Arrange helpers ───────────────────────────────────────────────────────────

/** Drive a draft to the awaiting_review point so confirm is the legal next step. */
export async function arrangeAwaitingReview(draftId: string, estimate: string): Promise<void> {
  await insertPipelineRow({ draftId });
  const row = (await getPipelineByDraftId(draftId))!;
  await casUpdateState({
    draftId,
    currentVersion: row.version,
    activePhase: 'reference_data',
    phase: 'reference_data',
    status: 'completed',
    activeRunPhase: null,
    costEstimate: estimate,
  });
}
