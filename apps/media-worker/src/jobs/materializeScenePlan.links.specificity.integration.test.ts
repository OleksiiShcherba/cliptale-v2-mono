/**
 * Per-scene specificity + idempotency tests for reference→scene link derivation
 * inside materializeScenePlanBlocks (subtask 2).
 *
 * (a) Hero links ONLY to its own scene, NOT to others — per-scene specificity.
 * (b) Re-materialization with a stale proposal produces 0 links and no error.
 *
 * Run from apps/media-worker:
 *   APP_DB_PASSWORD=cliptale APP_REDIS_URL=redis://localhost:6380 \
 *     npx vitest run src/jobs/materializeScenePlan.links.specificity.integration.test.ts
 */
import { randomUUID } from 'node:crypto';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

import { pool } from '@/lib/db.js';
import { materializeScenePlanBlocks } from '@/jobs/materializeScenePlan.js';
import {
  makeCtx,
  initCtx,
  teardownCtx,
  seedDraft,
  seedRefBlock,
  seedCastJob,
  countLinks,
  linkExists,
  readSceneIds,
  makePlan,
} from '@/jobs/materializeScenePlan.links.fixtures.js';

// ── vi.mock must be at module top-level (Vitest hoists it) ──────────────────
// We mock node:crypto so that in specific tests we can control randomUUID output
// (to pre-determine the scene block ids that will be inserted, matching the
// proposal's sceneBlockIds). All other UUID calls in the test file itself use
// the real randomUUID via the local import above.
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return { ...actual, randomUUID: vi.fn(actual.randomUUID) };
});

const ctx = makeCtx();

beforeAll(async () => {
  await initCtx(ctx);
});

afterAll(async () => {
  await teardownCtx(ctx);
});

// ── tests ──────────────────────────────────────────────────────────────────────

