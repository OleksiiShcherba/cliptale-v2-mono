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

import type { Pool, Connection, RowDataPacket } from 'mysql2/promise';

import { buildStoryboardLayout, type StoryboardPlan } from '@ai-video-editor/project-schema';
import {
  readLatestCastProposal,
  parseProposalCastEntries,
} from '@/jobs/storyboardPipelineHooks.js';

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

    // Derive and insert reference→scene links from the latest completed cast proposal.
    // This runs inside the SAME transaction so a failure rolls back blocks AND links.
    await insertReferenceSceneLinks(conn, draftId, layout.blocks);

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Derive reference→scene links from the latest completed cast proposal and
 * INSERT IGNORE them into storyboard_reference_scene_links.
 *
 * Must run inside the materialization transaction so link inserts are atomic
 * with block inserts (a failure rolls both back). Uses `conn` (not `pool`) so
 * the read participates in the same transaction scope.
 *
 * Match key: cast_type|name (from proposal entries to reference blocks). Each
 * matched reference block is linked ONLY to the scene block ids listed in THAT
 * ENTRY'S sceneBlockIds, filtered by the just-inserted set for FK safety
 * (intersection). This is PER-SCENE specificity: a character that belongs to
 * scenes 1 and 3 must NOT be linked to scene 2 — otherwise every scene image
 * would use every reference, defeating the feature.
 *
 * Reasoning on re-materialization and stale ids: when the proposal's sceneBlockIds
 * contain ids from a prior materialization (stale), the intersection with the
 * just-inserted set is empty and no links are created. This is CORRECT — stale
 * ids represent wrong data. The forward confirmCast flow re-links correctly once
 * the user re-confirms cast on the new scene layout. Linking all just-inserted
 * scenes as a staleness mitigation would produce wrong data (each reference linked
 * to scenes it does not belong to), which is worse than no links at all.
 *
 * Ambiguous (duplicate cast_type|name) reference blocks are skipped with a warn.
 * Entries with no matching reference block are skipped without error (expected
 * on first-ever materialization before confirmCast creates the reference blocks).
 * Entries whose proposal sceneBlockIds have no overlap with the just-inserted set
 * contribute no link (no FK error, no spurious link).
 */
async function insertReferenceSceneLinks(
  conn: Connection,
  draftId: string,
  blocks: Array<{ id: string; blockType: string }>,
): Promise<void> {
  // 1. Build the set of just-inserted scene block ids (FK-safety guard).
  const justInsertedSceneIds = new Set(
    blocks.filter((b) => b.blockType === 'scene').map((b) => b.id),
  );
  if (justInsertedSceneIds.size === 0) return;

  // 2. Read the latest completed cast proposal (via conn for transaction consistency).
  const proposal = await readLatestCastProposal(conn, draftId);
  if (!proposal) return;
  const entries = parseProposalCastEntries(proposal.proposalJson);
  if (entries.length === 0) return;

  // 3. Load reference blocks for the draft; build a map keyed by cast_type|name.
  //    Drop ambiguous keys (>1 block with same cast_type+name) with a warn.
  const [refRows] = await conn.execute<Array<RowDataPacket & { id: string; cast_type: string; name: string }>>(
    `SELECT id, cast_type, name FROM storyboard_reference_blocks WHERE draft_id = ?`,
    [draftId],
  );
  const refMap = new Map<string, string>(); // key → reference_block_id
  const ambiguous = new Set<string>();
  for (const row of refRows) {
    const key = `${row.cast_type}|${row.name}`;
    if (ambiguous.has(key)) continue;
    if (refMap.has(key)) {
      ambiguous.add(key);
      refMap.delete(key);
      console.warn('[materializeScenePlan] ambiguous reference block key — skipping links', { draftId, key });
    } else {
      refMap.set(key, row.id);
    }
  }

  // 4. For each proposal entry, link its reference block to each scene listed in THAT
  //    ENTRY'S sceneBlockIds — but only when the scene id is also in the just-inserted
  //    set (FK-safe intersection). This is the per-scene specificity requirement:
  //    a reference block is linked only to the specific scenes the proposal assigns it
  //    to, not to every scene in the draft. Stale scene ids (from a prior materialization)
  //    are silently skipped via the intersection guard — no FK error, no spurious link.
  for (const entry of entries) {
    const key = `${entry.castType}|${entry.name}`;
    const refBlockId = refMap.get(key);
    if (!refBlockId) {
      console.debug('[materializeScenePlan] no reference block for entry — skipping', { draftId, key });
      continue;
    }
    for (const sceneBlockId of entry.sceneBlockIds) {
      if (!justInsertedSceneIds.has(sceneBlockId)) continue; // FK-safety: skip stale/unknown ids
      await conn.execute(
        `INSERT IGNORE INTO storyboard_reference_scene_links
           (reference_block_id, scene_block_id)
         VALUES (?, ?)`,
        [refBlockId, sceneBlockId],
      );
    }
  }
}
