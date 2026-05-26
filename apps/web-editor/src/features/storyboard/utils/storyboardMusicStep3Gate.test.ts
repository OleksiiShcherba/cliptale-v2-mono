import { describe, expect, it } from 'vitest';

import type { StoryboardMusicBlock } from '@/features/storyboard/types';

import { hasUnresolvedStep3Music } from './storyboardMusicStep3Gate';

function musicBlock(overrides: Partial<StoryboardMusicBlock>): StoryboardMusicBlock {
  return {
    id: 'music-1',
    draftId: 'draft-1',
    name: 'Music',
    sourceMode: 'generate_on_step3',
    prompt: null,
    compositionPlan: null,
    existingFileId: null,
    startSceneBlockId: 'scene-1',
    endSceneBlockId: 'scene-1',
    positionX: 0,
    positionY: 0,
    sortOrder: 0,
    volume: 0.8,
    fadeInS: 0,
    fadeOutS: 1,
    loopMode: 'trim',
    generationStatus: null,
    generationJobId: null,
    outputFileId: null,
    errorMessage: null,
    createdAt: '2026-05-26T00:00:00Z',
    updatedAt: '2026-05-26T00:00:00Z',
    ...overrides,
  };
}

describe('storyboardMusicStep3Gate', () => {
  it('blocks existing mode without a selected audio file', () => {
    expect(hasUnresolvedStep3Music([musicBlock({ sourceMode: 'existing' })])).toBe(true);
  });

  it('allows existing mode with a selected audio file', () => {
    expect(hasUnresolvedStep3Music([
      musicBlock({ sourceMode: 'existing', existingFileId: 'audio-file-1' }),
    ])).toBe(false);
  });

  it('allows generate_now only when ready with an output file', () => {
    expect(hasUnresolvedStep3Music([
      musicBlock({ sourceMode: 'generate_now', generationStatus: 'ready', outputFileId: 'file-1' }),
    ])).toBe(false);
  });

  it('blocks unresolved generate_now music', () => {
    expect(hasUnresolvedStep3Music([
      musicBlock({ sourceMode: 'generate_now', generationStatus: 'running', outputFileId: null }),
    ])).toBe(true);
  });

  it('allows pending generate_on_step3 music', () => {
    expect(hasUnresolvedStep3Music([
      musicBlock({ sourceMode: 'generate_on_step3', generationStatus: null, outputFileId: null }),
    ])).toBe(false);
  });
});
