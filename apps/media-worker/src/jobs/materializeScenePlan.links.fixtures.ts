/**
 * Shared seed helpers and lifecycle utilities for
 * materializeScenePlan.links.*.integration.test.ts files.
 *
 * Each test file owns its own `ctx` object and calls `initCtx` / `teardownCtx`
 * in its `beforeAll` / `afterAll` respectively.
 *
 * Run from apps/media-worker:
 *   APP_DB_PASSWORD=cliptale APP_REDIS_URL=redis://localhost:6380 \
 *     npx vitest run src/jobs/materializeScenePlan.links.specificity.integration.test.ts \
 *                    src/jobs/materializeScenePlan.links.edgecases.integration.test.ts
 */
import { randomUUID } from 'node:crypto';

import type { RowDataPacket } from 'mysql2/promise';
import type { StoryboardPlan } from '@ai-video-editor/project-schema';

import { pool } from '@/lib/db.js';

export const PREFIX = 'sgp-links';

export type Ctx = {
  userId: string;
  draftIds: string[];
  refBlockIds: string[];
  castJobIds: string[];
};

export function makeCtx(): Ctx {
  return { userId: '', draftIds: [], refBlockIds: [], castJobIds: [] };
}

// ── lifecycle helpers ─────────────────────────────────────────────────────────

export async function initCtx(ctx: Ctx): Promise<void> {
  ctx.userId = randomUUID();
  await pool.execute(
    `INSERT INTO users (user_id, email, display_name, email_verified)
     VALUES (?, ?, ?, 1)`,
    [ctx.userId, `${PREFIX}-${ctx.userId}@example.test`, 'Links Tester'],
  );
}

export async function teardownCtx(ctx: Ctx): Promise<void> {
  // Clean up reference links first (FK chain), then ref blocks, then blocks/drafts.
  if (ctx.refBlockIds.length) {
    const ph = ctx.refBlockIds.map(() => '?').join(',');
    await pool.execute(
      `DELETE FROM storyboard_reference_scene_links WHERE reference_block_id IN (${ph})`,
      ctx.refBlockIds,
    );
    await pool.execute(
      `DELETE FROM storyboard_reference_blocks WHERE id IN (${ph})`,
      ctx.refBlockIds,
    );
  }
  if (ctx.castJobIds.length) {
    const ph = ctx.castJobIds.map(() => '?').join(',');
    await pool.execute(
      `DELETE FROM storyboard_cast_extraction_jobs WHERE id IN (${ph})`,
      ctx.castJobIds,
    );
  }
  for (const draftId of ctx.draftIds) {
    await pool.execute(`DELETE FROM storyboard_music_blocks WHERE draft_id = ?`, [draftId]);
    await pool.execute(`DELETE FROM storyboard_edges WHERE draft_id = ?`, [draftId]);
    await pool.execute(`DELETE FROM storyboard_blocks WHERE draft_id = ?`, [draftId]);
    await pool.execute(`DELETE FROM generation_drafts WHERE id = ?`, [draftId]);
  }
  await pool.execute(`DELETE FROM users WHERE user_id = ?`, [ctx.userId]);
  await pool.end();
}

// ── seed helpers ──────────────────────────────────────────────────────────────

export async function seedDraft(ctx: Ctx): Promise<string> {
  const draftId = randomUUID();
  ctx.draftIds.push(draftId);
  await pool.execute(
    `INSERT INTO generation_drafts (id, user_id, prompt_doc, status)
     VALUES (?, ?, CAST('{}' AS JSON), 'step2')`,
    [draftId, ctx.userId],
  );
  return draftId;
}

export async function seedRefBlock(
  ctx: Ctx,
  params: {
    draftId: string;
    castType: 'character' | 'environment';
    name: string;
  },
): Promise<string> {
  const blockId = randomUUID();
  ctx.refBlockIds.push(blockId);
  await pool.execute(
    `INSERT INTO storyboard_reference_blocks
       (id, draft_id, cast_type, name, sort_order, position_x, position_y, version, window_status)
     VALUES (?, ?, ?, ?, 0, 0, 0, 1, 'pending')`,
    [blockId, params.draftId, params.castType, params.name],
  );
  return blockId;
}

export async function seedCastJob(
  ctx: Ctx,
  params: {
    draftId: string;
    proposalJson: object;
  },
): Promise<void> {
  const jobId = randomUUID();
  ctx.castJobIds.push(jobId);
  await pool.execute(
    `INSERT INTO storyboard_cast_extraction_jobs
       (id, draft_id, user_id, status, proposal_json, completed_at, created_at)
     VALUES (?, ?, ?, 'completed', ?, NOW(3), NOW(3))`,
    [jobId, params.draftId, ctx.userId, JSON.stringify(params.proposalJson)],
  );
}

// ── query helpers ─────────────────────────────────────────────────────────────

export async function countLinks(draftId: string): Promise<number> {
  const [rows] = await pool.execute<Array<RowDataPacket & { cnt: number }>>(
    `SELECT COUNT(*) AS cnt
       FROM storyboard_reference_scene_links rsl
       JOIN storyboard_reference_blocks rb ON rsl.reference_block_id = rb.id
      WHERE rb.draft_id = ?`,
    [draftId],
  );
  return Number(rows[0]!.cnt);
}

export async function linkExists(refBlockId: string, sceneBlockId: string): Promise<boolean> {
  const [rows] = await pool.execute<Array<RowDataPacket & { cnt: number }>>(
    `SELECT COUNT(*) AS cnt FROM storyboard_reference_scene_links
      WHERE reference_block_id = ? AND scene_block_id = ?`,
    [refBlockId, sceneBlockId],
  );
  return Number(rows[0]!.cnt) === 1;
}

export async function readSceneIds(draftId: string): Promise<string[]> {
  const [rows] = await pool.execute<Array<RowDataPacket & { id: string }>>(
    `SELECT id FROM storyboard_blocks
      WHERE draft_id = ? AND block_type = 'scene'
      ORDER BY sort_order ASC`,
    [draftId],
  );
  return rows.map((r) => r.id);
}

// ── plan factory ──────────────────────────────────────────────────────────────

export function makePlan(scenes: number = 2): StoryboardPlan {
  return {
    schemaVersion: 2,
    videoLengthSeconds: scenes * 6,
    sceneCount: scenes,
    scenes: Array.from({ length: scenes }, (_, i) => ({
      sceneNumber: i + 1,
      prompt: `scene ${i + 1}`,
      visualPrompt: 'a shot',
      videoPrompt: 'static',
      durationSeconds: 6,
      referencedMedia: [],
      transitionNotes: '',
      style: 'cinematic',
    })),
    musicSegments: [],
  } as StoryboardPlan;
}
