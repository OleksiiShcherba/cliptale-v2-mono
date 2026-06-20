import { describe, expect, it } from 'vitest';

import { musicBlockInsertSchema, blockInsertSchema } from './storyboard.controller.schemas.js';

const BASE_BLOCK = {
  id: '00000000-0000-4000-8000-0000000000a1',
  draftId: '00000000-0000-4000-8000-0000000000a2',
  blockType: 'scene',
  name: 'Scene',
  prompt: 'A prompt',
  durationS: 5,
  positionX: 0,
  positionY: 0,
  sortOrder: 0,
  style: null,
} as const;

const SNAP_ID = '00000000-0000-4000-8000-0000000000b1';
const FILE_ID = '00000000-0000-4000-8000-0000000000c1';
const MEDIA_ID = '00000000-0000-4000-8000-0000000000d1';

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

  it('accepts a motion_graphic media item with a snapshot id and null fileId (AC-04)', () => {
    const result = blockInsertSchema.safeParse({
      ...BASE_BLOCK,
      mediaItems: [
        { id: MEDIA_ID, fileId: null, mediaType: 'motion_graphic', sortOrder: 0, motionGraphicSnapshotId: SNAP_ID },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mediaItems?.[0]?.motionGraphicSnapshotId).toBe(SNAP_ID);
    }
  });

  it('accepts a motion_graphic media item with a nested motionGraphic.snapshotId', () => {
    const result = blockInsertSchema.safeParse({
      ...BASE_BLOCK,
      mediaItems: [
        { id: MEDIA_ID, mediaType: 'motion_graphic', sortOrder: 0, motionGraphic: { snapshotId: SNAP_ID } },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mediaItems?.[0]?.motionGraphicSnapshotId).toBe(SNAP_ID);
    }
  });

  it('rejects a motion_graphic media item with no snapshot id', () => {
    const result = blockInsertSchema.safeParse({
      ...BASE_BLOCK,
      mediaItems: [{ id: MEDIA_ID, fileId: null, mediaType: 'motion_graphic', sortOrder: 0 }],
    });
    expect(result.success).toBe(false);
  });

  it('still requires fileId for an image media item', () => {
    const result = blockInsertSchema.safeParse({
      ...BASE_BLOCK,
      mediaItems: [{ id: MEDIA_ID, fileId: null, mediaType: 'image', sortOrder: 0 }],
    });
    expect(result.success).toBe(false);
  });

  it('accepts an image media item with a fileId (unchanged behaviour)', () => {
    const result = blockInsertSchema.safeParse({
      ...BASE_BLOCK,
      mediaItems: [{ id: MEDIA_ID, fileId: FILE_ID, mediaType: 'image', sortOrder: 0 }],
    });
    expect(result.success).toBe(true);
  });
});
