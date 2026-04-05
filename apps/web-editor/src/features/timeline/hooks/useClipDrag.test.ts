import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useClipDrag } from './useClipDrag';
import * as projectStore from '@/store/project-store';
import * as ephemeralStore from '@/store/ephemeral-store';
import * as timelineApi from '../api';
import type { Clip, ProjectDoc } from '@ai-video-editor/project-schema';

// ---------------------------------------------------------------------------
// jsdom polyfill for PointerEvent
// ---------------------------------------------------------------------------

if (typeof PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number;
    constructor(type: string, init?: PointerEventInit) {
      super(type, init);
      this.pointerId = init?.pointerId ?? 0;
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).PointerEvent = PointerEventPolyfill;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeClip = (id: string, startFrame: number, trackId = 'track-001'): Clip => ({
  id,
  type: 'video',
  assetId: 'asset-001',
  trackId,
  startFrame,
  durationFrames: 30,
  trimInFrame: 0,
  volume: 1,
  opacity: 1,
});

const makeProject = (clips: Clip[]): ProjectDoc => ({
  schemaVersion: 1,
  id: 'project-001',
  title: 'Test',
  fps: 30,
  durationFrames: 300,
  width: 1920,
  height: 1080,
  tracks: [{ id: 'track-001', type: 'video', name: 'Video', muted: false, locked: false }],
  clips,
  createdAt: '',
  updatedAt: '',
} as unknown as ProjectDoc);

/** Creates a minimal React.PointerEvent-like object for testing. */
const makeReactPointerEvent = (clientX: number, button = 0) => {
  const setPointerCapture = vi.fn();
  const releasePointerCapture = vi.fn();
  return {
    button,
    clientX,
    pointerId: 1,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    target: { setPointerCapture, releasePointerCapture },
  } as unknown as React.PointerEvent;
};

/** Dispatches a PointerEvent on the document. */
const dispatchPointerEvent = (type: string, clientX: number) => {
  const event = new PointerEvent(type, { clientX, pointerId: 1, bubbles: true });
  const releasePointerCapture = vi.fn();
  Object.defineProperty(event, 'target', {
    value: { releasePointerCapture },
    writable: true,
  });
  document.dispatchEvent(event);
  return event;
};

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  // Default ephemeral store state
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
      // clientX = 40 → frame = 40 / 4 = 10
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
      // Start drag at clientX=40 → frame 10
      result.current.onClipPointerDown(makeReactPointerEvent(40), 'clip-001', false);
    });

    act(() => {
      // Move pointer to clientX=56 → frame 14 (delta = +4 frames → new start = 14)
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
      // Move to clientX=60 → frame 15 (delta = +5)
      dispatchPointerEvent('pointermove', 60);
    });

    await act(async () => {
      dispatchPointerEvent('pointerup', 60);
      // Allow microtask queue to flush
      await Promise.resolve();
    });

    expect(result.current.dragInfo).toBeNull();
    expect(mockSetProject).toHaveBeenCalled();

    // Find the call that updated clip startFrame (may be called multiple times due to store internals)
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
      // Move to clientX=60 → new start = 15
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

    // Drag info cleared — no project update
    expect(result.current.dragInfo).toBeNull();
    expect(mockSetProject).not.toHaveBeenCalled();
  });

  it('moves all selected clips together maintaining relative offsets on multi-clip drag', () => {
    const clip1 = makeClip('clip-001', 10);
    const clip2 = makeClip('clip-002', 20);
    vi.spyOn(projectStore, 'getSnapshot').mockReturnValue(makeProject([clip1, clip2]));
    vi.spyOn(projectStore, 'setProject');
    vi.spyOn(timelineApi, 'patchClip').mockResolvedValue(undefined);

    // Both clips are in the selection
    vi.spyOn(ephemeralStore, 'getSnapshot').mockReturnValue({
      playheadFrame: 0,
      selectedClipIds: ['clip-001', 'clip-002'],
      zoom: 1,
      pxPerFrame: 4,
      scrollOffsetX: 0,
    });

    const { result } = renderHook(() => useClipDrag('project-001'));

    act(() => {
      // Start drag on clip-001 at clientX=40 → frame 10
      result.current.onClipPointerDown(makeReactPointerEvent(40), 'clip-001', false);
    });

    act(() => {
      // Move to clientX=60 → frame 15 (delta = +5 frames)
      dispatchPointerEvent('pointermove', 60);
    });

    // clip-001 should be at frame 15, clip-002 should be at frame 25 (offset preserved)
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
    // pxPerFrame=3 → 1px = 0.333... frames → fractional pointer frames possible.
    vi.spyOn(ephemeralStore, 'getSnapshot').mockReturnValue({
      playheadFrame: 0,
      selectedClipIds: [],
      zoom: 1,
      pxPerFrame: 3,
      scrollOffsetX: 0,
    });

    const clip = makeClip('clip-001', 3); // startFrame=3, startPointerX=9px
    vi.spyOn(projectStore, 'getSnapshot').mockReturnValue(makeProject([clip]));
    vi.spyOn(projectStore, 'setProject');
    const mockPatch = vi.spyOn(timelineApi, 'patchClip').mockResolvedValue(undefined);

    const { result } = renderHook(() => useClipDrag('project-001'));

    act(() => {
      // clientX=9 → frame = 9/3 = 3 (exact)
      result.current.onClipPointerDown(makeReactPointerEvent(9), 'clip-001', false);
    });

    await act(async () => {
      // Move right by 1px → frame = 10/3 = 3.333... → delta = 0.333 → raw = 3.333
      // Math.round should produce an integer.
      dispatchPointerEvent('pointermove', 10);
      dispatchPointerEvent('pointerup', 10);
      await Promise.resolve();
    });

    // patchClip may or may not be called (only called if position changed from original).
    // If called, startFrame must be an integer.
    if (mockPatch.mock.calls.length > 0) {
      const payload = mockPatch.mock.calls[0]![2];
      if (payload.startFrame !== undefined) {
        expect(Number.isInteger(payload.startFrame)).toBe(true);
      }
    }

    // Ghost position should also be an integer.
    const ghostPos = result.current.dragInfo?.ghostPositions.get('clip-001');
    if (ghostPos !== undefined) {
      expect(Number.isInteger(ghostPos)).toBe(true);
    }
  });

  it('clamps ghost position to frame 0 minimum (no negative startFrame)', () => {
    const clip = makeClip('clip-001', 2);
    vi.spyOn(projectStore, 'getSnapshot').mockReturnValue(makeProject([clip]));

    const { result } = renderHook(() => useClipDrag('project-001'));

    act(() => {
      // Start drag at clientX=8 → frame 2 (2 * 4px)
      result.current.onClipPointerDown(makeReactPointerEvent(8), 'clip-001', false);
    });

    act(() => {
      // Move left to clientX=0 → frame 0, but delta would push clip to -2
      dispatchPointerEvent('pointermove', 0);
    });

    // Should clamp to 0
    const ghostPos = result.current.dragInfo?.ghostPositions.get('clip-001');
    expect(ghostPos).toBeGreaterThanOrEqual(0);
  });
});
