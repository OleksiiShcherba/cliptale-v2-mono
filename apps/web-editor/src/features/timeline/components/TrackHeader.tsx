import React, { useState, useCallback, useRef } from 'react';

import type { Track } from '@ai-video-editor/project-schema';

// Design tokens
const SURFACE_ALT = '#16161F';
const BORDER = '#252535';
const TEXT_PRIMARY = '#F0F0FA';
const TEXT_SECONDARY = '#8A8AA0';
const PRIMARY = '#7C3AED';
const WARNING = '#F59E0B';
const SURFACE_ELEVATED = '#1E1E2E';

/** Width of the track header column in pixels. */
export const TRACK_HEADER_WIDTH = 160;

/** Height of each track row in pixels (shared with ClipLane). */
export const TRACK_ROW_HEIGHT = 48;

interface TrackHeaderProps {
  track: Track;
  /** Called when the track name is changed via inline editing. */
  onRename: (trackId: string, newName: string) => void;
  /** Called when the mute toggle is clicked. */
  onToggleMute: (trackId: string) => void;
  /** Called when the lock toggle is clicked. */
  onToggleLock: (trackId: string) => void;
}

/**
 * Renders the left-side header for a single timeline track.
 * Shows the track name (click-to-edit), a mute button, and a lock button.
 * Name changes commit on Enter or blur.
 */
export function TrackHeader({
  track,
  onRename,
  onToggleMute,
  onToggleLock,
}: TrackHeaderProps): React.ReactElement {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(track.name);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleNameClick = useCallback(() => {
    setEditValue(track.name);
    setIsEditing(true);
    // Focus the input after state update
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [track.name]);

  const commitRename = useCallback(() => {
    const trimmed = editValue.trim();
    const finalName = trimmed.length > 0 ? trimmed : track.name;
    setIsEditing(false);
    if (finalName !== track.name) {
      onRename(track.id, finalName);
    }
  }, [editValue, onRename, track.id, track.name]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        commitRename();
      } else if (e.key === 'Escape') {
        setIsEditing(false);
        setEditValue(track.name);
      }
    },
    [commitRename, track.name],
  );

  const handleMuteClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggleMute(track.id);
    },
    [onToggleMute, track.id],
  );

  const handleLockClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggleLock(track.id);
    },
    [onToggleLock, track.id],
  );

  return (
    <div
      style={styles.header}
      aria-label={`Track: ${track.name}`}
    >
      {/* Track name — click to edit inline */}
      <div style={styles.nameArea}>
        {isEditing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={handleKeyDown}
            aria-label="Edit track name"
            style={styles.nameInput}
          />
        ) : (
          <button
            onClick={handleNameClick}
            title="Click to rename track"
            aria-label={`Rename track: ${track.name}`}
            style={styles.nameButton}
          >
            {track.name}
          </button>
        )}
      </div>

      {/* Controls */}
      <div style={styles.controls} aria-label="Track controls">
        <button
          onClick={handleMuteClick}
          title={track.muted ? 'Unmute track' : 'Mute track'}
          aria-pressed={track.muted}
          aria-label={track.muted ? 'Unmute track' : 'Mute track'}
          style={{
            ...styles.controlButton,
            ...(track.muted ? styles.controlButtonActive : {}),
          }}
        >
          M
        </button>
        <button
          onClick={handleLockClick}
          title={track.locked ? 'Unlock track' : 'Lock track'}
          aria-pressed={track.locked}
          aria-label={track.locked ? 'Unlock track' : 'Lock track'}
          style={{
            ...styles.controlButton,
            ...(track.locked ? styles.controlButtonLocked : {}),
          }}
        >
          L
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    width: TRACK_HEADER_WIDTH,
    height: TRACK_ROW_HEIGHT,
    flexShrink: 0,
    background: SURFACE_ALT,
    borderRight: `1px solid ${BORDER}`,
    borderBottom: `1px solid ${BORDER}`,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '0 8px',
    overflow: 'hidden',
  },
  nameArea: {
    flex: 1,
    overflow: 'hidden',
    minWidth: 0,
  },
  nameButton: {
    background: 'none',
    border: 'none',
    color: TEXT_PRIMARY,
    fontSize: 12,
    fontFamily: 'Inter, sans-serif',
    cursor: 'pointer',
    padding: 0,
    textAlign: 'left',
    width: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  nameInput: {
    background: SURFACE_ELEVATED,
    border: `1px solid ${PRIMARY}`,
    borderRadius: 4,
    color: TEXT_PRIMARY,
    fontSize: 12,
    fontFamily: 'Inter, sans-serif',
    padding: '1px 4px',
    width: '100%',
    outline: 'none',
  },
  controls: {
    display: 'flex',
    gap: 2,
    flexShrink: 0,
  },
  controlButton: {
    width: 20,
    height: 20,
    background: 'transparent',
    border: `1px solid ${BORDER}`,
    borderRadius: 4,
    color: TEXT_SECONDARY,
    fontSize: 9,
    fontFamily: 'Inter, sans-serif',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    padding: 0,
  },
  controlButtonActive: {
    background: WARNING,
    borderColor: WARNING,
    color: '#000',
  },
  controlButtonLocked: {
    background: PRIMARY,
    borderColor: PRIMARY,
    color: '#fff',
  },
};
