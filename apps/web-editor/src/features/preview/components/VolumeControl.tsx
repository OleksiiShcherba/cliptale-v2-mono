/**
 * VolumeControl — mute toggle button + volume slider for the Remotion player.
 *
 * Reads `volume` and `isMuted` from the ephemeral store and writes changes
 * back via `setVolume` / `setMuted`. The calling site is responsible for
 * syncing the values to `playerRef.setVolume()` / `playerRef.mute()`.
 */

import React, { type ChangeEvent } from 'react';

import { useEphemeralStore, setVolume, setMuted } from '@/store/ephemeral-store';

// Design tokens
const TEXT_PRIMARY = '#F0F0FA';
const TEXT_SECONDARY = '#8A8AA0';
const PRIMARY = '#7C3AED';

/** Speaker icon — full volume. */
function IconVolume(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M9 2a1 1 0 0 1 .707.293l.293.293.354.354A5.978 5.978 0 0 1 12 8a5.978 5.978 0 0 1-1.646 4.06l-.354.354-.293.293A1 1 0 0 1 8 12V4a1 1 0 0 1 1-2zm-3 1.5L3 6H1a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h2l3 2.5V3.5z" />
    </svg>
  );
}

/** Speaker icon — muted (with X). */
function IconVolumeMuted(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M6.717 3.55A.5.5 0 0 1 7 4v8a.5.5 0 0 1-.812.39L3.825 10.5H1.5A.5.5 0 0 1 1 10V6a.5.5 0 0 1 .5-.5h2.325L6.188 3.61a.5.5 0 0 1 .53-.06zm7.446 4.097a.5.5 0 0 1 0 .707l-2 2a.5.5 0 0 1-.708-.707L13.293 8 11.455 6.16a.5.5 0 0 1 .707-.707l2 2-.001-.001z" />
      <path d="M11.455 6.16a.5.5 0 0 1 .707.707l-2 2a.5.5 0 0 1-.707-.707l2-2z" />
    </svg>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  muteButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    background: 'transparent',
    border: 'none',
    borderRadius: 4,
    color: TEXT_PRIMARY,
    cursor: 'pointer',
    padding: 0,
    flexShrink: 0,
  },
  slider: {
    width: 64,
    height: 4,
    accentColor: PRIMARY,
    cursor: 'pointer',
  } as React.CSSProperties,
  label: {
    fontFamily: 'Inter, sans-serif',
    fontSize: 11,
    fontWeight: 400,
    color: TEXT_SECONDARY,
    minWidth: 28,
    textAlign: 'right' as const,
  },
};

/**
 * Renders a mute toggle button and a volume slider.
 * Volume level is read from / written to the ephemeral store.
 */
export function VolumeControl(): React.ReactElement {
  const { volume, isMuted } = useEphemeralStore();

  const handleMuteToggle = () => {
    setMuted(!isMuted);
  };

  const handleVolumeChange = (e: ChangeEvent<HTMLInputElement>) => {
    setVolume(parseFloat(e.target.value));
  };

  const displayVolume = isMuted ? 0 : volume;

  return (
    <div style={styles.wrapper} aria-label="Volume controls">
      <button
        type="button"
        onClick={handleMuteToggle}
        style={styles.muteButton}
        aria-label={isMuted ? 'Unmute' : 'Mute'}
        title={isMuted ? 'Unmute' : 'Mute'}
      >
        {isMuted || volume === 0 ? <IconVolumeMuted /> : <IconVolume />}
      </button>

      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={displayVolume}
        onChange={handleVolumeChange}
        style={styles.slider}
        aria-label="Volume"
        title={`Volume: ${Math.round(displayVolume * 100)}%`}
      />

      <span style={styles.label} aria-live="polite">
        {Math.round(displayVolume * 100)}%
      </span>
    </div>
  );
}
