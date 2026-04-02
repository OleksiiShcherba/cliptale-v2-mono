import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { usePlaybackControls } from './usePlaybackControls.js';
import { makePlayerRef, makeProjectDoc } from './usePlaybackControls.fixtures.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/store/project-store.js', () => ({
  getSnapshot: vi.fn(),
}));

vi.mock('@/store/ephemeral-store.js', () => ({
  setPlayheadFrame: vi.fn(),
}));

import * as projectStore from '@/store/project-store.js';

const mockGetSnapshot = vi.mocked(projectStore.getSnapshot);

// ---------------------------------------------------------------------------
// usePlaybackControls — rAF loop tests
// ---------------------------------------------------------------------------

describe('usePlaybackControls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSnapshot.mockReturnValue(makeProjectDoc() as ReturnType<typeof mockGetSnapshot>);

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

      mockGetSnapshot.mockReturnValue(makeProjectDoc({ fps: 30 }) as ReturnType<typeof mockGetSnapshot>);
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
  });
});
