import React, { useState } from 'react';

import type { Asset } from '@/features/asset-manager/types';
import { useDeleteAsset } from '@/features/asset-manager/hooks/useDeleteAsset';

import { deleteAssetDialogStyles as styles } from './deleteAssetDialog.styles';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface DeleteAssetDialogProps {
  /** The asset to be deleted. */
  asset: Asset;
  onClose: () => void;
  /** Called after the deletion is committed so the browser can refresh. */
  onDeleted: () => void;
}

// ---------------------------------------------------------------------------
// DeleteAssetDialog
// ---------------------------------------------------------------------------

/**
 * Confirmation dialog for the "Delete Asset" action.
 *
 * Shows a warning explaining that all clips using this asset will be removed
 * from the timeline and their tracks deleted if empty. The asset file itself is
 * NOT physically deleted — only the project document is updated. The change is
 * tracked in the Immer patch history and can be reverted with Ctrl+Z or via
 * Version History.
 */
export function DeleteAssetDialog({
  asset,
  onClose,
  onDeleted,
}: DeleteAssetDialogProps): React.ReactElement {
  const deleteAsset = useDeleteAsset();
  const [isDeleteHovered, setIsDeleteHovered] = useState(false);

  const handleConfirm = (): void => {
    deleteAsset(asset.id);
    onDeleted();
  };

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (e.target === e.currentTarget) onClose();
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
              The original file is not deleted. You can undo this action with Ctrl+Z or restore a
              previous version from Version History.
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
            aria-label={`Delete asset ${asset.filename}`}
          >
            Delete Asset
          </button>
        </div>
      </div>
    </div>
  );
}
