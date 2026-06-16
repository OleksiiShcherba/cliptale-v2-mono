/**
 * E2E — storyboard canvas layout
 *
 * Verifies that generated music blocks are placed on the same horizontal line
 * and that reference blocks are positioned below the music row, aligned to
 * their first linked scene.
 *
 * Uses page.route() to serve known block positions so assertions are deterministic.
 */

import { test, expect } from '@playwright/test';

import { installCorsWorkaround } from './helpers/cors-workaround';
import {
  readBearerToken,
  createTempDraft,
  initializeDraft,
  cleanupDraft,
  waitForCanvas,
} from './helpers/storyboard';

// Layout constants that mirror the production code.
const SCENE_Y = 300;
const MUSIC_Y = SCENE_Y + 280 + 40; // 620
const MUSIC_LANE_H = 132;
const REF_GAP = 40;
const REF_H = 180;
const REF_SPACING = 20;
const REF_Y_OFFSET = 350;

// Reference row canvas-Y for blocks with (positionX=0, positionY=0)
function refCanvasY(stackIndex = 0): number {
  return MUSIC_Y + MUSIC_LANE_H + REF_GAP + stackIndex * (REF_H + REF_SPACING);
}

let token: string;
let draftId: string;

const NOW = '2026-06-16T00:00:00.000Z';
const BASE_BLOCK = {
  videoPrompt: null as string | null,
  durationS: 5,
  style: null as string | null,
  createdAt: NOW,
  updatedAt: NOW,
  mediaItems: [] as unknown[],
};

const SCENE1_ID = 'layout-s1-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SCENE2_ID = 'layout-s2-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const SCENE1_X = 300;
const SCENE2_X = 552; // 300 + 252 (NODE_GAP_X)

function jsonOk(body: unknown) {
  return {
    status: 200,
    contentType: 'application/json',
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-credentials': 'true',
    },
    body: JSON.stringify(body),
  };
}

function pipelineIdle(dId: string) {
  return {
    draft_id: dId, active_phase: 'scene', active_run_phase: null,
    phases: { scene: { status: 'idle' }, reference_data: { status: 'idle' }, reference_image: { status: 'idle' }, scene_image: { status: 'idle' } },
    payload: null, version: 1, cost_estimate: null, error_message: null, updated_at: NOW,
  };
}

/**
 * Extract position from React Flow node transform string "translate(Xpx, Ypx)".
 * Returns null if transform cannot be parsed.
 */
function parseTransform(transform: string): { x: number; y: number } | null {
  const m = transform.match(/translate\(([^,]+)(?:px)?,\s*([^)]+)(?:px)?\)/);
  return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : null;
}

/**
 * Wait for the canvas to load then read all React Flow node positions keyed by
 * their data-id attribute. Returns a map of nodeId → { x, y }.
 */
async function readNodePositions(page: import('@playwright/test').Page): Promise<Map<string, { x: number; y: number }>> {
  await waitForCanvas(page);
  // Give React Flow time to settle positions
  await page.waitForTimeout(1000);

  const entries = await page.locator('.react-flow__node').evaluateAll((nodes) =>
    (nodes as HTMLElement[]).map((n) => ({
      id: n.getAttribute('data-id') ?? '',
      transform: n.style.transform,
    })),
  );

  const map = new Map<string, { x: number; y: number }>();
  for (const { id, transform } of entries) {
    const m = transform.match(/translate\(([^,]+)(?:px)?,\s*([^)]+)(?:px)?\)/);
    if (m && id) map.set(id, { x: parseFloat(m[1]), y: parseFloat(m[2]) });
  }
  return map;
}

test.beforeAll(async ({ browser }) => {
  token = await readBearerToken();
  const page = await browser.newPage();
  await installCorsWorkaround(page, token);
  draftId = await createTempDraft(page.request, token);
  await initializeDraft(page.request, token, draftId);
  await page.close();
});

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage();
  await cleanupDraft(page.request, token, draftId);
  await page.close();
});

// ── Test 1: Music blocks on same horizontal row ──────────────────────────────

