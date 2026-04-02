import React, { type ChangeEvent } from 'react';
import type { PlayerRef } from '@remotion/player';

import { usePlaybackControls } from '@/features/preview/hooks/usePlaybackControls.js';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PlaybackControlsProps {
  playerRef: React.RefObject<PlayerRef | null>;
}

// ---------------------------------------------------------------------------
// SVG icon helpers (inline — no external icon library dependency)
// ---------------------------------------------------------------------------

function IconRewind(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M2 3a1 1 0 0 1 1 1v8a1 1 0 1 1-2 0V4a1 1 0 0 1 1-1zm11.5.134a1 1 0 0 1 .5.866v8a1 1 0 0 1-1.5.866L6 9.732V12a1 1 0 1 1-2 0V4a1 1 0 0 1 2 0v2.268l6.5-3.268a1 1 0 0 1 1 .134z" />
    </svg>
  );
}

function IconPlay(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M4 3.5a.5.5 0 0 1 .763-.424l8 4.5a.5.5 0 0 1 0 .848l-8 4.5A.5.5 0 0 1 4 12.5v-9z" />
    </svg>
  );
}

function IconPause(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M5 3h2v10H5V3zm4 0h2v10H9V3z" />
    </svg>
  );
}

function IconStepBack(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M9.5 3.5a.5.5 0 0 0-.763-.424L3 6.232V4a1 1 0 0 0-2 0v8a1 1 0 0 0 2 0V9.768l5.737 3.156A.5.5 0 0 0 9.5 12.5v-9z" />
    </svg>
  );
}

function IconStepForward(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M6.5 3.5a.5.5 0 0 1 .763-.424L13 6.232V4a1 1 0 0 1 2 0v8a1 1 0 0 1-2 0V9.768l-5.737 3.156A.5.5 0 0 1 6.5 12.5v-9z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Playback controls bar rendered below the Remotion Player.
 *
 * Connects to `usePlaybackControls` which drives the Remotion PlayerRef.
 * The rAF loop inside the hook mutates `--playhead-frame` on `containerRef`
 * instead of calling setState — the React tree is not touched on every tick.
 */
export function PlaybackControls({ playerRef }: PlaybackControlsProps): React.ReactElement {
  const {
    isPlaying,
    currentFrame,
    totalFrames,
    timecode,
    containerRef,
    play,
    pause,
    rewind,
    stepForward,
    stepBack,
    seekTo,
  } = usePlaybackControls(playerRef);

  const handlePlayPause = () => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  };

  const handleScrub = (e: ChangeEvent<HTMLInputElement>) => {
    seekTo(Number(e.target.value));
  };

  return (
    <div ref={containerRef} style={styles.container} role="toolbar" aria-label="Playback controls">
      {/* Left group: transport buttons */}
      <div style={styles.group}>
        <button
          type="button"
          onClick={rewind}
          style={styles.iconButton}
          aria-label="Rewind to start"
          title="Rewind (Home)"
        >
          <IconRewind />
        </button>

        <button
          type="button"
          onClick={stepBack}
          style={styles.iconButton}
          aria-label="Step back one frame"
          title="Step back (←)"
        >
          <IconStepBack />
        </button>

        <button
          type="button"
          onClick={handlePlayPause}
          style={{ ...styles.iconButton, ...styles.playButton }}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
        >
          {isPlaying ? <IconPause /> : <IconPlay />}
        </button>

        <button
          type="button"
          onClick={stepForward}
          style={styles.iconButton}
          aria-label="Step forward one frame"
          title="Step forward (→)"
        >
          <IconStepForward />
        </button>
      </div>

      {/* Center: scrub slider */}
      <div style={styles.sliderWrapper}>
        <input
          type="range"
          min={0}
          max={Math.max(0, totalFrames - 1)}
          value={currentFrame}
          onChange={handleScrub}
          style={styles.slider}
          aria-label="Playback position"
        />
      </div>

      {/* Right group: frame counter + timecode */}
      <div style={styles.group}>
        <span style={styles.frameCounter} aria-label="Current frame">
          {currentFrame} / {totalFrames}
        </span>
        <div style={styles.divider} aria-hidden="true" />
        <span style={styles.timecode} aria-label="Timecode">
          {timecode}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles — design-guide tokens inlined as constants
// ---------------------------------------------------------------------------

const SURFACE_ALT = '#16161F';
const TEXT_PRIMARY = '#F0F0FA';
const TEXT_SECONDARY = '#8A8AA0';
const BORDER = '#252535';
const PRIMARY = '#7C3AED';
const PRIMARY_DARK = '#5B21B6';

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '0 16px',
    height: '48px',
    background: SURFACE_ALT,
    borderTop: `1px solid ${BORDER}`,
    flexShrink: 0,
  },
  group: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  iconButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    background: 'transparent',
    border: 'none',
    borderRadius: '4px',
    color: TEXT_PRIMARY,
    cursor: 'pointer',
    padding: 0,
  } as React.CSSProperties,
  playButton: {
    background: PRIMARY,
    color: '#ffffff',
    borderRadius: '4px',
    // Hover is not expressible in inline styles; handled via JS or CSS class.
    // Primary accent per design-guide.
    '--play-button-hover-bg': PRIMARY_DARK,
  } as React.CSSProperties,
  sliderWrapper: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
  },
  slider: {
    width: '100%',
    height: '4px',
    accentColor: PRIMARY,
    cursor: 'pointer',
  } as React.CSSProperties,
  frameCounter: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '11px',
    fontWeight: 400,
    lineHeight: '16px',
    color: TEXT_SECONDARY,
    whiteSpace: 'nowrap' as const,
    fontVariantNumeric: 'tabular-nums',
  } as React.CSSProperties,
  divider: {
    width: '1px',
    height: '16px',
    background: BORDER,
    margin: '0 4px',
  },
  timecode: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '11px',
    fontWeight: 400,
    lineHeight: '16px',
    color: TEXT_PRIMARY,
    whiteSpace: 'nowrap' as const,
    fontVariantNumeric: 'tabular-nums',
  } as React.CSSProperties,
} as const;
