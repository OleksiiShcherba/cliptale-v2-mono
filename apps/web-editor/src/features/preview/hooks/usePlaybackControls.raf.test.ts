import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — vi.mock() is hoisted before all imports by Vitest's transform.
// ---------------------------------------------------------------------------

vi.mock('@/store/project-store.js', () => ({
  useProjectStore: vi.fn(),
}));

vi.mock('@/store/ephemeral-store.js', () => ({
  setPlayheadFrame: vi.fn(),
}));

vi.mock('@/store/timeline-refs.js', () => ({
  updateTimelinePlayheadFrame: vi.fn(),
}));

import * as projectStore from '@/store/project-store.js';
import * as ephemeralStore from '@/store/ephemeral-store.js';
import * as timelineRefs from '@/store/timeline-refs.js';

import { usePlaybackControls } from './usePlaybackControls.js';
import { makePlayerRef, makeProjectDoc } from './usePlaybackControls.fixtures.js';

const mockUseProjectStore = vi.mocked(projectStore.useProjectStore);
const mockSetPlayheadFrame = vi.mocked(ephemeralStore.setPlayheadFrame);
const mockUpdateTimelinePlayheadFrame = vi.mocked(timelineRefs.updateTimelinePlayheadFrame);

// ---------------------------------------------------------------------------
// usePlaybackControls — rAF loop tests
// ---------------------------------------------------------------------------

describe('usePlaybackControls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseProjectStore.mockReturnValue(makeProjectDoc() as ReturnType<typeof mockUseProjectStore>);

    // Default stub: rAF captures the callback but never invokes it automatically.
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('rAF loop — live frame updates during playback', () => {
    it('updates currentFrame on each rAF tick while playing', () => {
      // Synchronous fake rAF: captures the callback so we can fire it manually.
      let capturedCallback: FrameRequestCallback | null = null;
      vi.stubGlobal(
        'requestAnimationFrame',
        vi.fn((cb: FrameRequestCallback) => {
          capturedCallback = cb;
          return 1;
        }),
      );

      const { ref, currentFrame: frameState, playing } = makePlayerRef();
      playing.value = true;
      frameState.value = 45;
      const { result } = renderHook(() => usePlaybackControls(ref));

      act(() => {
        result.current.play();
      });

      // Simulate one rAF tick.
      act(() => {
        if (capturedCallback) capturedCallback(0);
      });

      expect(result.current.currentFrame).toBe(45);
    });

    it('updates timecode on each rAF tick while playing', () => {
      let capturedCallback: FrameRequestCallback | null = null;
      vi.stubGlobal(
        'requestAnimationFrame',
        vi.fn((cb: FrameRequestCallback) => {
          capturedCallback = cb;
          return 1;
        }),
      );

      mockUseProjectStore.mockReturnValue(makeProjectDoc({ fps: 30 }) as ReturnType<typeof mockUseProjectStore>);
      const { ref, currentFrame: frameState, playing } = makePlayerRef();
      playing.value = true;
      frameState.value = 30; // 1 second at 30 fps → 00:00:01:00
      const { result } = renderHook(() => usePlaybackControls(ref));

      act(() => {
        result.current.play();
      });

      act(() => {
        if (capturedCallback) capturedCallback(0);
      });

      expect(result.current.timecode).toBe('00:00:01:00');
    });

    it('sets currentFrame to finalFrame when player stops itself', () => {
      let capturedCallback: FrameRequestCallback | null = null;
      vi.stubGlobal(
        'requestAnimationFrame',
        vi.fn((cb: FrameRequestCallback) => {
          capturedCallback = cb;
          return 1;
        }),
      );

      const { ref, player, currentFrame: frameState, playing } = makePlayerRef();
      // Player is playing but will report isPlaying=false on tick (auto-stopped).
      playing.value = true;
      frameState.value = 299;
      player.isPlaying.mockReturnValue(false);

      const { result } = renderHook(() => usePlaybackControls(ref));

      act(() => {
        result.current.play();
      });

      // isPlayingRef is now true (synced via useEffect inside act).
      // Manually fire one tick — player.isPlaying() returns false, so loop ends.
      act(() => {
        if (capturedCallback) capturedCallback(0);
      });

      expect(result.current.currentFrame).toBe(299);
      expect(result.current.isPlaying).toBe(false);
    });

    it('preserves --playhead-frame CSS custom property alongside React state update', () => {
      let capturedCallback: FrameRequestCallback | null = null;
      vi.stubGlobal(
        'requestAnimationFrame',
        vi.fn((cb: FrameRequestCallback) => {
          capturedCallback = cb;
          return 1;
        }),
      );

      const { ref, currentFrame: frameState, playing } = makePlayerRef();
      playing.value = true;
      frameState.value = 60;
      const { result } = renderHook(() => usePlaybackControls(ref));

      // Attach a real DOM div to the containerRef so the CSS property is set.
      const div = document.createElement('div');
      (result.current.containerRef as React.MutableRefObject<HTMLDivElement>).current = div;

      act(() => {
        result.current.play();
      });

      act(() => {
        if (capturedCallback) capturedCallback(0);
      });

      expect(div.style.getPropertyValue('--playhead-frame')).toBe('60');
      expect(result.current.currentFrame).toBe(60);
    });

    it('calls updateTimelinePlayheadFrame with the current frame on each rAF tick (Bug 2)', () => {
      // Asserts the Bug 2 fix: the rAF tick must call the timeline bridge instead of
      // setPlayheadFrame to avoid 60fps React re-renders (architecture §7).
      let capturedCallback: FrameRequestCallback | null = null;
      vi.stubGlobal(
        'requestAnimationFrame',
        vi.fn((cb: FrameRequestCallback) => {
          capturedCallback = cb;
          return 1;
        }),
      );

      const { ref, currentFrame: frameState, playing } = makePlayerRef();
      playing.value = true;
      frameState.value = 72;
      const { result } = renderHook(() => usePlaybackControls(ref));

      act(() => {
        result.current.play();
      });

      mockUpdateTimelinePlayheadFrame.mockClear();

      // Simulate one rAF tick.
      act(() => {
        if (capturedCallback) capturedCallback(0);
      });

      expect(mockUpdateTimelinePlayheadFrame).toHaveBeenCalledWith(72);
    });

    it('calls setPlayheadFrame with finalFrame when player stops itself at end (Bug 2)', () => {
      let capturedCallback: FrameRequestCallback | null = null;
      vi.stubGlobal(
        'requestAnimationFrame',
        vi.fn((cb: FrameRequestCallback) => {
          capturedCallback = cb;
          return 1;
        }),
      );

      const { ref, player, currentFrame: frameState, playing } = makePlayerRef();
      playing.value = true;
      frameState.value = 299;
      player.isPlaying.mockReturnValue(false);

      const { result } = renderHook(() => usePlaybackControls(ref));

      act(() => {
        result.current.play();
      });

      mockSetPlayheadFrame.mockClear();

      act(() => {
        if (capturedCallback) capturedCallback(0);
      });

      // The tick should call setPlayheadFrame with the final frame when playback ends.
      expect(mockSetPlayheadFrame).toHaveBeenCalledWith(299);
    });
  });
});