test.describe('Music block layout — same horizontal row', () => {
  test.setTimeout(30_000);

  test('two music blocks from different scenes share the same Y coordinate', async ({ page }) => {
    const MUSIC1_ID = 'layout-m1-cccc-cccc-cccc-cccccccccccc';
    const MUSIC2_ID = 'layout-m2-dddd-dddd-dddd-dddddddddddd';

    await installCorsWorkaround(page, token);

    await page.route(`**/storyboards/${draftId}`, async (route) => {
      const url = new URL(route.request().url());
      if (!url.pathname.endsWith(`/storyboards/${draftId}`) || route.request().method() !== 'GET') return route.continue();
      return route.fulfill(jsonOk({
        blocks: [
          { ...BASE_BLOCK, id: 'start-id', draftId, blockType: 'start', name: null, prompt: null, positionX: 50,     positionY: SCENE_Y, sortOrder: 0 },
          { ...BASE_BLOCK, id: SCENE1_ID, draftId, blockType: 'scene', name: 'Scene 01', prompt: 'p1', positionX: SCENE1_X, positionY: SCENE_Y, sortOrder: 1 },
          { ...BASE_BLOCK, id: SCENE2_ID, draftId, blockType: 'scene', name: 'Scene 02', prompt: 'p2', positionX: SCENE2_X, positionY: SCENE_Y, sortOrder: 2 },
          { ...BASE_BLOCK, id: 'end-id',  draftId, blockType: 'end',   name: null, prompt: null, positionX: 804, positionY: SCENE_Y, sortOrder: 999 },
        ],
        edges: [
          { id: 'e1', draftId, sourceBlockId: 'start-id', targetBlockId: SCENE1_ID },
          { id: 'e2', draftId, sourceBlockId: SCENE1_ID,  targetBlockId: SCENE2_ID },
          { id: 'e3', draftId, sourceBlockId: SCENE2_ID,  targetBlockId: 'end-id' },
        ],
        musicBlocks: [
          {
            id: MUSIC1_ID, draftId,
            name: 'Music 01 - Theme', sourceMode: 'generate_on_step3', prompt: 'warm pads',
            compositionPlan: null, existingFileId: null,
            startSceneBlockId: SCENE1_ID, endSceneBlockId: SCENE1_ID,
            positionX: SCENE1_X, positionY: MUSIC_Y,
            sortOrder: 0, volume: 0.8, fadeInS: 0, fadeOutS: 1, loopMode: 'trim',
            generationStatus: null, generationJobId: null, outputFileId: null, errorMessage: null,
            createdAt: NOW, updatedAt: NOW,
          },
          {
            id: MUSIC2_ID, draftId,
            name: 'Music 02 - Climax', sourceMode: 'generate_on_step3', prompt: 'epic',
            compositionPlan: null, existingFileId: null,
            startSceneBlockId: SCENE2_ID, endSceneBlockId: SCENE2_ID,
            positionX: SCENE2_X, positionY: MUSIC_Y, // same Y
            sortOrder: 1, volume: 0.8, fadeInS: 0, fadeOutS: 1, loopMode: 'trim',
            generationStatus: null, generationJobId: null, outputFileId: null, errorMessage: null,
            createdAt: NOW, updatedAt: NOW,
          },
        ],
      }));
    });

    await page.route(`**/${draftId}/pipeline`, async (route) => {
      if (route.request().method() === 'GET') return route.fulfill(jsonOk(pipelineIdle(draftId)));
      return route.continue();
    });
    await page.route(`**/${draftId}/references/blocks`, async (route) => {
      if (route.request().method() === 'GET') return route.fulfill(jsonOk({ items: [] }));
      return route.continue();
    });

    await page.goto(`/storyboard/${draftId}`);
    const positions = await readNodePositions(page);

    const m1Pos = positions.get(MUSIC1_ID);
    const m2Pos = positions.get(MUSIC2_ID);

    expect(m1Pos).toBeDefined();
    expect(m2Pos).toBeDefined();

    // Both music blocks should share the same horizontal Y
    expect(m1Pos!.y).toBe(MUSIC_Y);
    expect(m2Pos!.y).toBe(MUSIC_Y);
    expect(m1Pos!.y).toBe(m2Pos!.y);

    // X aligned to respective start scenes
    expect(m1Pos!.x).toBe(SCENE1_X);
    expect(m2Pos!.x).toBe(SCENE2_X);
  });
});

// ── Test 2: Reference blocks below music row, aligned to first scene ─────────

