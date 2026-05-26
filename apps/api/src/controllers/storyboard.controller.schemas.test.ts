import { describe, expect, it } from 'vitest';

import { musicBlockInsertSchema } from './storyboard.controller.schemas.js';

const BASE_MUSIC_BLOCK = {
  id: '00000000-0000-4000-8000-000000000001',
  draftId: '00000000-0000-4000-8000-000000000002',
  name: 'Opening music',
  sourceMode: 'generate_on_step3',
  prompt: 'Warm instrumental pulse.',
  compositionPlan: {
    positive_global_styles: ['cinematic'],
    negative_global_styles: ['vocals'],
    sections: [
      {
        section_name: 'Intro',
        positive_local_styles: ['warm'],
        negative_local_styles: ['lyrics'],
        duration_ms: 3000,
        lines: [],
      },
    ],
  },
  existingFileId: null,
  startSceneBlockId: '00000000-0000-4000-8000-000000000003',
  endSceneBlockId: '00000000-0000-4000-8000-000000000004',
  positionX: 120,
  positionY: 520,
  sortOrder: 0,
  volume: 0.8,
  fadeInS: 0,
  fadeOutS: 1,
  loopMode: 'trim',
} as const;

describe('storyboard controller schemas', () => {
  it('accepts music blocks that satisfy the shared composition plan schema', () => {
    expect(musicBlockInsertSchema.safeParse(BASE_MUSIC_BLOCK).success).toBe(true);
  });

  it('rejects empty section names using shared project-schema rules', () => {
    const result = musicBlockInsertSchema.safeParse({
      ...BASE_MUSIC_BLOCK,
      compositionPlan: {
        ...BASE_MUSIC_BLOCK.compositionPlan,
        sections: [
          {
            ...BASE_MUSIC_BLOCK.compositionPlan.sections[0],
            section_name: '   ',
          },
        ],
      },
    });

    expect(result.success).toBe(false);
  });

  it('rejects composition plans over the shared total duration limit', () => {
    const result = musicBlockInsertSchema.safeParse({
      ...BASE_MUSIC_BLOCK,
      compositionPlan: {
        ...BASE_MUSIC_BLOCK.compositionPlan,
        sections: Array.from({ length: 6 }, (_, index) => ({
          section_name: `Section ${index + 1}`,
          positive_local_styles: [],
          negative_local_styles: [],
          duration_ms: 120000,
          lines: [],
        })),
      },
    });

    expect(result.success).toBe(false);
  });

  it('rejects lyric line counts over the shared limit', () => {
    const result = musicBlockInsertSchema.safeParse({
      ...BASE_MUSIC_BLOCK,
      compositionPlan: {
        ...BASE_MUSIC_BLOCK.compositionPlan,
        sections: [
          {
            ...BASE_MUSIC_BLOCK.compositionPlan.sections[0],
            lines: Array.from({ length: 31 }, (_, index) => `Line ${index + 1}`),
          },
        ],
      },
    });

    expect(result.success).toBe(false);
  });
});
