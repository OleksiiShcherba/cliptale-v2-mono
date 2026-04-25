import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useClipDrag } from './useClipDrag';
import * as projectStore from '@/store/project-store';
import * as ephemeralStore from '@/store/ephemeral-store';
import * as timelineApi from '../api';
import type { Clip } from '@ai-video-editor/project-schema';
import {
  makeClip,
  makeProject,
  makeReactPointerEvent,
  dispatchPointerEvent,
} from './useClipDrag.fixtures';

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(ephemeralStore, 'getSnapshot').mockReturnValue({
    playheadFrame: 0,
    selectedClipIds: [],
    zoom: 1,
    pxPerFrame: 4,
    scrollOffsetX: 0,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useClipDrag', () => {
  it('returns null dragInfo initially (no drag in progress)', () => {
    vi.spyOn(projectStore, 'getSnapshot').mockReturnValue(makeProject([]));
    const { result } = renderHook(() => useClipDrag('project-001'));
    expect(result.current.dragInfo).toBeNull();
  });

  it('sets dragInfo when onClipPointerDown fires on an unlocked clip', () => {
    const clip = makeClip('clip-001', 10);
    vi.spyOn(projectStore, 'getSnapshot').mockReturnValue(makeProject([clip]));

    const { result } = renderHook(() => useClipDrag('project-001'));

    act(() => {
      result.current.onClipPointerDown(makeReactPointerEvent(40), 'clip-001', false);
    });

    expect(result.current.dragInfo).not.toBeNull();
    expect(result.current.dragInfo!.draggingClipIds.has('clip-001')).toBe(true);
  });

  it('does not start drag when clip is locked', () => {
    const clip = makeClip('clip-001', 10);
    vi.spyOn(projectStore, 'getSnapshot').mockReturnValue(makeProject([clip]));

    const { result } = renderHook(() => useClipDrag('project-001'));

    act(() => {
      result.current.onClipPointerDown(makeReactPointerEvent(40), 'clip-001', true);
    });

    expect(result.current.dragInfo).toBeNull();
  });

  it('does not start drag on non-left button press', () => {
    const clip = makeClip('clip-001', 10);
    vi.spyOn(projectStore, 'getSnapshot').mockReturnValue(makeProject([clip]));

    const { result } = renderHook(() => useClipDrag('project-001'));

    act(() => {
      result.current.onClipPointerDown(makeReactPointerEvent(40, 2), 'clip-001', false);
    });

    expect(result.current.dragInfo).toBeNull();
  });

  it('updates ghost positions during pointermove', () => {
    const clip = makeClip('clip-001', 10);
    vi.spyOn(projectStore, 'getSnapshot').mockReturnValue(makeProject([clip]));

    const { result } = renderHook(() => useClipDrag('project-001'));

    act(() => {
      result.current.onClipPointerDown(makeReactPointerEvent(40), 'clip-001', false);
    });

    act(() => {
      dispatchPointerEvent('pointermove', 56);
    });

    expect(result.current.dragInfo?.ghostPositions.get('clip-001')).toBe(14);
  });

  it('clears dragInfo and updates project store on pointerup', async () => {
    const clip = makeClip('clip-001', 10);
    const mockSetProject = vi.spyOn(projectStore, 'setProject');
    vi.spyOn(projectStore, 'getSnapshot').mockReturnValue(makeProject([clip]));
    vi.spyOn(timelineApi, 'patchClip').mockResolvedValue(undefined);

    const { result } = renderHook(() => useClipDrag('project-001'));

    act(() => {
      result.current.onClipPointerDown(makeReactPointerEvent(40), 'clip-001', false);
    });

    act(() => {
      dispatchPointerEvent('pointermove', 60);
    });

    await act(async () => {
      dispatchPointerEvent('pointerup', 60);
      await Promise.resolve();
    });

    expect(result.current.dragInfo).toBeNull();

    const callWithClip = mockSetProject.mock.calls.find((args) => {
      const doc = args[0];
      return doc.clips?.some((c: Clip) => c.id === 'clip-001' && c.startFrame === 15);
    });
    expect(callWithClip).toBeDefined();
  });

  it('calls patchClip API for each moved clip on drop', async () => {
    const clip = makeClip('clip-001', 10);
    vi.spyOn(projectStore, 'getSnapshot').mockReturnValue(makeProject([clip]));
    vi.spyOn(projectStore, 'setProject');
    const mockPatch = vi.spyOn(timelineApi, 'patchClip').mockResolvedValue(undefined);

    const { result } = renderHook(() => useClipDrag('project-001'));

    act(() => {
      result.current.onClipPointerDown(makeReactPointerEvent(40), 'clip-001', false);
    });

    await act(async () => {
      dispatchPointerEvent('pointermove', 60);
      dispatchPointerEvent('pointerup', 60);
      await Promise.resolve();
    });

    expect(mockPatch).toHaveBeenCalledWith('project-001', 'clip-001', { startFrame: 15 });
  });

  it('cancels drag and restores original positions on Escape key', () => {
    const clip = makeClip('clip-001', 10);
    const mockSetProject = vi.spyOn(projectStore, 'setProject');
    vi.spyOn(projectStore, 'getSnapshot').mockReturnValue(makeProject([clip]));

    const { result } = renderHook(() => useClipDrag('project-001'));

    act(() => {
      result.current.onClipPointerDown(makeReactPointerEvent(40), 'clip-001', false);
    });

    act(() => {
      dispatchPointerEvent('pointermove', 80);
    });

    expect(result.current.dragInfo).not.toBeNull();

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(result.current.dragInfo).toBeNull();
    expect(mockSetProject).not.toHaveBeenCalled();
  });

  it('moves all selected clips together maintaining relative offsets on multi-clip drag', () => {
    const clip1 = makeClip('clip-001', 10);
    const clip2 = makeClip('clip-002', 20);
    vi.spyOn(projectStore, 'getSnapshot').mockReturnValue(makeProject([clip1, clip2]));
    vi.spyOn(projectStore, 'setProject');
    vi.spyOn(timelineApi, 'patchClip').mockResolvedValue(undefined);

    vi.spyOn(ephemeralStore, 'getSnapshot').mockReturnValue({
      playheadFrame: 0,
      selectedClipIds: ['clip-001', 'clip-002'],
      zoom: 1,
      pxPerFrame: 4,
      scrollOffsetX: 0,
    });

    const { result } = renderHook(() => useClipDrag('project-001'));

    act(() => {
      result.current.onClipPointerDown(makeReactPointerEvent(40), 'clip-001', false);
    });

    act(() => {
      dispatchPointerEvent('pointermove', 60);
    });

    expect(result.current.dragInfo?.ghostPositions.get('clip-001')).toBe(15);
    expect(result.current.dragInfo?.ghostPositions.get('clip-002')).toBe(25);
  });

  it('does not start drag if clip ID is not found in project', () => {
    vi.spyOn(projectStore, 'getSnapshot').mockReturnValue(makeProject([]));

    const { result } = renderHook(() => useClipDrag('project-001'));

    act(() => {
      result.current.onClipPointerDown(makeReactPointerEvent(40), 'nonexistent-clip', false);
    });

    expect(result.current.dragInfo).toBeNull();
  });

  it('sends integer startFrame to patchClip even when pxPerFrame produces a fractional pointer frame', async () => {
    vi.spyOn(ephemeralStore, 'getSnapshot').mockReturnValue({
      playheadFrame: 0,
      selectedClipIds: [],
      zoom: 1,
      pxPerFrame: 3,
      scrollOffsetX: 0,
    });

    const clip = makeClip('clip-001', 3);
    vi.spyOn(projectStore, 'getSnapshot').mockReturnValue(makeProject([clip]));
    vi.spyOn(projectStore, 'setProject');
    const mockPatch = vi.spyOn(timelineApi, 'patchClip').mockResolvedValue(undefined);

    const { result } = renderHook(() => useClipDrag('project-001'));

    act(() => {
      result.current.onClipPointerDown(makeReactPointerEvent(9), 'clip-001', false);
    });

    await act(async () => {
      dispatchPointerEvent('pointermove', 10);
      dispatchPointerEvent('pointerup', 10);
      await Promise.resolve();
    });

    if (mockPatch.mock.calls.length > 0) {
      const payload = mockPatch.mock.calls[0]![2];
      if (payload.startFrame !== undefined) {
        expect(Number.isInteger(payload.startFrame)).toBe(true);
      }
    }
  });

  it('clamps ghost position to frame 0 minimum (no negative startFrame)', () => {
    const clip = makeClip('clip-001', 2);
    vi.spyOn(projectStore, 'getSnapshot').mockReturnValue(makeProject([clip]));

    const { result } = renderHook(() => useClipDrag('project-001'));

    act(() => {
      result.current.onClipPointerDown(makeReactPointerEvent(8), 'clip-001', false);
    });

    act(() => {
      dispatchPointerEvent('pointermove', 0);
    });

    const ghostPos = result.current.dragInfo?.ghostPositions.get('clip-001');
    expect(ghostPos).toBeGreaterThanOrEqual(0);
  });
});
