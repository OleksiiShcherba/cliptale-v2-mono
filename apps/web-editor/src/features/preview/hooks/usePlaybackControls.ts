import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlayerRef } from '@remotion/player';

import { getSnapshot as getProjectSnapshot } from '@/store/project-store.js';
import { setPlayheadFrame } from '@/store/ephemeral-store.js';
import { updateTimelinePlayheadFrame } from '@/store/timeline-refs.js';
import { formatTimecode } from '@/shared/utils/formatTimecode.js';

// ---------------------------------------------------------------------------
// Hook types
// ---------------------------------------------------------------------------

export type UsePlaybackControlsResult = {
  /** Whether the player is currently playing. */
  isPlaying: boolean;
  /** Current playhead frame (React state — updated on play/pause/seek). */
  currentFrame: number;
  /** Total frames in the project. */
  totalFrames: number;
  /** Formatted timecode string `HH:MM:SS:FF`. */
  timecode: string;
  /** DOM ref to attach to the controls container for CSS custom property mutations. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Start playback. */
  play: () => void;
  /** Pause playback. */
  pause: () => void;
  /** Rewind to frame 0. */
  rewind: () => void;
  /** Step forward one frame. */
  stepForward: () => void;
  /** Step backward one frame. */
  stepBack: () => void;
  /** Seek to a specific frame. */
  seekTo: (frame: number) => void;
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Provides playback controls for the Remotion Player.
 *
 * Wires a `requestAnimationFrame` loop during playback that:
 * 1. Mutates the CSS custom property `--playhead-frame` on the container ref
 *    (used by the timeline ruler, added in a future epic).
 * 2. Calls `setCurrentFrameState(frame)` on every tick so the frame counter,
 *    timecode display, and scrub slider stay in sync with the player position.
 *
 * React state (`isPlaying`, `currentFrame`) is also updated on explicit
 * play/pause/seek/step transitions.
 */
export function usePlaybackControls(
  playerRef: React.RefObject<PlayerRef | null>,
): UsePlaybackControlsResult {
  const projectDoc = getProjectSnapshot();
  const { fps, durationFrames } = projectDoc;

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrame, setCurrentFrameState] = useState(0);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const isPlayingRef = useRef(false);

  // Keep isPlayingRef in sync with state so the rAF closure can read it.
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // ---------------------------------------------------------------------------
  // rAF loop — reads player frame and mutates CSS var; no setState.
  // ---------------------------------------------------------------------------

  const startRafLoop = useCallback(() => {
    if (rafIdRef.current !== null) return;

    const tick = () => {
      const player = playerRef.current;
      if (!player || !isPlayingRef.current) {
        rafIdRef.current = null;
        return;
      }

      const frame = player.getCurrentFrame();
      if (containerRef.current) {
        containerRef.current.style.setProperty('--playhead-frame', String(frame));
      }

      // Drive the frame counter, timecode, and scrub slider via React state.
      setCurrentFrameState(frame);

      // We mutate the CSS property directly to avoid re-rendering the full
      // React tree at 60fps — architecture §7.
      updateTimelinePlayheadFrame(frame);

      // Also check if playback ended (player paused itself at last frame).
      const stillPlaying: boolean = typeof player.isPlaying === 'function' ? player.isPlaying() : true;
      if (!stillPlaying) {
        const finalFrame = player.getCurrentFrame();
        setIsPlaying(false);
        setCurrentFrameState(finalFrame);
        setPlayheadFrame(finalFrame);
        isPlayingRef.current = false;
        rafIdRef.current = null;
        return;
      }

      rafIdRef.current = requestAnimationFrame(tick);
    };

    rafIdRef.current = requestAnimationFrame(tick);
  }, [playerRef]);

  const stopRafLoop = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }, []);

  // Cancel loop on unmount.
  useEffect(() => {
    return () => {
      stopRafLoop();
    };
  }, [stopRafLoop]);

  // ---------------------------------------------------------------------------
  // Control functions
  // ---------------------------------------------------------------------------

  const play = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    player.play();
    setIsPlaying(true);
    startRafLoop();
  }, [playerRef, startRafLoop]);

  const pause = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    player.pause();
    stopRafLoop();
    const frame = player.getCurrentFrame();
    setIsPlaying(false);
    setCurrentFrameState(frame);
    setPlayheadFrame(frame);
  }, [playerRef, stopRafLoop]);

  const rewind = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    player.pause();
    player.seekTo(0);
    stopRafLoop();
    setIsPlaying(false);
    setCurrentFrameState(0);
    setPlayheadFrame(0);
  }, [playerRef, stopRafLoop]);

  const stepForward = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    player.pause();
    stopRafLoop();
    const next = Math.min(player.getCurrentFrame() + 1, durationFrames - 1);
    player.seekTo(next);
    setIsPlaying(false);
    setCurrentFrameState(next);
    setPlayheadFrame(next);
  }, [playerRef, stopRafLoop, durationFrames]);

  const stepBack = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    player.pause();
    stopRafLoop();
    const prev = Math.max(player.getCurrentFrame() - 1, 0);
    player.seekTo(prev);
    setIsPlaying(false);
    setCurrentFrameState(prev);
    setPlayheadFrame(prev);
  }, [playerRef, stopRafLoop]);

  const seekTo = useCallback(
    (frame: number) => {
      const player = playerRef.current;
      if (!player) return;
      const clamped = Math.max(0, Math.min(frame, durationFrames - 1));
      player.seekTo(clamped);
      setCurrentFrameState(clamped);
      setPlayheadFrame(clamped);
    },
    [playerRef, durationFrames],
  );

  // ---------------------------------------------------------------------------
  // Keyboard listeners
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when focus is inside an input or textarea.
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          if (isPlayingRef.current) {
            pause();
          } else {
            play();
          }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          stepBack();
          break;
        case 'ArrowRight':
          e.preventDefault();
          stepForward();
          break;
        case 'Home':
          e.preventDefault();
          rewind();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [play, pause, stepBack, stepForward, rewind]);

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------

  const timecode = formatTimecode(currentFrame, fps);

  return {
    isPlaying,
    currentFrame,
    totalFrames: durationFrames,
    timecode,
    containerRef,
    play,
    pause,
    rewind,
    stepForward,
    stepBack,
    seekTo,
  };
}
