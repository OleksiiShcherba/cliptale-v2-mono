import React, { useState } from 'react';

import type { Asset } from '@/features/asset-manager/types';
import { restoreAsset } from '@/features/asset-manager/api';
import { useDeleteAsset } from '@/features/asset-manager/hooks/useDeleteAsset';

import { deleteAssetDialogStyles as styles } from './deleteAssetDialog.styles';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface DeleteAssetDialogProps {
  /** The asset to be deleted. */
  asset: Asset;
  /** Project the asset is currently linked to; used for query invalidation. */
  projectId: string;
  onClose: () => void;
  /** Called after the deletion is committed so the browser can refresh. */
  onDeleted: () => void;
  /**
   * Optional callback invoked after successful soft-delete, providing:
   * - `label`: the human-readable message for the undo toast
   * - `onUndo`: the async function that restores the asset
   *
   * When provided the caller is responsible for rendering `UndoToast`.
   */
  onShowUndoToast?: (label: string, onUndo: () => Promise<void>) => void;
}

// ---------------------------------------------------------------------------
// DeleteAssetDialog
// ---------------------------------------------------------------------------

/**
 * Confirmation dialog for the "Delete Asset" action.
 *
 * Clears every clip that references the asset from the timeline, then calls
 * `DELETE /assets/:id` to remove the file from the user's library. The asset
 * list refetches after deletion. Timeline removal is undoable with Ctrl+Z;
 * the file itself is permanently removed.
 */
export function DeleteAssetDialog({
  asset,
  projectId,
  onClose,
  onDeleted,
  onShowUndoToast,
}: DeleteAssetDialogProps): React.ReactElement {
  const deleteAsset = useDeleteAsset({ projectId });
  const [isDeleteHovered, setIsDeleteHovered] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleConfirm = async (): Promise<void> => {
    if (isDeleting) return;
    setIsDeleting(true);
    setErrorMessage(null);
    try {
      const fileId = asset.id;
      await deleteAsset(fileId);
      onDeleted();
      onShowUndoToast?.(
        `"${asset.displayName ?? asset.filename}" deleted`,
        () => restoreAsset(fileId),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete asset';
      setErrorMessage(message);
      setIsDeleting(false);
    }
  };

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (e.target === e.currentTarget && !isDeleting) onClose();
  };

  return (
    <div
      style={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-asset-title"
      aria-describedby="delete-asset-desc"
      onClick={handleOverlayClick}
    >
      <div style={styles.modal}>
        {/* Header */}
        <div style={styles.header}>
          <h2 id="delete-asset-title" style={styles.title}>
            Delete Asset
          </h2>
          <button
            type="button"
            style={styles.closeButton}
            onClick={onClose}
            disabled={isDeleting}
            aria-label="Close delete asset dialog"
          >
            &#x2715;
          </button>
        </div>

        {/* Warning banner */}
        <div style={styles.warningBanner} id="delete-asset-desc">
          <span aria-hidden style={styles.warningIcon}>&#9888;</span>
          <div>
            <p style={styles.warningText}>
              All clips that use <strong>{asset.filename}</strong> will be removed from the
              timeline. Tracks that become empty after removal will also be deleted.
            </p>
            <p style={styles.warningTextSecondary}>
              The file will be moved to Trash. You can restore it from the Trash panel. Timeline
              clip removal can be undone with Ctrl+Z.
            </p>
          </div>
        </div>

        {errorMessage && (
          <p role="alert" style={{ color: '#EF4444', fontSize: 12, margin: '0 24px 12px', fontFamily: 'Inter, sans-serif' }}>
            {errorMessage}
          </p>
        )}

        {/* Actions */}
        <div style={styles.actions}>
          <button
            type="button"
            style={styles.cancelButton}
            onClick={onClose}
            disabled={isDeleting}
            aria-label="Cancel delete"
          >
            Cancel
          </button>
          <button
            type="button"
            style={isDeleteHovered ? styles.deleteButtonHover : styles.deleteButton}
            onClick={() => { void handleConfirm(); }}
            onMouseEnter={() => setIsDeleteHovered(true)}
            onMouseLeave={() => setIsDeleteHovered(false)}
            disabled={isDeleting}
            aria-label={`Delete asset ${asset.filename}`}
          >
            {isDeleting ? 'Deleting…' : 'Delete Asset'}
          </button>
        </div>
      </div>
    </div>
  );
}
