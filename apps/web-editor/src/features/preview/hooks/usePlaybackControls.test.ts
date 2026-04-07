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

import * as projectStore from '@/store/project-store.js';
import * as ephemeralStore from '@/store/ephemeral-store.js';

const mockUseProjectStore = vi.mocked(projectStore.useProjectStore);
const mockSetPlayheadFrame = vi.mocked(ephemeralStore.setPlayheadFrame);

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
  });

});
