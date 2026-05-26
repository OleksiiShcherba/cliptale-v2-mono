import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import type { StoryboardMusicBlock } from '../types';

vi.mock('../api', () => ({
  saveStoryboard: vi.fn().mockResolvedValue(undefined),
}));

import { saveStoryboard } from '../api';
import { useStoryboardAutosave } from './useStoryboardAutosave';
import { DEFAULT_EDGES, DEFAULT_NODES, DRAFT_ID } from './useStoryboardAutosave.fixtures';

function deferred<T = void>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const HYDRATED_MUSIC_BLOCK: StoryboardMusicBlock = {
  id: '00000000-0000-4000-8000-000000000001',
  draftId: '00000000-0000-4000-8000-000000000010',
  name: 'Opening music',
  sourceMode: 'generate_on_step3',
  prompt: 'Soft ambient pulse',
  compositionPlan: null,
  existingFileId: null,
  startSceneBlockId: '00000000-0000-4000-8000-000000000020',
  endSceneBlockId: '00000000-0000-4000-8000-000000000021',
  positionX: 120,
  positionY: 520,
  sortOrder: 0,
  volume: 0.8,
  fadeInS: 0,
  fadeOutS: 1,
  loopMode: 'trim',
  generationStatus: 'queued',
  generationJobId: '00000000-0000-4000-8000-000000000030',
  outputFileId: null,
  errorMessage: null,
  createdAt: '2026-05-26T00:00:00Z',
  updatedAt: '2026-05-26T00:00:00Z',
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(saveStoryboard).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('useStoryboardAutosave — music save payloads', () => {
  it('strips hydrated music job fields when saveNow receives snapshot music blocks', async () => {
    const { result } = renderHook(() =>
      useStoryboardAutosave(DRAFT_ID, DEFAULT_NODES, DEFAULT_EDGES),
    );

    await act(async () => {
      await result.current.saveNow({ musicBlocks: [HYDRATED_MUSIC_BLOCK] });
    });

    const [, payload] = vi.mocked(saveStoryboard).mock.calls[0]!;
    const sentMusicBlock = payload.musicBlocks?.[0] as Record<string, unknown>;
    expect(sentMusicBlock).toEqual({
      id: HYDRATED_MUSIC_BLOCK.id,
      draftId: HYDRATED_MUSIC_BLOCK.draftId,
      name: HYDRATED_MUSIC_BLOCK.name,
      sourceMode: HYDRATED_MUSIC_BLOCK.sourceMode,
      prompt: HYDRATED_MUSIC_BLOCK.prompt,
      compositionPlan: HYDRATED_MUSIC_BLOCK.compositionPlan,
      existingFileId: HYDRATED_MUSIC_BLOCK.existingFileId,
      startSceneBlockId: HYDRATED_MUSIC_BLOCK.startSceneBlockId,
      endSceneBlockId: HYDRATED_MUSIC_BLOCK.endSceneBlockId,
      positionX: HYDRATED_MUSIC_BLOCK.positionX,
      positionY: HYDRATED_MUSIC_BLOCK.positionY,
      sortOrder: HYDRATED_MUSIC_BLOCK.sortOrder,
      volume: HYDRATED_MUSIC_BLOCK.volume,
      fadeInS: HYDRATED_MUSIC_BLOCK.fadeInS,
      fadeOutS: HYDRATED_MUSIC_BLOCK.fadeOutS,
      loopMode: HYDRATED_MUSIC_BLOCK.loopMode,
    });
    expect(sentMusicBlock).not.toHaveProperty('generationStatus');
    expect(sentMusicBlock).not.toHaveProperty('generationJobId');
    expect(sentMusicBlock).not.toHaveProperty('outputFileId');
    expect(sentMusicBlock).not.toHaveProperty('errorMessage');
    expect(sentMusicBlock).not.toHaveProperty('createdAt');
    expect(sentMusicBlock).not.toHaveProperty('updatedAt');
  });

  it('defers saving existing music until an audio asset is selected', async () => {
    const existingWithoutAsset: StoryboardMusicBlock = {
      ...HYDRATED_MUSIC_BLOCK,
      sourceMode: 'existing',
      prompt: null,
      compositionPlan: null,
      existingFileId: null,
    };
    const existingWithAsset: StoryboardMusicBlock = {
      ...existingWithoutAsset,
      existingFileId: 'audio-1',
    };
    const { result } = renderHook(() =>
      useStoryboardAutosave(DRAFT_ID, DEFAULT_NODES, DEFAULT_EDGES),
    );

    await act(async () => {
      await result.current.saveNow({ musicBlocks: [existingWithoutAsset] });
    });

    expect(saveStoryboard).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.saveNow({ musicBlocks: [existingWithAsset] });
    });

    expect(saveStoryboard).toHaveBeenCalledTimes(1);
    const [, payload] = vi.mocked(saveStoryboard).mock.calls[0]!;
    expect(payload.musicBlocks?.[0]).toEqual(expect.objectContaining({
      sourceMode: 'existing',
      existingFileId: 'audio-1',
    }));
  });

  it('replays a queued music override after an in-flight save', async () => {
    const firstSave = deferred<void>();
    vi.mocked(saveStoryboard)
      .mockImplementationOnce(() => firstSave.promise)
      .mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useStoryboardAutosave(DRAFT_ID, DEFAULT_NODES, DEFAULT_EDGES),
    );

    void act(() => {
      void result.current.saveNow();
    });
    expect(saveStoryboard).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.saveNow({ musicBlocks: [HYDRATED_MUSIC_BLOCK] });
    });
    expect(saveStoryboard).toHaveBeenCalledTimes(1);

    await act(async () => {
      firstSave.resolve();
      await firstSave.promise;
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(saveStoryboard).toHaveBeenCalledTimes(2);
    const [, payload] = vi.mocked(saveStoryboard).mock.calls[1]!;
    const sentMusicBlock = payload.musicBlocks?.[0] as Record<string, unknown>;
    expect(sentMusicBlock).toEqual({
      id: HYDRATED_MUSIC_BLOCK.id,
      draftId: HYDRATED_MUSIC_BLOCK.draftId,
      name: HYDRATED_MUSIC_BLOCK.name,
      sourceMode: HYDRATED_MUSIC_BLOCK.sourceMode,
      prompt: HYDRATED_MUSIC_BLOCK.prompt,
      compositionPlan: HYDRATED_MUSIC_BLOCK.compositionPlan,
      existingFileId: HYDRATED_MUSIC_BLOCK.existingFileId,
      startSceneBlockId: HYDRATED_MUSIC_BLOCK.startSceneBlockId,
      endSceneBlockId: HYDRATED_MUSIC_BLOCK.endSceneBlockId,
      positionX: HYDRATED_MUSIC_BLOCK.positionX,
      positionY: HYDRATED_MUSIC_BLOCK.positionY,
      sortOrder: HYDRATED_MUSIC_BLOCK.sortOrder,
      volume: HYDRATED_MUSIC_BLOCK.volume,
      fadeInS: HYDRATED_MUSIC_BLOCK.fadeInS,
      fadeOutS: HYDRATED_MUSIC_BLOCK.fadeOutS,
      loopMode: HYDRATED_MUSIC_BLOCK.loopMode,
    });
    expect(sentMusicBlock).not.toHaveProperty('generationStatus');
    expect(sentMusicBlock).not.toHaveProperty('generationJobId');
    expect(sentMusicBlock).not.toHaveProperty('outputFileId');
    expect(sentMusicBlock).not.toHaveProperty('errorMessage');
    expect(sentMusicBlock).not.toHaveProperty('createdAt');
    expect(sentMusicBlock).not.toHaveProperty('updatedAt');
  });

  it('does not warn on beforeunload after a successful save with a music override', async () => {
    const { result } = renderHook(() =>
      useStoryboardAutosave(DRAFT_ID, DEFAULT_NODES, DEFAULT_EDGES),
    );

    await act(async () => {
      await result.current.saveNow({ musicBlocks: [HYDRATED_MUSIC_BLOCK] });
    });

    const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });
});