test.describe('Reference block layout — below music row', () => {
  test.setTimeout(30_000);

  test('two reference blocks from different first scenes are below music row and X-aligned to their scene', async ({ page }) => {
    const REF1_ID = 'layout-r1-eeee-eeee-eeee-eeeeeeeeeeee';
    const REF2_ID = 'layout-r2-ffff-ffff-ffff-ffffffffffff';

    await installCorsWorkaround(page, token);

    await page.route(`**/storyboards/${draftId}`, async (route) => {
      const url = new URL(route.request().url());
      if (!url.pathname.endsWith(`/storyboards/${draftId}`) || route.request().method() !== 'GET') return route.continue();
      return route.fulfill(jsonOk({
        blocks: [
          { ...BASE_BLOCK, id: 'start-id', draftId, blockType: 'start', name: null, prompt: null, positionX: 50,     positionY: SCENE_Y, sortOrder: 0 },
          { ...BASE_BLOCK, id: SCENE1_ID, draftId, blockType: 'scene', name: 'Scene 01', prompt: 'p1', positionX: SCENE1_X, positionY: SCENE_Y, sortOrder: 1 },
          { ...BASE_BLOCK, id: SCENE2_ID, draftId, blockType: 'scene', name: 'Scene 02', prompt: 'p2', positionX: SCENE2_X, positionY: SCENE_Y, sortOrder: 2 },
          { ...BASE_BLOCK, id: 'end-id',  draftId, blockType: 'end',   name: null, prompt: null, positionX: 804, positionY: SCENE_Y, sortOrder: 999 },
        ],
        edges: [
          { id: 'e1', draftId, sourceBlockId: 'start-id', targetBlockId: SCENE1_ID },
          { id: 'e2', draftId, sourceBlockId: SCENE1_ID,  targetBlockId: SCENE2_ID },
          { id: 'e3', draftId, sourceBlockId: SCENE2_ID,  targetBlockId: 'end-id' },
        ],
        musicBlocks: [],
      }));
    });

    await page.route(`**/${draftId}/pipeline`, async (route) => {
      if (route.request().method() === 'GET') return route.fulfill(jsonOk(pipelineIdle(draftId)));
      return route.continue();
    });

    // ref1 linked to scene1, ref2 linked to scene2 — both at (0,0) → auto-layout
    await page.route(`**/${draftId}/references/blocks`, async (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill(jsonOk({
          items: [
            {
              blockId: REF1_ID, draftId, flowId: 'flow-1',
              castType: 'character', name: 'Hero', description: null,
              sortOrder: 0, windowStatus: 'pending', errorMessage: null, version: 1,
              positionX: 0, positionY: 0,
              sceneBlockIds: [SCENE1_ID],
              previewFileId: null, stars: [],
              createdAt: NOW, updatedAt: NOW,
            },
            {
              blockId: REF2_ID, draftId, flowId: 'flow-2',
              castType: 'environment', name: 'Forest', description: null,
              sortOrder: 1, windowStatus: 'pending', errorMessage: null, version: 1,
              positionX: 0, positionY: 0,
              sceneBlockIds: [SCENE2_ID],
              previewFileId: null, stars: [],
              createdAt: NOW, updatedAt: NOW,
            },
          ],
        }));
      }
      return route.continue();
    });

    await page.goto(`/storyboard/${draftId}`);
    const positions = await readNodePositions(page);

    const r1Pos = positions.get(REF1_ID);
    const r2Pos = positions.get(REF2_ID);

    expect(r1Pos).toBeDefined();
    expect(r2Pos).toBeDefined();

    const expectedRefY = refCanvasY(0); // 792

    // Both refs: Y below music row
    expect(r1Pos!.y).toBe(expectedRefY);
    expect(r2Pos!.y).toBe(expectedRefY);

    // X: each aligned to its first linked scene
    expect(r1Pos!.x).toBe(SCENE1_X);
    expect(r2Pos!.x).toBe(SCENE2_X);
  });

  test('two reference blocks from the SAME first scene are stacked vertically', async ({ page }) => {
    const REF1_ID = 'layout-r3-gggg-gggg-gggg-gggggggggggg';
    const REF2_ID = 'layout-r4-hhhh-hhhh-hhhh-hhhhhhhhhhhh';

    await installCorsWorkaround(page, token);

    await page.route(`**/storyboards/${draftId}`, async (route) => {
      const url = new URL(route.request().url());
      if (!url.pathname.endsWith(`/storyboards/${draftId}`) || route.request().method() !== 'GET') return route.continue();
      return route.fulfill(jsonOk({
        blocks: [
          { ...BASE_BLOCK, id: 'start-id', draftId, blockType: 'start', name: null, prompt: null, positionX: 50,     positionY: SCENE_Y, sortOrder: 0 },
          { ...BASE_BLOCK, id: SCENE1_ID, draftId, blockType: 'scene', name: 'Scene 01', prompt: 'p1', positionX: SCENE1_X, positionY: SCENE_Y, sortOrder: 1 },
          { ...BASE_BLOCK, id: 'end-id',  draftId, blockType: 'end',   name: null, prompt: null, positionX: 552, positionY: SCENE_Y, sortOrder: 999 },
        ],
        edges: [
          { id: 'e1', draftId, sourceBlockId: 'start-id', targetBlockId: SCENE1_ID },
          { id: 'e2', draftId, sourceBlockId: SCENE1_ID,  targetBlockId: 'end-id' },
        ],
        musicBlocks: [],
      }));
    });

    await page.route(`**/${draftId}/pipeline`, async (route) => {
      if (route.request().method() === 'GET') return route.fulfill(jsonOk(pipelineIdle(draftId)));
      return route.continue();
    });

    // Both refs linked to same scene1 → should be stacked vertically
    await page.route(`**/${draftId}/references/blocks`, async (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill(jsonOk({
          items: [
            {
              blockId: REF1_ID, draftId, flowId: 'flow-3',
              castType: 'character', name: 'Knight', description: null,
              sortOrder: 0, windowStatus: 'pending', errorMessage: null, version: 1,
              positionX: 0, positionY: 0,
              sceneBlockIds: [SCENE1_ID],
              previewFileId: null, stars: [],
              createdAt: NOW, updatedAt: NOW,
            },
            {
              blockId: REF2_ID, draftId, flowId: 'flow-4',
              castType: 'character', name: 'Wizard', description: null,
              sortOrder: 1, windowStatus: 'pending', errorMessage: null, version: 1,
              positionX: 0, positionY: 0,
              sceneBlockIds: [SCENE1_ID],
              previewFileId: null, stars: [],
              createdAt: NOW, updatedAt: NOW,
            },
          ],
        }));
      }
      return route.continue();
    });

    await page.goto(`/storyboard/${draftId}`);
    const positions = await readNodePositions(page);

    const r1Pos = positions.get(REF1_ID);
    const r2Pos = positions.get(REF2_ID);

    expect(r1Pos).toBeDefined();
    expect(r2Pos).toBeDefined();

    // Both aligned to same scene X
    expect(r1Pos!.x).toBe(SCENE1_X);
    expect(r2Pos!.x).toBe(SCENE1_X);

    // Stacked vertically: first at row 0, second at row 1
    expect(r1Pos!.y).toBe(refCanvasY(0));
    expect(r2Pos!.y).toBe(refCanvasY(1));
    expect(r2Pos!.y).toBeGreaterThan(r1Pos!.y);
  });

  test('reference block with explicit saved position uses stored position, not auto-layout', async ({ page }) => {
    const REF_CUSTOM_ID = 'layout-r5-iiii-iiii-iiii-iiiiiiiiiiii';
    const CUSTOM_X = 999;
    const CUSTOM_STORED_Y = 200;

    await installCorsWorkaround(page, token);

    await page.route(`**/storyboards/${draftId}`, async (route) => {
      const url = new URL(route.request().url());
      if (!url.pathname.endsWith(`/storyboards/${draftId}`) || route.request().method() !== 'GET') return route.continue();
      return route.fulfill(jsonOk({
        blocks: [
          { ...BASE_BLOCK, id: 'start-id', draftId, blockType: 'start', name: null, prompt: null, positionX: 50,     positionY: SCENE_Y, sortOrder: 0 },
          { ...BASE_BLOCK, id: SCENE1_ID, draftId, blockType: 'scene', name: 'Scene 01', prompt: 'p1', positionX: SCENE1_X, positionY: SCENE_Y, sortOrder: 1 },
          { ...BASE_BLOCK, id: 'end-id',  draftId, blockType: 'end',   name: null, prompt: null, positionX: 552, positionY: SCENE_Y, sortOrder: 999 },
        ],
        edges: [
          { id: 'e1', draftId, sourceBlockId: 'start-id', targetBlockId: SCENE1_ID },
          { id: 'e2', draftId, sourceBlockId: SCENE1_ID,  targetBlockId: 'end-id' },
        ],
        musicBlocks: [],
      }));
    });

    await page.route(`**/${draftId}/pipeline`, async (route) => {
      if (route.request().method() === 'GET') return route.fulfill(jsonOk(pipelineIdle(draftId)));
      return route.continue();
    });

    await page.route(`**/${draftId}/references/blocks`, async (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill(jsonOk({
          items: [
            {
              blockId: REF_CUSTOM_ID, draftId, flowId: 'flow-5',
              castType: 'character', name: 'Dragon', description: null,
              sortOrder: 0, windowStatus: 'pending', errorMessage: null, version: 1,
              positionX: CUSTOM_X, positionY: CUSTOM_STORED_Y, // explicitly placed
              sceneBlockIds: [SCENE1_ID],
              previewFileId: null, stars: [],
              createdAt: NOW, updatedAt: NOW,
            },
          ],
        }));
      }
      return route.continue();
    });

    await page.goto(`/storyboard/${draftId}`);
    const positions = await readNodePositions(page);

    const refPos = positions.get(REF_CUSTOM_ID);
    expect(refPos).toBeDefined();

    // Custom position: stored values used (offset still applied on render)
    expect(refPos!.x).toBe(CUSTOM_X);
    expect(refPos!.y).toBe(CUSTOM_STORED_Y + REF_Y_OFFSET);
  });
});
