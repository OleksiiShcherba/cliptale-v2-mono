import React, { useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';

import type { Track } from '@ai-video-editor/project-schema';

import { styles, TRACK_ROW_HEIGHT } from './trackHeaderStyles';
import { DeleteTrackDialog } from './DeleteTrackDialog';

/**
 * Width of the track header column in pixels.
 * Wide enough to display at least 10 characters of a track name without truncation
 * (Inter 12px ≈ 8px/char × 10 = 80px name area + 42px controls + 16px padding + 4px gap = 142px minimum).
 */
export const TRACK_HEADER_WIDTH = 160;

// Re-export so all existing consumers (`TrackList`, `ClipLane`, `ClipLaneGhosts`)
// continue importing from a single entry point without modification.
export { TRACK_ROW_HEIGHT };

interface TrackHeaderProps {
  track: Track;
  /** Called when the track name is changed via inline editing. */
  onRename: (trackId: string, newName: string) => void;
  /** Called when the mute toggle is clicked. */
  onToggleMute: (trackId: string) => void;
  /** Called when the lock toggle is clicked. */
  onToggleLock: (trackId: string) => void;
  /** Whether this track is currently being dragged. */
  isDragging?: boolean;
  /** Whether this track is the current drag-over drop target. */
  isDropTarget?: boolean;
  /** Called when drag starts on this header's drag handle. */
  onDragStart?: (trackId: string) => void;
  /** Called when another dragged track enters this header. */
  onDragOver?: (trackId: string) => void;
  /** Called when a dragged track leaves this header. */
  onDragLeave?: (trackId: string) => void;
  /** Called when a dragged track is dropped onto this header. */
  onDrop?: (trackId: string) => void;
  /** Called when the drag operation ends (drop or cancel). */
  onDragEnd?: () => void;
  /** Called when the delete button is clicked. Deletes the track and all its clips. */
  onDelete?: (trackId: string) => void;
}

/**
 * Renders the left-side header for a single timeline track.
 * Shows a drag handle (for reordering), the track name (click-to-edit),
 * a mute button, and a lock button.
 * Name changes commit on Enter or blur.
 */
export function TrackHeader({
  track,
  onRename,
  onToggleMute,
  onToggleLock,
  isDragging = false,
  isDropTarget = false,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onDelete,
}: TrackHeaderProps): React.ReactElement {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(track.name);
  const [isDeleteHovered, setIsDeleteHovered] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
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

  const handleDeleteClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsDeleteDialogOpen(true);
    },
    [],
  );

  const handleDeleteConfirm = useCallback(
    (trackId: string) => {
      setIsDeleteDialogOpen(false);
      onDelete?.(trackId);
    },
    [onDelete],
  );

  // -------------------------------------------------------------------------
  // Drag-and-drop handlers for track reordering
  // -------------------------------------------------------------------------

  const handleDragHandleMouseDown = useCallback((e: React.MouseEvent) => {
    // Prevent the name-click handler from firing
    e.stopPropagation();
  }, []);

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.effectAllowed = 'move';
      // Set a minimal drag image so the browser default ghost is replaced
      e.dataTransfer.setData('application/cliptale-track', track.id);
      onDragStart?.(track.id);
    },
    [onDragStart, track.id],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes('application/cliptale-track')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      onDragOver?.(track.id);
    },
    [onDragOver, track.id],
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      // Only fire if leaving this element entirely (not entering a child)
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      onDragLeave?.(track.id);
    },
    [onDragLeave, track.id],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!e.dataTransfer.types.includes('application/cliptale-track')) return;
      onDrop?.(track.id);
    },
    [onDrop, track.id],
  );

  const handleDragEnd = useCallback(() => {
    onDragEnd?.();
  }, [onDragEnd]);

  return (
    <div
      style={{
        ...styles.header,
        ...(isDragging ? styles.headerDragging : {}),
        ...(isDropTarget ? styles.headerDropTarget : {}),
      }}
      aria-label={`Track: ${track.name}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag handle — only this element is draggable to avoid interfering with click-to-rename */}
      <div
        draggable
        onMouseDown={handleDragHandleMouseDown}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        style={styles.dragHandle}
        aria-label="Drag to reorder track"
        title="Drag to reorder track"
        role="button"
        tabIndex={-1}
      >
        <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden="true">
          <circle cx="3" cy="2" r="1.5" />
          <circle cx="7" cy="2" r="1.5" />
          <circle cx="3" cy="7" r="1.5" />
          <circle cx="7" cy="7" r="1.5" />
          <circle cx="3" cy="12" r="1.5" />
          <circle cx="7" cy="12" r="1.5" />
        </svg>
      </div>

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
        {onDelete && (
          <button
            onClick={handleDeleteClick}
            onMouseEnter={() => setIsDeleteHovered(true)}
            onMouseLeave={() => setIsDeleteHovered(false)}
            title="Delete track"
            aria-label="Delete track"
            style={{
              ...styles.controlButtonDelete,
              ...(isDeleteHovered ? styles.controlButtonDeleteHover : {}),
            }}
          >
            ×
          </button>
        )}
      </div>

      {isDeleteDialogOpen && createPortal(
        <DeleteTrackDialog
          track={track}
          onClose={() => setIsDeleteDialogOpen(false)}
          onConfirm={handleDeleteConfirm}
        />,
        document.body,
      )}
    </div>
  );
}

