/**
 * materializeScenePlan — worker-side plan → scene-block materialization (r6-F1, AC-02).
 *
 * Integration test (real MySQL). The backend-owned pipeline must record scene blocks
 * before advancing to reference-data, so cast-extraction reads real scene ids instead
 * of pruning every reference's scenes to empty ("0 scenes" bug). The worker writes the
 * blocks directly via its own pool, reusing the shared layout builder.
 *
 * Run from apps/media-worker:
 *   APP_DB_PASSWORD=cliptale APP_REDIS_URL=redis://localhost:6380 \
 *     npx vitest run src/jobs/materializeScenePlan.integration.test.ts
 */
import { randomUUID } from 'node:crypto';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { RowDataPacket } from 'mysql2/promise';

import type { StoryboardPlan } from '@ai-video-editor/project-schema';

import { pool } from '@/lib/db.js';
import { materializeScenePlanBlocks } from '@/jobs/materializeScenePlan.js';

const PREFIX = 'sgp-r6f1';
const ctx = { userId: '', draftIds: [] as string[] };

async function seedDraft(): Promise<string> {
  const draftId = randomUUID();
  ctx.draftIds.push(draftId);
  await pool.execute(
    `INSERT INTO generation_drafts (id, user_id, prompt_doc, status)
     VALUES (?, ?, CAST('{}' AS JSON), 'step2')`,
    [draftId, ctx.userId],
  );
  return draftId;
}

function makePlan(): StoryboardPlan {
  return {
    schemaVersion: 2,
    videoLengthSeconds: 12,
    sceneCount: 2,
    scenes: [
      {
        sceneNumber: 1,
        prompt: 'p1',
        visualPrompt: 'a close shot',
        videoPrompt: 'push in',
        durationSeconds: 6,
        referencedMedia: [],
        transitionNotes: '',
        style: 'cinematic',
      },
      {
        sceneNumber: 2,
        prompt: 'p2',
        visualPrompt: 'a wide shot',
        videoPrompt: 'static',
        durationSeconds: 6,
        referencedMedia: [],
        transitionNotes: '',
        style: 'documentary',
      },
    ],
    musicSegments: [
      {
        name: 'Theme',
        prompt: 'pads',
        compositionPlan: { positive_global_styles: [], negative_global_styles: [], sections: [] },
        startSceneNumber: 1,
        endSceneNumber: 2,
        sourceMode: 'generate_on_step3',
      },
    ],
  } as StoryboardPlan;
}

async function countBlocks(draftId: string, blockType: string): Promise<number> {
  const [rows] = await pool.execute<Array<RowDataPacket & { cnt: number }>>(
    `SELECT COUNT(*) AS cnt FROM storyboard_blocks WHERE draft_id = ? AND block_type = ?`,
    [draftId, blockType],
  );
  return Number(rows[0]!.cnt);
}

async function countRows(table: string, draftId: string): Promise<number> {
  const [rows] = await pool.execute<Array<RowDataPacket & { cnt: number }>>(
    `SELECT COUNT(*) AS cnt FROM ${table} WHERE draft_id = ?`,
    [draftId],
  );
  return Number(rows[0]!.cnt);
}

beforeAll(async () => {
  ctx.userId = randomUUID();
  await pool.execute(
    `INSERT INTO users (user_id, email, display_name, email_verified)
     VALUES (?, ?, ?, 1)`,
    [ctx.userId, `${PREFIX}-${ctx.userId}@example.test`, 'r6f1 Tester'],
  );
});

afterAll(async () => {
  for (const draftId of ctx.draftIds) {
    await pool.execute(`DELETE FROM storyboard_music_blocks WHERE draft_id = ?`, [draftId]);
    await pool.execute(`DELETE FROM storyboard_edges WHERE draft_id = ?`, [draftId]);
    await pool.execute(`DELETE FROM storyboard_blocks WHERE draft_id = ?`, [draftId]);
    await pool.execute(`DELETE FROM generation_drafts WHERE id = ?`, [draftId]);
  }
  await pool.execute(`DELETE FROM users WHERE user_id = ?`, [ctx.userId]);
  await pool.end();
});

describe('materializeScenePlanBlocks (r6-F1, AC-02)', () => {
  it('records start + one scene block per plan scene + end, with edges and music', async () => {
    const draftId = await seedDraft();

    await materializeScenePlanBlocks(pool, { draftId, userId: ctx.userId, plan: makePlan() });

    expect(await countBlocks(draftId, 'scene')).toBe(2);
    expect(await countBlocks(draftId, 'start')).toBe(1);
    expect(await countBlocks(draftId, 'end')).toBe(1);
    expect(await countRows('storyboard_edges', draftId)).toBe(3); // 4 blocks → 3 edges
    expect(await countRows('storyboard_music_blocks', draftId)).toBe(1);

    // The scene blocks carry real ids the cast-extraction getScenes query reads.
    const [scenes] = await pool.execute<Array<RowDataPacket & { id: string; name: string }>>(
      `SELECT id, name FROM storyboard_blocks
        WHERE draft_id = ? AND block_type = 'scene' ORDER BY sort_order ASC`,
      [draftId],
    );
    expect(scenes.map((s) => s.name)).toEqual(['Scene 01', 'Scene 02']);
    expect(scenes.every((s) => typeof s.id === 'string' && s.id.length > 0)).toBe(true);
  });

  it('is idempotent — re-running replaces, never duplicates, and keeps sentinel ids stable', async () => {
    const draftId = await seedDraft();

    await materializeScenePlanBlocks(pool, { draftId, userId: ctx.userId, plan: makePlan() });
    const [firstStart] = await pool.execute<Array<RowDataPacket & { id: string }>>(
      `SELECT id FROM storyboard_blocks WHERE draft_id = ? AND block_type = 'start'`,
      [draftId],
    );

    await materializeScenePlanBlocks(pool, { draftId, userId: ctx.userId, plan: makePlan() });

    expect(await countBlocks(draftId, 'scene')).toBe(2); // not 4
    expect(await countBlocks(draftId, 'start')).toBe(1);
    expect(await countRows('storyboard_music_blocks', draftId)).toBe(1);

    const [secondStart] = await pool.execute<Array<RowDataPacket & { id: string }>>(
      `SELECT id FROM storyboard_blocks WHERE draft_id = ? AND block_type = 'start'`,
      [draftId],
    );
    expect(secondStart[0]!.id).toBe(firstStart[0]!.id); // sentinel reused
  });
});
