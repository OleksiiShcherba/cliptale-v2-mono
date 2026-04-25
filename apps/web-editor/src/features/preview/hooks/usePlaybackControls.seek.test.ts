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
// usePlaybackControls — seek, keyboard, and timecode tests
// ---------------------------------------------------------------------------

describe('usePlaybackControls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseProjectStore.mockReturnValue(makeProjectDoc() as ReturnType<typeof mockUseProjectStore>);

    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('stepForward()', () => {
    it('advances frame by 1', () => {
      const { ref, player, currentFrame } = makePlayerRef();
      currentFrame.value = 10;
      const { result } = renderHook(() => usePlaybackControls(ref));

      act(() => {
        result.current.stepForward();
      });

      expect(player.seekTo).toHaveBeenCalledWith(11);
    });

    it('clamps to last frame', () => {
      const { ref, player, currentFrame } = makePlayerRef();
      currentFrame.value = 299; // durationFrames - 1
      const { result } = renderHook(() => usePlaybackControls(ref));

      act(() => {
        result.current.stepForward();
      });

      expect(player.seekTo).toHaveBeenCalledWith(299);
    });
  });

  describe('stepBack()', () => {
    it('decrements frame by 1', () => {
      const { ref, player, currentFrame } = makePlayerRef();
      currentFrame.value = 10;
      const { result } = renderHook(() => usePlaybackControls(ref));

      act(() => {
        result.current.stepBack();
      });

      expect(player.seekTo).toHaveBeenCalledWith(9);
    });

    it('clamps to frame 0', () => {
      const { ref, player, currentFrame } = makePlayerRef();
      currentFrame.value = 0;
      const { result } = renderHook(() => usePlaybackControls(ref));

      act(() => {
        result.current.stepBack();
      });

      expect(player.seekTo).toHaveBeenCalledWith(0);
    });
  });

  describe('seekTo()', () => {
    it('seeks to the provided frame', () => {
      const { ref, player } = makePlayerRef();
      const { result } = renderHook(() => usePlaybackControls(ref));

      act(() => {
        result.current.seekTo(120);
      });

      expect(player.seekTo).toHaveBeenCalledWith(120);
      expect(result.current.currentFrame).toBe(120);
    });

    it('clamps negative frames to 0', () => {
      const { ref, player } = makePlayerRef();
      const { result } = renderHook(() => usePlaybackControls(ref));

      act(() => {
        result.current.seekTo(-5);
      });

      expect(player.seekTo).toHaveBeenCalledWith(0);
    });

    it('clamps frames beyond durationFrames', () => {
      const { ref, player } = makePlayerRef();
      const { result } = renderHook(() => usePlaybackControls(ref));

      act(() => {
        result.current.seekTo(9999);
      });

      expect(player.seekTo).toHaveBeenCalledWith(299);
    });

    it('calls setPlayheadFrame after seek', () => {
      const { ref } = makePlayerRef();
      const { result } = renderHook(() => usePlaybackControls(ref));

      act(() => {
        result.current.seekTo(77);
      });

      expect(mockSetPlayheadFrame).toHaveBeenCalledWith(77);
    });
  });

  describe('keyboard listeners', () => {
    it('calls play when Space is pressed while paused', () => {
      const { ref, player } = makePlayerRef();
      renderHook(() => usePlaybackControls(ref));

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
      });

      expect(player.play).toHaveBeenCalled();
    });

    it('calls pause when Space is pressed while playing', () => {
      const { ref, player } = makePlayerRef();
      player.getCurrentFrame.mockReturnValue(5);
      const { result } = renderHook(() => usePlaybackControls(ref));

      act(() => {
        result.current.play();
      });
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
      });

      expect(player.pause).toHaveBeenCalled();
    });

    it('calls stepBack when ArrowLeft is pressed', () => {
      const { ref, player, currentFrame } = makePlayerRef();
      currentFrame.value = 10;
      renderHook(() => usePlaybackControls(ref));

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
      });

      expect(player.seekTo).toHaveBeenCalledWith(9);
    });

    it('calls stepForward when ArrowRight is pressed', () => {
      const { ref, player, currentFrame } = makePlayerRef();
      currentFrame.value = 10;
      renderHook(() => usePlaybackControls(ref));

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
      });

      expect(player.seekTo).toHaveBeenCalledWith(11);
    });

    it('calls rewind when Home is pressed', () => {
      const { ref, player } = makePlayerRef();
      renderHook(() => usePlaybackControls(ref));

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }));
      });

      expect(player.seekTo).toHaveBeenCalledWith(0);
    });

    it('does not handle keys when target is an input element', () => {
      const { ref, player } = makePlayerRef();
      renderHook(() => usePlaybackControls(ref));

      const input = document.createElement('input');
      document.body.appendChild(input);

      act(() => {
        input.dispatchEvent(
          new KeyboardEvent('keydown', { key: ' ', bubbles: true }),
        );
      });

      expect(player.play).not.toHaveBeenCalled();
      document.body.removeChild(input);
    });

    it('removes keyboard listener on unmount', () => {
      const { ref, player } = makePlayerRef();
      const { unmount } = renderHook(() => usePlaybackControls(ref));
      unmount();

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
      });

      // After unmount the listener is removed so play should not be called.
      expect(player.play).not.toHaveBeenCalled();
    });
  });

  describe('timecode formatting', () => {
    it('updates timecode when seekTo is called', () => {
      mockUseProjectStore.mockReturnValue(makeProjectDoc({ fps: 30 }) as ReturnType<typeof mockUseProjectStore>);
      const { ref } = makePlayerRef();
      const { result } = renderHook(() => usePlaybackControls(ref));

      act(() => {
        result.current.seekTo(30);
      });

      expect(result.current.timecode).toBe('00:00:01:00');
    });
  });
});
