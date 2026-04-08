import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { usePlaybackControls } from './usePlaybackControls.js';
import { makePlayerRef, makeProjectDoc } from './usePlaybackControls.fixtures.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/store/project-store.js', () => ({
  useProjectStore: vi.fn(),
}));

vi.mock('@/store/ephemeral-store.js', () => ({
  setPlayheadFrame: vi.fn(),
}));

vi.mock('@/store/timeline-refs.js', () => ({
  updateTimelinePlayheadFrame: vi.fn(),
  registerTimelinePlayheadUpdater: vi.fn(),
}));

import * as projectStore from '@/store/project-store.js';
import * as ephemeralStore from '@/store/ephemeral-store.js';
import * as timelineRefs from '@/store/timeline-refs.js';

const mockUseProjectStore = vi.mocked(projectStore.useProjectStore);
const mockSetPlayheadFrame = vi.mocked(ephemeralStore.setPlayheadFrame);
const mockUpdateTimelinePlayheadFrame = vi.mocked(timelineRefs.updateTimelinePlayheadFrame);

// ---------------------------------------------------------------------------
// usePlaybackControls hook tests
// ---------------------------------------------------------------------------

describe('usePlaybackControls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseProjectStore.mockReturnValue(makeProjectDoc() as ReturnType<typeof mockUseProjectStore>);

    // Stub rAF to avoid infinite loops in jsdom.
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('initial state', () => {
    it('returns isPlaying false initially', () => {
      const { ref } = makePlayerRef();
      const { result } = renderHook(() => usePlaybackControls(ref));

      expect(result.current.isPlaying).toBe(false);
    });

    it('returns currentFrame 0 initially', () => {
      const { ref } = makePlayerRef();
      const { result } = renderHook(() => usePlaybackControls(ref));

      expect(result.current.currentFrame).toBe(0);
    });

    it('returns totalFrames from the project doc', () => {
      mockUseProjectStore.mockReturnValue(makeProjectDoc({ durationFrames: 150 }) as ReturnType<typeof mockUseProjectStore>);
      const { ref } = makePlayerRef();
      const { result } = renderHook(() => usePlaybackControls(ref));

      expect(result.current.totalFrames).toBe(150);
    });

    it('returns timecode 00:00:00:00 initially', () => {
      const { ref } = makePlayerRef();
      const { result } = renderHook(() => usePlaybackControls(ref));

      expect(result.current.timecode).toBe('00:00:00:00');
    });

    it('returns a containerRef object', () => {
      const { ref } = makePlayerRef();
      const { result } = renderHook(() => usePlaybackControls(ref));

      expect(result.current.containerRef).toBeDefined();
      expect(typeof result.current.containerRef).toBe('object');
    });
  });

  describe('play()', () => {
    it('sets isPlaying to true', () => {
      const { ref } = makePlayerRef();
      const { result } = renderHook(() => usePlaybackControls(ref));

      act(() => {
        result.current.play();
      });

      expect(result.current.isPlaying).toBe(true);
    });

    it('calls player.play()', () => {
      const { ref, player } = makePlayerRef();
      const { result } = renderHook(() => usePlaybackControls(ref));

      act(() => {
        result.current.play();
      });

      expect(player.play).toHaveBeenCalledOnce();
    });

    it('does nothing when playerRef.current is null', () => {
      const nullRef = { current: null } as React.RefObject<import('@remotion/player').PlayerRef | null>;
      const { result } = renderHook(() => usePlaybackControls(nullRef));

      expect(() => {
        act(() => {
          result.current.play();
        });
      }).not.toThrow();
    });
  });

  describe('pause()', () => {
    it('sets isPlaying to false after play', () => {
      const { ref, player } = makePlayerRef();
      player.getCurrentFrame.mockReturnValue(15);
      const { result } = renderHook(() => usePlaybackControls(ref));

      act(() => {
        result.current.play();
      });
      act(() => {
        result.current.pause();
      });

      expect(result.current.isPlaying).toBe(false);
    });

    it('updates currentFrame from player on pause', () => {
      const { ref, player } = makePlayerRef();
      player.getCurrentFrame.mockReturnValue(42);
      const { result } = renderHook(() => usePlaybackControls(ref));

      act(() => {
        result.current.pause();
      });

      expect(result.current.currentFrame).toBe(42);
    });

    it('calls setPlayheadFrame with current frame on pause', () => {
      const { ref, player } = makePlayerRef();
      player.getCurrentFrame.mockReturnValue(55);
      const { result } = renderHook(() => usePlaybackControls(ref));

      act(() => {
        result.current.pause();
      });

      expect(mockSetPlayheadFrame).toHaveBeenCalledWith(55);
    });
  });

  describe('rewind()', () => {
    it('seeks to frame 0', () => {
      const { ref, player } = makePlayerRef();
      const { result } = renderHook(() => usePlaybackControls(ref));

      act(() => {
        result.current.rewind();
      });

      expect(player.seekTo).toHaveBeenCalledWith(0);
    });

    it('sets currentFrame to 0', () => {
      const { ref } = makePlayerRef();
      const { result } = renderHook(() => usePlaybackControls(ref));

      act(() => {
        result.current.rewind();
      });

      expect(result.current.currentFrame).toBe(0);
    });

    it('sets isPlaying to false', () => {
      const { ref } = makePlayerRef();
      const { result } = renderHook(() => usePlaybackControls(ref));

      act(() => {
        result.current.play();
        result.current.rewind();
      });

      expect(result.current.isPlaying).toBe(false);
    });

    it('calls updateTimelinePlayheadFrame(0) to sync the timeline needle', () => {
      const { ref } = makePlayerRef();
      const { result } = renderHook(() => usePlaybackControls(ref));

      act(() => {
        result.current.rewind();
      });

      expect(mockUpdateTimelinePlayheadFrame).toHaveBeenCalledWith(0);
    });
  });

  describe('totalTimecode', () => {
    it('returns the formatted total duration timecode', () => {
      // durationFrames=300, fps=30 → 10 seconds → 00:00:10:00
      mockUseProjectStore.mockReturnValue(
        makeProjectDoc({ durationFrames: 300, fps: 30 }) as ReturnType<typeof mockUseProjectStore>,
      );
      const { ref } = makePlayerRef();
      const { result } = renderHook(() => usePlaybackControls(ref));

      expect(result.current.totalTimecode).toBe('00:00:10:00');
    });

    it('updates totalTimecode when the store provides a different durationFrames', () => {
      mockUseProjectStore.mockReturnValue(
        makeProjectDoc({ durationFrames: 60, fps: 30 }) as ReturnType<typeof mockUseProjectStore>,
      );
      const { ref } = makePlayerRef();
      const { result } = renderHook(() => usePlaybackControls(ref));

      // 60 frames at 30 fps → 2 seconds → 00:00:02:00
      expect(result.current.totalTimecode).toBe('00:00:02:00');
    });
  });

  describe('rewind() — CSS custom property reset', () => {
    it('sets --playhead-frame CSS property to "0" on containerRef after rewind', () => {
      const { ref } = makePlayerRef();
      const { result } = renderHook(() => usePlaybackControls(ref));

      const div = document.createElement('div');
      (result.current.containerRef as React.MutableRefObject<HTMLDivElement>).current = div;
      // Set a non-zero value first to confirm the reset happens.
      div.style.setProperty('--playhead-frame', '50');

      act(() => {
        result.current.rewind();
      });

      expect(div.style.getPropertyValue('--playhead-frame')).toBe('0');
    });
  });

  describe('store reactivity — useProjectStore hook', () => {
    it('reflects updated durationFrames when the store mock returns a different value on re-render', () => {
      // This test guards against a regression where getSnapshot (non-reactive) was used
      // instead of useProjectStore, causing stale durationFrames on store updates.
      mockUseProjectStore.mockReturnValue(
        makeProjectDoc({ durationFrames: 120 }) as ReturnType<typeof mockUseProjectStore>,
      );
      const { ref } = makePlayerRef();
      const { result, rerender } = renderHook(() => usePlaybackControls(ref));

      expect(result.current.totalFrames).toBe(120);

      mockUseProjectStore.mockReturnValue(
        makeProjectDoc({ durationFrames: 240 }) as ReturnType<typeof mockUseProjectStore>,
      );
      rerender();

      expect(result.current.totalFrames).toBe(240);
    });
  });

  describe('timeline bridge updates', () => {
    it('calls updateTimelinePlayheadFrame on pause', () => {
      const { ref, player } = makePlayerRef();
      player.getCurrentFrame.mockReturnValue(30);
      const { result } = renderHook(() => usePlaybackControls(ref));

      act(() => {
        result.current.pause();
      });

      expect(mockUpdateTimelinePlayheadFrame).toHaveBeenCalledWith(30);
    });

    it('calls updateTimelinePlayheadFrame on stepForward', () => {
      const { ref, player } = makePlayerRef();
      player.getCurrentFrame.mockReturnValue(10);
      const { result } = renderHook(() => usePlaybackControls(ref));

      act(() => {
        result.current.stepForward();
      });

      expect(mockUpdateTimelinePlayheadFrame).toHaveBeenCalledWith(11);
    });

    it('calls updateTimelinePlayheadFrame on stepBack', () => {
      const { ref, player } = makePlayerRef();
      player.getCurrentFrame.mockReturnValue(10);
      const { result } = renderHook(() => usePlaybackControls(ref));

      act(() => {
        result.current.stepBack();
      });

      expect(mockUpdateTimelinePlayheadFrame).toHaveBeenCalledWith(9);
    });

    it('calls updateTimelinePlayheadFrame on seekTo', () => {
      const { ref } = makePlayerRef();
      const { result } = renderHook(() => usePlaybackControls(ref));

      act(() => {
        result.current.seekTo(50);
      });

      expect(mockUpdateTimelinePlayheadFrame).toHaveBeenCalledWith(50);
    });
  });

});
