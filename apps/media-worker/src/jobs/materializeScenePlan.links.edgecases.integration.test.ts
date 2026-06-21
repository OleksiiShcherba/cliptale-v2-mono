/**
 * Edge-case tests for reference→scene link derivation inside
 * materializeScenePlanBlocks (subtask 2).
 *
 * (c) Ambiguous duplicate (cast_type, name) reference block is NOT linked.
 * (d) Proposal entry with a non-existent scene id → no FK error and no spurious link.
 *
 * Run from apps/media-worker:
 *   APP_DB_PASSWORD=cliptale APP_REDIS_URL=redis://localhost:6380 \
 *     npx vitest run src/jobs/materializeScenePlan.links.edgecases.integration.test.ts
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

describe('materializeScenePlanBlocks — reference→scene link edge cases', () => {
  it('(c) ambiguous duplicate (cast_type,name) reference block is NOT linked', async () => {
    const draftId = await seedDraft(ctx);

    // Pre-generate IDs for a 1-scene plan (5 newId calls: start, scene1, end, edge1, edge2).
    const startId  = randomUUID();
    const sceneId  = randomUUID();
    const endId    = randomUUID();
    const edge1Id  = randomUUID();
    const edge2Id  = randomUUID();

    // Do all seeding BEFORE configuring the mock to avoid consuming queued values.
    // Two reference blocks share the same (cast_type, name) → ambiguous.
    const dup1 = await seedRefBlock(ctx, { draftId, castType: 'character', name: 'Duplicate' });
    const dup2 = await seedRefBlock(ctx, { draftId, castType: 'character', name: 'Duplicate' });

    await seedCastJob(ctx, {
      draftId,
      proposalJson: {
        cast: [{ type: 'character', name: 'Duplicate', scene_block_ids: [sceneId] }],
      },
    });

    // Queue IDs after seeding so seeding's randomUUID calls don't consume them.
    const mockedRandomUUID = vi.mocked(randomUUID);
    mockedRandomUUID
      .mockReturnValueOnce(startId)
      .mockReturnValueOnce(sceneId)
      .mockReturnValueOnce(endId)
      .mockReturnValueOnce(edge1Id)
      .mockReturnValueOnce(edge2Id);

    await materializeScenePlanBlocks(pool, { draftId, userId: ctx.userId, plan: makePlan(1) });

    mockedRandomUUID.mockRestore();

    const [newSceneId] = await readSceneIds(draftId);
    expect(newSceneId).toBe(sceneId);

    // Neither duplicate block should be linked (ambiguous → skipped).
    expect(await linkExists(dup1, newSceneId!)).toBe(false);
    expect(await linkExists(dup2, newSceneId!)).toBe(false);
  });

  it('(d) entry with a non-existent scene id → no FK error and no spurious link', async () => {
    const draftId = await seedDraft(ctx);

    // Pre-generate IDs for a 1-scene plan (5 newId calls: start, scene1, end, edge1, edge2).
    const startId  = randomUUID();
    const sceneId  = randomUUID();
    const endId    = randomUUID();
    const edge1Id  = randomUUID();
    const edge2Id  = randomUUID();

    const heroBlock = await seedRefBlock(ctx, { draftId, castType: 'character', name: 'Hero' });
    const phantomSceneId = randomUUID(); // does not exist in any storyboard_blocks row

    // Proposal: Hero → [realSceneId, phantomSceneId]. The phantom id is NOT in the
    // just-inserted set — it must be skipped silently (FK-safe intersection).
    await seedCastJob(ctx, {
      draftId,
      proposalJson: {
        cast: [
          {
            type: 'character',
            name: 'Hero',
            scene_block_ids: [sceneId, phantomSceneId],
          },
        ],
      },
    });

    // Queue IDs after seeding so seeding's randomUUID calls don't consume them.
    const mockedRandomUUID = vi.mocked(randomUUID);
    mockedRandomUUID
      .mockReturnValueOnce(startId)
      .mockReturnValueOnce(sceneId)
      .mockReturnValueOnce(endId)
      .mockReturnValueOnce(edge1Id)
      .mockReturnValueOnce(edge2Id);

    // Should not throw despite phantomSceneId not being in the just-inserted set.
    await expect(
      materializeScenePlanBlocks(pool, { draftId, userId: ctx.userId, plan: makePlan(1) }),
    ).resolves.toBeUndefined();

    mockedRandomUUID.mockRestore();

    const [newSceneId] = await readSceneIds(draftId);
    expect(newSceneId).toBe(sceneId);

    // sceneId IS in the just-inserted set AND in the proposal → linked.
    expect(await linkExists(heroBlock, newSceneId!)).toBe(true);
    // phantomSceneId is NOT in the just-inserted set → no FK error, no link.
    expect(await linkExists(heroBlock, phantomSceneId)).toBe(false);
  });
});
