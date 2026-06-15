/**
 * materializeScenePlan — worker-side plan → scene-block materialization (r6-F1, AC-02).
 *
 * The storyboard pipeline is backend-owned (ADR-0001): the web client no longer applies
 * the generated plan, so the worker must record scene blocks itself when scene planning
 * completes — BEFORE the transition advances to reference-data (SAD §6 Flow 1). Without
 * this, the cast-extraction enqueued by the advance reads zero scene blocks and prunes
 * every reference's `scene_ids` to [], surfacing as "0 scenes" in the cast modal.
 *
 * Layout is computed by the SHARED `buildStoryboardLayout` (the same one apps/api's
 * `applyLatestCompletedPlan` uses) so the two surfaces never drift. Persistence mirrors
 * api `replaceStoryboard` (delete-then-insert under FK order → idempotent on job
 * redelivery), MINUS the illustration-/music-job snapshot-restore: at scene-materialize
 * time (right after planning, before the reference/scene-image phases) no in-flight
 * image jobs are mapped to these blocks, so there is nothing to restore. Workers stay
 * boundary-clean — this does NOT import from apps/api.
 */

import { randomUUID } from 'node:crypto';

import type { Pool, RowDataPacket } from 'mysql2/promise';

import { buildStoryboardLayout, type StoryboardPlan } from '@ai-video-editor/project-schema';

export type MaterializeScenePlanParams = {
  draftId: string;
  userId: string;
  plan: StoryboardPlan;
};

/**
 * Replace the draft's storyboard blocks/edges/music with the layout derived from a
 * completed scene plan. Transactional + idempotent.
 */
export async function materializeScenePlanBlocks(
  pool: Pool,
  params: MaterializeScenePlanParams,
): Promise<void> {
  const { draftId, plan } = params;

  // Reuse existing START/END sentinel ids when present so node identity stays stable
  // across a re-materialize (e.g. job redelivery, regenerate).
  const [sentinels] = await pool.execute<Array<RowDataPacket & { id: string; block_type: string }>>(
    `SELECT id, block_type FROM storyboard_blocks
      WHERE draft_id = ? AND block_type IN ('start', 'end')`,
    [draftId],
  );
  const existingStartId = sentinels.find((r) => r.block_type === 'start')?.id;
  const existingEndId = sentinels.find((r) => r.block_type === 'end')?.id;

  const layout = buildStoryboardLayout({
    draftId,
    plan,
    newId: randomUUID,
    existingStartId,
    existingEndId,
  });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Delete in FK order: edges → music → blocks (blocks cascade to block_media).
    await conn.execute('DELETE FROM storyboard_edges WHERE draft_id = ?', [draftId]);
    await conn.execute('DELETE FROM storyboard_music_blocks WHERE draft_id = ?', [draftId]);
    await conn.execute('DELETE FROM storyboard_blocks WHERE draft_id = ?', [draftId]);

    for (const b of layout.blocks) {
      await conn.execute(
        `INSERT INTO storyboard_blocks
           (id, draft_id, block_type, name, prompt, video_prompt, duration_s,
            position_x, position_y, sort_order, style)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [b.id, b.draftId, b.blockType, b.name, b.prompt, b.videoPrompt, b.durationS,
          b.positionX, b.positionY, b.sortOrder, b.style],
      );
      for (const m of b.mediaItems) {
        await conn.execute(
          `INSERT INTO storyboard_block_media (id, block_id, file_id, media_type, sort_order)
           VALUES (?, ?, ?, ?, ?)`,
          [m.id, b.id, m.fileId, m.mediaType, m.sortOrder],
        );
      }
    }

    for (const e of layout.edges) {
      await conn.execute(
        `INSERT INTO storyboard_edges (id, draft_id, source_block_id, target_block_id)
         VALUES (?, ?, ?, ?)`,
        [e.id, e.draftId, e.sourceBlockId, e.targetBlockId],
      );
    }

    for (const mb of layout.musicBlocks) {
      await conn.execute(
        `INSERT INTO storyboard_music_blocks
           (id, draft_id, name, source_mode, prompt, composition_plan_json,
            existing_file_id, start_scene_block_id, end_scene_block_id,
            position_x, position_y, sort_order, volume, fade_in_s, fade_out_s,
            loop_mode)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [mb.id, draftId, mb.name, mb.sourceMode, mb.prompt,
          mb.compositionPlan ? JSON.stringify(mb.compositionPlan) : null,
          mb.existingFileId, mb.startSceneBlockId, mb.endSceneBlockId,
          mb.positionX, mb.positionY, mb.sortOrder, mb.volume, mb.fadeInS, mb.fadeOutS,
          mb.loopMode],
      );
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