describe('materializeScenePlanBlocks — reference→scene link specificity', () => {
  /**
   * (a) Per-scene specificity: Hero is linked ONLY to sceneA, NOT to sceneB.
   *
   * Design: pre-generate known UUIDs, do all seeding first (seeding consumes
   * real randomUUID calls from the mock fallback), then configure mockReturnValueOnce
   * just before calling materializeScenePlanBlocks so the 7 newId() calls inside
   * buildStoryboardLayout get our deterministic values. Seed the proposal with
   * sceneAId for Hero and sceneBId for Forest.
   * After materialize, assert Hero→sceneA and NOT Hero→sceneB.
   */
  it('(a) Hero links to its own scene only — per-scene specificity (NOT link-all)', async () => {
    const draftId = await seedDraft(ctx);

    // Pre-generate known IDs using the real randomUUID (mock falls back to real impl
    // until mockReturnValueOnce is configured). These calls happen NOW, before seeding.
    const startId  = randomUUID();
    const sceneAId = randomUUID(); // scene 1 — Hero's scene
    const sceneBId = randomUUID(); // scene 2 — Forest's scene
    const endId    = randomUUID();
    const edge1Id  = randomUUID();
    const edge2Id  = randomUUID();
    const edge3Id  = randomUUID();

    // Do all seeding BEFORE configuring the mock, so seeding's randomUUID calls
    // (for jobId and refBlockIds) consume the real implementation (not our queued values).
    await seedCastJob(ctx, {
      draftId,
      proposalJson: {
        cast: [
          { type: 'character',   name: 'Hero',   scene_block_ids: [sceneAId] },
          { type: 'environment', name: 'Forest', scene_block_ids: [sceneBId] },
        ],
      },
    });
    const heroBlock   = await seedRefBlock(ctx, { draftId, castType: 'character',   name: 'Hero' });
    const forestBlock = await seedRefBlock(ctx, { draftId, castType: 'environment', name: 'Forest' });

    // Now queue the IDs in the order buildStoryboardLayout calls newId() for a
    // 2-scene, no-media, no-music plan with no existing sentinels (7 calls:
    // start, scene1, scene2, end, edge1, edge2, edge3).
    const mockedRandomUUID = vi.mocked(randomUUID);
    mockedRandomUUID
      .mockReturnValueOnce(startId)
      .mockReturnValueOnce(sceneAId)
      .mockReturnValueOnce(sceneBId)
      .mockReturnValueOnce(endId)
      .mockReturnValueOnce(edge1Id)
      .mockReturnValueOnce(edge2Id)
      .mockReturnValueOnce(edge3Id);

    // Materialize — the mock ensures scene blocks get sceneAId and sceneBId.
    await materializeScenePlanBlocks(pool, { draftId, userId: ctx.userId, plan: makePlan(2) });

    // Restore the mock so subsequent tests use real randomUUID.
    mockedRandomUUID.mockRestore();

    // Confirm the layout actually used our known IDs.
    const [insertedScene1, insertedScene2] = await readSceneIds(draftId);
    expect(insertedScene1).toBe(sceneAId);
    expect(insertedScene2).toBe(sceneBId);

    // Per-scene specificity assertions — the key regression check:
    // Hero must link to sceneA and MUST NOT link to sceneB.
    expect(await linkExists(heroBlock, sceneAId)).toBe(true);
    expect(await linkExists(heroBlock, sceneBId)).toBe(false);  // <-- catches the link-all bug

    // Forest is linked to sceneB only.
    expect(await linkExists(forestBlock, sceneBId)).toBe(true);
    expect(await linkExists(forestBlock, sceneAId)).toBe(false);
  });

  /**
   * (b) Re-materialization (second call with the same proposal) leaves links
   * present and correct (no double-insert, no wipe).
   *
   * Design: two-pass. First materialize → get sceneA, sceneB. Seed proposal
   * linking Hero to sceneA and Forest to sceneB. Second materialize → new scene
   * IDs are generated (sceneC, sceneD) and the proposal is now stale.
   * Per-scene filter yields no links (intersection is empty). The test asserts
   * that INSERT IGNORE is idempotent (no FK error, count stable at 0) — verifying
   * the idempotency property when re-materializing with a stale proposal.
   *
   * Note: when ids are truly current (first-time materialize after cast-extraction),
   * links ARE created — tested in case (a). When stale (job redelivery after
   * re-materialize), the correct behaviour is 0 links rather than wrong links.
   */
  it('(b) re-materialization with stale proposal produces no links and no error — idempotent', async () => {
    const draftId = await seedDraft(ctx);

    // First materialize to get the scene ids for the proposal.
    await materializeScenePlanBlocks(pool, { draftId, userId: ctx.userId, plan: makePlan(2) });
    const [sceneAId, sceneBId] = await readSceneIds(draftId);

    const heroBlock   = await seedRefBlock(ctx, { draftId, castType: 'character',   name: 'Hero' });
    const forestBlock = await seedRefBlock(ctx, { draftId, castType: 'environment', name: 'Forest' });
    await seedCastJob(ctx, {
      draftId,
      proposalJson: {
        cast: [
          { type: 'character',   name: 'Hero',   scene_block_ids: [sceneAId!] },
          { type: 'environment', name: 'Forest', scene_block_ids: [sceneBId!] },
        ],
      },
    });

    // Second materialize — generates NEW scene ids; proposal's sceneBlockIds are stale.
    // Per-scene filter: intersection({new_scene_ids}, {sceneA, sceneB}) = {} → 0 links.
    await expect(
      materializeScenePlanBlocks(pool, { draftId, userId: ctx.userId, plan: makePlan(2) }),
    ).resolves.toBeUndefined();

    // Third materialize — same outcome, idempotent.
    await expect(
      materializeScenePlanBlocks(pool, { draftId, userId: ctx.userId, plan: makePlan(2) }),
    ).resolves.toBeUndefined();

    // 0 links because proposal ids are stale (not in the just-inserted set).
    // This is correct: stale → no links, not wrong links.
    expect(await countLinks(draftId)).toBe(0);

    // ref blocks exist but have no links (no FK violation, no error thrown).
    const [newScene1, newScene2] = await readSceneIds(draftId);
    expect(await linkExists(heroBlock,   newScene1!)).toBe(false);
    expect(await linkExists(forestBlock, newScene2!)).toBe(false);
  });
});
