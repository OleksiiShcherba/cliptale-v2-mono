import { describe, it, expect } from 'vitest';

import type { StoryboardPlan } from '../schemas/storyboardPlan.schema.js';
import {
  buildStoryboardLayout,
  StoryboardLayoutError,
} from './buildStoryboardLayout.js';

const DRAFT_ID = '11111111-1111-1111-1111-111111111111';

/** Deterministic id factory — sequential so assertions can pin exact ids. */
function makeIdFactory(): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `id-${String(n).padStart(3, '0')}`;
  };
}

function basePlan(overrides: Partial<StoryboardPlan> = {}): StoryboardPlan {
  return {
    schemaVersion: 2,
    videoLengthSeconds: 30,
    sceneCount: 2,
    scenes: [
      {
        sceneNumber: 1,
        prompt: 'Scene one prompt',
        visualPrompt: 'A close shot, soft light',
        videoPrompt: 'slow push in',
        durationSeconds: 5.4,
        referencedMedia: [
          { fileId: '22222222-2222-2222-2222-222222222222', mediaType: 'image', label: 'ref a' },
        ],
        transitionNotes: '',
        style: 'cinematic',
      },
      {
        sceneNumber: 2,
        prompt: 'Scene two prompt',
        visualPrompt: 'A wide shot',
        videoPrompt: 'static',
        durationSeconds: 6,
        referencedMedia: [],
        transitionNotes: '',
        style: 'documentary',
      },
    ],
    musicSegments: [],
    ...overrides,
  } as StoryboardPlan;
}

describe('buildStoryboardLayout', () => {
  it('produces start + one block per scene + end, chained by edges', () => {
    const layout = buildStoryboardLayout({
      draftId: DRAFT_ID,
      plan: basePlan(),
      newId: makeIdFactory(),
    });

    expect(layout.blocks.map((b) => b.blockType)).toEqual(['start', 'scene', 'scene', 'end']);
    expect(layout.blocks).toHaveLength(4);
    // Edges chain every consecutive pair: 3 edges for 4 blocks.
    expect(layout.edges).toHaveLength(3);
    layout.edges.forEach((edge, i) => {
      expect(edge.sourceBlockId).toBe(layout.blocks[i]!.id);
      expect(edge.targetBlockId).toBe(layout.blocks[i + 1]!.id);
      expect(edge.draftId).toBe(DRAFT_ID);
    });
  });

  it('maps scene fields: padded name, visualPrompt→prompt, rounded duration, style, ordered media', () => {
    const layout = buildStoryboardLayout({
      draftId: DRAFT_ID,
      plan: basePlan(),
      newId: makeIdFactory(),
    });

    const scenes = layout.blocks.filter((b) => b.blockType === 'scene');
    expect(scenes[0]).toMatchObject({
      blockType: 'scene',
      name: 'Scene 01',
      prompt: 'A close shot, soft light',
      videoPrompt: 'slow push in',
      durationS: 5, // round(5.4)
      sortOrder: 1,
      style: 'cinematic',
      draftId: DRAFT_ID,
    });
    expect(scenes[0]!.mediaItems).toEqual([
      expect.objectContaining({
        fileId: '22222222-2222-2222-2222-222222222222',
        mediaType: 'image',
        sortOrder: 0,
      }),
    ]);
    expect(scenes[1]).toMatchObject({ name: 'Scene 02', durationS: 6, sortOrder: 2, style: 'documentary' });
    expect(scenes[1]!.mediaItems).toEqual([]);
  });

  it('lays scenes out left-to-right with a fixed gap and shared baseline Y', () => {
    const layout = buildStoryboardLayout({
      draftId: DRAFT_ID,
      plan: basePlan(),
      newId: makeIdFactory(),
    });
    const [start, s1, s2, end] = layout.blocks;
    expect(start!.positionX).toBe(50);
    expect(s1!.positionX).toBe(300);
    expect(s2!.positionX).toBe(300 + 252); // FIRST_SCENE_X + NODE_GAP_X
    expect(end!.positionX).toBe(300 + 2 * 252);
    expect([start, s1, s2, end].every((b) => b!.positionY === 300)).toBe(true);
    expect(start!.sortOrder).toBe(0);
    expect(end!.sortOrder).toBe(9999);
  });

  it('reuses provided sentinel ids instead of minting new ones', () => {
    const layout = buildStoryboardLayout({
      draftId: DRAFT_ID,
      plan: basePlan(),
      newId: makeIdFactory(),
      existingStartId: 'start-keep',
      existingEndId: 'end-keep',
    });
    expect(layout.blocks[0]!.id).toBe('start-keep');
    expect(layout.blocks[layout.blocks.length - 1]!.id).toBe('end-keep');
  });

  it('builds music blocks mapped to the covered scene block ids', () => {
    const plan = basePlan({
      musicSegments: [
        {
          name: 'Theme',
          prompt: 'gentle pads',
          compositionPlan: { positive_global_styles: [], negative_global_styles: [], sections: [] },
          startSceneNumber: 1,
          endSceneNumber: 2,
          sourceMode: 'generate_on_step3',
        },
      ],
    });
    const layout = buildStoryboardLayout({ draftId: DRAFT_ID, plan, newId: makeIdFactory() });
    const sceneBlocks = layout.blocks.filter((b) => b.blockType === 'scene');
    expect(layout.musicBlocks).toHaveLength(1);
    expect(layout.musicBlocks[0]).toMatchObject({
      draftId: DRAFT_ID,
      startSceneBlockId: sceneBlocks[0]!.id,
      endSceneBlockId: sceneBlocks[1]!.id,
      sortOrder: 0,
    });
    expect(layout.musicBlocks[0]!.name.startsWith('Music 01')).toBe(true);
  });

  it('throws StoryboardLayoutError when a music segment references scenes out of range', () => {
    const plan = basePlan({
      musicSegments: [
        {
          name: 'Bad',
          prompt: 'x',
          compositionPlan: { positive_global_styles: [], negative_global_styles: [], sections: [] },
          startSceneNumber: 1,
          endSceneNumber: 5, // only 2 scenes exist
          sourceMode: 'generate_on_step3',
        },
      ],
    });
    expect(() => buildStoryboardLayout({ draftId: DRAFT_ID, plan, newId: makeIdFactory() })).toThrow(
      StoryboardLayoutError,
    );
  });
});
