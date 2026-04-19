import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useClipTrim, TRIM_HANDLE_PX } from './useClipTrim';
import * as projectStore from '@/store/project-store';
import * as ephemeralStore from '@/store/ephemeral-store';
import * as timelineApi from '../api';
import type { Clip, ProjectDoc } from '@ai-video-editor/project-schema';

// ---------------------------------------------------------------------------
// jsdom polyfill for PointerEvent / MouseEvent
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

const makeClip = (id: string, startFrame: number, durationFrames = 60): Clip => ({
  id,
  type: 'video',
  fileId: 'asset-001',
  trackId: 'track-001',
  startFrame,
  durationFrames,
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
const makeReactPointerEvent = (clientX: number, offsetX: number, button = 0) => {
  const setPointerCapture = vi.fn();
  return {
    button,
    clientX,
    pointerId: 1,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    target: { setPointerCapture },
    currentTarget: {
      getBoundingClientRect: () => ({
        left: clientX - offsetX,
        right: clientX - offsetX + 240,
        top: 0,
        bottom: 36,
        width: 240,
        height: 36,
      }),
    },
  } as unknown as React.PointerEvent;
};

const makeMouseEvent = (clientX: number, offsetX: number) => ({
  clientX,
  currentTarget: {
    getBoundingClientRect: () => ({
      left: clientX - offsetX,
    }),
  },
} as unknown as React.MouseEvent);

/** Dispatches a PointerEvent on the document. */
const dispatchPointerEvent = (type: string, clientX: number) => {
  const releasePointerCapture = vi.fn();
  const event = new PointerEvent(type, { clientX, pointerId: 1, bubbles: true });
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

describe('useClipTrim', () => {
  it('returns null trimInfo initially', () => {
    vi.spyOn(projectStore, 'getSnapshot').mockReturnValue(makeProject([]));
    const { result } = renderHook(() => useClipTrim('project-001'));
    expect(result.current.trimInfo).toBeNull();
  });

  it('TRIM_HANDLE_PX is exported as 8', () => {
    expect(TRIM_HANDLE_PX).toBe(8);
  });

  // ---------------------------------------------------------------------------
  // getTrimCursor
  // ---------------------------------------------------------------------------

  describe('getTrimCursor', () => {
    it('returns ew-resize when pointer is within TRIM_HANDLE_PX of left edge', () => {
      vi.spyOn(projectStore, 'getSnapshot').mockReturnValue(makeProject([]));
      const { result } = renderHook(() => useClipTrim('project-001'));
      // offsetX = 3 (within 8px of left edge)
      const cursor = result.current.getTrimCursor(
        makeMouseEvent(103, 3),
        'clip-001',
        240,
        false,
      );
      expect(cursor).toBe('ew-resize');
    });

    it('returns ew-resize when pointer is within TRIM_HANDLE_PX of right edge', () => {
      vi.spyOn(projectStore, 'getSnapshot').mockReturnValue(makeProject([]));
      const { result } = renderHook(() => useClipTrim('project-001'));
      // offsetX = 235 (clipWidth=240; 240-235=5, within 8px of right edge)
      const cursor = result.current.getTrimCursor(
        makeMouseEvent(335, 235),
        'clip-001',
        240,
        false,
      );
      expect(cursor).toBe('ew-resize');
    });

    it('returns null when pointer is in the middle of the clip', () => {
      vi.spyOn(projectStore, 'getSnapshot').mockReturnValue(makeProject([]));
      const { result } = renderHook(() => useClipTrim('project-001'));
      // offsetX = 120 (middle of 240px clip)
      const cursor = result.current.getTrimCursor(
        makeMouseEvent(220, 120),
        'clip-001',
        240,
        false,
      );
      expect(cursor).toBeNull();
    });

    it('returns null when track is locked', () => {
      vi.spyOn(projectStore, 'getSnapshot').mockReturnValue(makeProject([]));
      const { result } = renderHook(() => useClipTrim('project-001'));
      const cursor = result.current.getTrimCursor(
        makeMouseEvent(103, 3),
        'clip-001',
        240,
        true, // isLocked
      );
      expect(cursor).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // onTrimPointerDown
  // ---------------------------------------------------------------------------

  describe('onTrimPointerDown', () => {
    it('returns false (does not start trim) when pointer is in the middle', () => {
      const clip = makeClip('clip-001', 10);
      vi.spyOn(projectStore, 'getSnapshot').mockReturnValue(makeProject([clip]));
      const { result } = renderHook(() => useClipTrim('project-001'));

      let started = false;
      act(() => {
        // offsetX = 120 (middle)
        started = result.current.onTrimPointerDown(
          makeReactPointerEvent(220, 120),
          'clip-001',
          240,
          false,
        );
      });

      expect(started).toBe(false);
      expect(result.current.trimInfo).toBeNull();
    });

    it('returns false when track is locked', () => {
      const clip = makeClip('clip-001', 10);
      vi.spyOn(projectStore, 'getSnapshot').mockReturnValue(makeProject([clip]));
      const { result } = renderHook(() => useClipTrim('project-001'));

      let started = false;
      act(() => {
        started = result.current.onTrimPointerDown(
          makeReactPointerEvent(103, 3),
          'clip-001',
          240,
          true, // isLocked
        );
      });

      expect(started).toBe(false);
    });

    it('starts left-edge trim when pointer is near left edge', () => {
      const clip = makeClip('clip-001', 10);
      vi.spyOn(projectStore, 'getSnapshot').mockReturnValue(makeProject([clip]));
      const { result } = renderHook(() => useClipTrim('project-001'));

      act(() => {
        // offsetX = 3 (left edge)
        result.current.onTrimPointerDown(
          makeReactPointerEvent(103, 3),
          'clip-001',
          240,
          false,
        );
      });

      expect(result.current.trimInfo).not.toBeNull();
      expect(result.current.trimInfo?.edge).toBe('left');
      expect(result.current.trimInfo?.clipId).toBe('clip-001');
    });

    it('starts right-edge trim when pointer is near right edge', () => {
      const clip = makeClip('clip-001', 10);
      vi.spyOn(projectStore, 'getSnapshot').mockReturnValue(makeProject([clip]));
      const { result } = renderHook(() => useClipTrim('project-001'));

      act(() => {
        // offsetX = 235 (near right edge of 240px clip)
        result.current.onTrimPointerDown(
          makeReactPointerEvent(335, 235),
          'clip-001',
          240,
          false,
        );
      });

      expect(result.current.trimInfo).not.toBeNull();
      expect(result.current.trimInfo?.edge).toBe('right');
    });

    it('returns false when clip is not found in project', () => {
      vi.spyOn(projectStore, 'getSnapshot').mockReturnValue(makeProject([]));
      const { result } = renderHook(() => useClipTrim('project-001'));

      let started = false;
      act(() => {
        started = result.current.onTrimPointerDown(
          makeReactPointerEvent(103, 3),
          'nonexistent',
          240,
          false,
        );
      });

      expect(started).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Trim drag behavior
  // ---------------------------------------------------------------------------

  describe('right-edge trim drag', () => {
    it('updates ghostDurationFrames on pointermove during right-edge trim', () => {
      const clip = makeClip('clip-001', 10, 60);
      vi.spyOn(projectStore, 'getSnapshot').mockReturnValue(makeProject([clip]));
      const { result } = renderHook(() => useClipTrim('project-001'));

      act(() => {
        // Start at right edge of clip (startFrame=10, durationFrames=60)
        // clipWidth=240px, right edge at offsetX=235
        // clientX=335 (left edge of element at 335-235=100, so frame position ~100+240/4=160?)
        // We'll set startPointerX = 100 (simulated)
        result.current.onTrimPointerDown(
          makeReactPointerEvent(335, 235),
          'clip-001',
          240,
          false,
        );
      });

      act(() => {
        // Move right by 20px → +5 frames → duration becomes 65
        dispatchPointerEvent('pointermove', 355);
      });

      expect(result.current.trimInfo?.ghostDurationFrames).toBeGreaterThan(60);
    });

    it('clears trimInfo and calls patchClip on pointerup', async () => {
      const clip = makeClip('clip-001', 10, 60);
      vi.spyOn(projectStore, 'getSnapshot').mockReturnValue(makeProject([clip]));
      vi.spyOn(projectStore, 'setProject');
      const mockPatch = vi.spyOn(timelineApi, 'patchClip').mockResolvedValue(undefined);
      const { result } = renderHook(() => useClipTrim('project-001'));

      act(() => {
        result.current.onTrimPointerDown(
          makeReactPointerEvent(335, 235),
          'clip-001',
          240,
          false,
        );
      });

      await act(async () => {
        dispatchPointerEvent('pointermove', 355);
        dispatchPointerEvent('pointerup', 355);
        await Promise.resolve();
      });

      expect(result.current.trimInfo).toBeNull();
      expect(mockPatch).toHaveBeenCalledWith(
        'project-001',
        'clip-001',
        expect.objectContaining({ durationFrames: expect.any(Number) }),
      );
    });
  });

  describe('left-edge trim drag', () => {
    it('updates ghostStartFrame and ghostDurationFrames on pointermove', () => {
      const clip = makeClip('clip-001', 10, 60);
      vi.spyOn(projectStore, 'getSnapshot').mockReturnValue(makeProject([clip]));
      const { result } = renderHook(() => useClipTrim('project-001'));

      act(() => {
        // clientX=103, offsetX=3 → left edge; element left = 100
        result.current.onTrimPointerDown(
          makeReactPointerEvent(103, 3),
          'clip-001',
          240,
          false,
        );
      });

      act(() => {
        // Move right by 8px → +2 frames → startFrame shifts right, duration shrinks
        dispatchPointerEvent('pointermove', 111);
      });

      // startFrame should increase, duration should decrease
      expect(result.current.trimInfo?.ghostStartFrame).toBeGreaterThan(10);
      expect(result.current.trimInfo?.ghostDurationFrames).toBeLessThan(60);
    });

    it('cannot reduce duration below 1 frame during left-edge trim', () => {
      const clip = makeClip('clip-001', 10, 2); // Only 2 frames duration
      vi.spyOn(projectStore, 'getSnapshot').mockReturnValue(makeProject([clip]));
      const { result } = renderHook(() => useClipTrim('project-001'));

      act(() => {
        result.current.onTrimPointerDown(
          makeReactPointerEvent(103, 3),
          'clip-001',
          8, // 2 frames * 4px = 8px wide
          false,
        );
      });

      act(() => {
        // Move far right — try to push duration below 1
        dispatchPointerEvent('pointermove', 200);
      });

      expect(result.current.trimInfo?.ghostDurationFrames).toBeGreaterThanOrEqual(1);
    });

    it('cannot reduce duration below 1 frame during right-edge trim', () => {
      const clip = makeClip('clip-001', 10, 30);
      vi.spyOn(projectStore, 'getSnapshot').mockReturnValue(makeProject([clip]));
      const { result } = renderHook(() => useClipTrim('project-001'));

      act(() => {
        // Start at right edge
        result.current.onTrimPointerDown(
          makeReactPointerEvent(235, 115), // right edge at 115 out of 120px
          'clip-001',
          120, // 30 frames * 4px
          false,
        );
      });

      act(() => {
        // Move far left — try to push duration below 1
        dispatchPointerEvent('pointermove', 0);
      });

      expect(result.current.trimInfo?.ghostDurationFrames).toBeGreaterThanOrEqual(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Math.round() — float frame values must be integers when patchClip is called
  // ---------------------------------------------------------------------------

  describe('Math.round() — patchClip payload must contain integer frame values', () => {
    it('sends integer durationFrames to patchClip even when pxPerFrame produces a fractional delta', async () => {
      // pxPerFrame=3 means 1px = 0.333... frames; moving 1px produces a float delta.
      vi.spyOn(ephemeralStore, 'getSnapshot').mockReturnValue({
        playheadFrame: 0,
        selectedClipIds: [],
        zoom: 1,
        pxPerFrame: 3,
        scrollOffsetX: 0,
      });

      const clip = makeClip('clip-001', 0, 30); // clipWidth = 30*3 = 90px
      vi.spyOn(projectStore, 'getSnapshot').mockReturnValue(makeProject([clip]));
      vi.spyOn(projectStore, 'setProject');
      const mockPatch = vi.spyOn(timelineApi, 'patchClip').mockResolvedValue(undefined);
      const { result } = renderHook(() => useClipTrim('project-001'));

      act(() => {
        // Start at right edge of 90px clip; clientX=89, offsetX=88 (near right edge)
        result.current.onTrimPointerDown(
          makeReactPointerEvent(89, 88),
          'clip-001',
          90,
          false,
        );
      });

      await act(async () => {
        // Move right by 1px → delta = 1/3 frames — fractional
        dispatchPointerEvent('pointermove', 90);
        dispatchPointerEvent('pointerup', 90);
        await Promise.resolve();
      });

      expect(mockPatch).toHaveBeenCalled();
      const payload = mockPatch.mock.calls[0]![2];
      // durationFrames must be an integer (Math.round applied)
      if (payload.durationFrames !== undefined) {
        expect(Number.isInteger(payload.durationFrames)).toBe(true);
      }
    });

    it('sends integer startFrame to patchClip on left-edge trim with fractional pxPerFrame', async () => {
      vi.spyOn(ephemeralStore, 'getSnapshot').mockReturnValue({
        playheadFrame: 0,
        selectedClipIds: [],
        zoom: 1,
        pxPerFrame: 3,
        scrollOffsetX: 0,
      });

      const clip = makeClip('clip-001', 10, 30);
      vi.spyOn(projectStore, 'getSnapshot').mockReturnValue(makeProject([clip]));
      vi.spyOn(projectStore, 'setProject');
      const mockPatch = vi.spyOn(timelineApi, 'patchClip').mockResolvedValue(undefined);
      const { result } = renderHook(() => useClipTrim('project-001'));

      act(() => {
        // Start at left edge; clientX=31, offsetX=1 (near left edge of 90px clip)
        result.current.onTrimPointerDown(
          makeReactPointerEvent(31, 1),
          'clip-001',
          90,
          false,
        );
      });

      await act(async () => {
        // Move right by 1px → fractional frame shift
        dispatchPointerEvent('pointermove', 32);
        dispatchPointerEvent('pointerup', 32);
        await Promise.resolve();
      });

      expect(mockPatch).toHaveBeenCalled();
      const payload = mockPatch.mock.calls[0]![2];
      if (payload.startFrame !== undefined) {
        expect(Number.isInteger(payload.startFrame)).toBe(true);
      }
      if (payload.durationFrames !== undefined) {
        expect(Number.isInteger(payload.durationFrames)).toBe(true);
      }
    });
  });

  describe('Escape cancellation', () => {
    it('cancels trim on Escape key without calling setProject', () => {
      const clip = makeClip('clip-001', 10, 60);
      const mockSetProject = vi.spyOn(projectStore, 'setProject');
      vi.spyOn(projectStore, 'getSnapshot').mockReturnValue(makeProject([clip]));
      const { result } = renderHook(() => useClipTrim('project-001'));

      act(() => {
        result.current.onTrimPointerDown(
          makeReactPointerEvent(335, 235),
          'clip-001',
          240,
          false,
        );
      });

      act(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });

      expect(result.current.trimInfo).toBeNull();
      expect(mockSetProject).not.toHaveBeenCalled();
    });
  });
});
