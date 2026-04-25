import React, { useState } from 'react';

import type { Track } from '@ai-video-editor/project-schema';

import { deleteTrackDialogStyles as styles } from './deleteTrackDialog.styles';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface DeleteTrackDialogProps {
  /** The track to be deleted. */
  track: Track;
  /** Called when the dialog is dismissed without deleting. */
  onClose: () => void;
  /** Called when the user confirms deletion. Receives the track ID. */
  onConfirm: (trackId: string) => void;
}

// ---------------------------------------------------------------------------
// DeleteTrackDialog
// ---------------------------------------------------------------------------

/**
 * Confirmation dialog for the "Delete Track" action.
 *
 * Shows a warning explaining that the track and all its clips will be removed
 * from the timeline. The change is tracked in the Immer patch history and can
 * be reverted with Ctrl+Z or via Version History.
 */
export function DeleteTrackDialog({
  track,
  onClose,
  onConfirm,
}: DeleteTrackDialogProps): React.ReactElement {
  const [isDeleteHovered, setIsDeleteHovered] = useState(false);

  const handleConfirm = (): void => {
    onConfirm(track.id);
  };

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      style={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-track-title"
      aria-describedby="delete-track-desc"
      onClick={handleOverlayClick}
    >
      <div style={styles.modal}>
        {/* Header */}
        <div style={styles.header}>
          <h2 id="delete-track-title" style={styles.title}>
            Delete Track
          </h2>
          <button
            type="button"
            style={styles.closeButton}
            onClick={onClose}
            aria-label="Close delete track dialog"
          >
            &#x2715;
          </button>
        </div>

        {/* Warning banner */}
        <div style={styles.warningBanner} id="delete-track-desc">
          <span aria-hidden style={styles.warningIcon}>&#9888;</span>
          <div>
            <p style={styles.warningText}>
              Track <strong>{track.name}</strong> and all its clips will be removed from the
              timeline.
            </p>
            <p style={styles.warningTextSecondary}>
              You can undo this action with Ctrl+Z or restore a previous version from Version
              History.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div style={styles.actions}>
          <button
            type="button"
            style={styles.cancelButton}
            onClick={onClose}
            aria-label="Cancel delete"
          >
            Cancel
          </button>
          <button
            type="button"
            style={isDeleteHovered ? styles.deleteButtonHover : styles.deleteButton}
            onClick={handleConfirm}
            onMouseEnter={() => setIsDeleteHovered(true)}
            onMouseLeave={() => setIsDeleteHovered(false)}
            aria-label={`Delete track ${track.name}`}
          >
            Delete Track
          </button>
        </div>
      </div>
    </div>
  );
}
