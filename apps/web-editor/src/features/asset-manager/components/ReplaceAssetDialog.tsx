import React, { useRef, useState } from 'react';

import type { Asset } from '@/features/asset-manager/types';
import { getAssetPreviewUrl } from '@/features/asset-manager/utils';
import { useAssetUpload } from '@/features/asset-manager/hooks/useAssetUpload';
import { useReplaceAsset } from '@/features/asset-manager/hooks/useReplaceAsset';
import { config } from '@/lib/config';

import { replaceAssetDialogStyles as styles } from './replaceAssetDialog.styles';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ReplaceAssetDialogProps {
  /** The asset being replaced. */
  asset: Asset;
  /** All assets in the project (used to show library options). */
  libraryAssets: Asset[];
  projectId: string;
  onClose: () => void;
  /** Called after the replacement is committed so the browser can refresh. */
  onReplaced: () => void;
}

// ---------------------------------------------------------------------------
// LibraryItem — a single row in the "select from library" list
// ---------------------------------------------------------------------------

interface LibraryItemProps {
  asset: Asset;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

function LibraryItem({ asset, isSelected, onSelect }: LibraryItemProps): React.ReactElement {
  const [isHovered, setIsHovered] = useState(false);
  const thumb = getAssetPreviewUrl(asset, config.apiBaseUrl);

  const itemStyle = isSelected
    ? styles.libraryItemSelected
    : isHovered
      ? styles.libraryItemHover
      : styles.libraryItem;

  return (
    <div
      role="option"
      aria-selected={isSelected}
      style={itemStyle}
      onClick={() => onSelect(asset.id)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {thumb ? (
        <img
          src={thumb}
          alt=""
          aria-hidden
          style={styles.libraryItemThumb as React.CSSProperties}
        />
      ) : (
        <div
          aria-hidden
          style={styles.libraryItemThumb as React.CSSProperties}
        />
      )}
      <p style={styles.libraryItemName}>{asset.filename}</p>
      {isSelected && <span aria-hidden style={styles.libraryItemCheck}>&#10003;</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ReplaceAssetDialog
// ---------------------------------------------------------------------------

/**
 * Confirmation dialog for the "Replace File" action.
 *
 * Shows a warning explaining that all clips using the old file will be updated
 * to point to the replacement. The original file is NOT deleted — the change
 * is stored in the Immer patch history and can be reverted with Ctrl+Z or
 * via Version History.
 *
 * Offers two replacement sources:
 * 1. Upload a new file (uses the existing `useAssetUpload` flow).
 * 2. Select an existing asset from the project library.
 */
export function ReplaceAssetDialog({
  asset,
  libraryAssets,
  projectId,
  onClose,
  onReplaced,
}: ReplaceAssetDialogProps): React.ReactElement {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceAsset = useReplaceAsset();

  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(null);
  const [isUploadHovered, setIsUploadHovered] = useState(false);
  const [isReplaceHovered, setIsReplaceHovered] = useState(false);
  const [isReplacing, setIsReplacing] = useState(false);

  const { uploadFiles, entries } = useAssetUpload({
    projectId,
    onUploadComplete: (newAssetId) => {
      replaceAsset(asset.id, newAssetId);
      onReplaced();
    },
  });

  // Library candidates: ready assets of the same type, excluding the current asset
  const candidates = libraryAssets.filter(
    (a) => a.id !== asset.id && a.status === 'ready',
  );

  const canConfirm = selectedLibraryId !== null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setIsReplacing(true);
      uploadFiles(files);
      // onUploadComplete callback will fire and call onReplaced
    }
    e.target.value = '';
  };

  const handleConfirmLibrary = (): void => {
    if (!selectedLibraryId) return;
    setIsReplacing(true);
    replaceAsset(asset.id, selectedLibraryId);
    onReplaced();
  };

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (e.target === e.currentTarget) onClose();
  };

  const isUploading = entries.some((en) => en.status === 'uploading');

  return (
    <div
      style={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="replace-asset-title"
      aria-describedby="replace-asset-desc"
      onClick={handleOverlayClick}
    >
      <div style={styles.modal}>
        {/* Header */}
        <div style={styles.header}>
          <h2 id="replace-asset-title" style={styles.title}>
            Replace File
          </h2>
          <button
            type="button"
            style={styles.closeButton}
            onClick={onClose}
            aria-label="Close replace file dialog"
          >
            &#x2715;
          </button>
        </div>

        {/* Warning banner */}
        <div style={styles.warningBanner} id="replace-asset-desc">
          <span aria-hidden style={styles.warningIcon}>&#9888;</span>
          <div>
            <p style={styles.warningText}>
              All clips that use <strong>{asset.filename}</strong> will be updated to use the
              replacement file. This affects the timeline and any previews.
            </p>
            <p style={styles.warningTextSecondary}>
              The original file is not deleted. You can undo this action with Ctrl+Z or restore a
              previous version from Version History.
            </p>
          </div>
        </div>

        {/* Upload new file */}
        <div>
          <p style={styles.sectionLabel}>Upload New File</p>
          <div
            style={isUploadHovered ? styles.uploadAreaHover : styles.uploadArea}
            role="button"
            tabIndex={0}
            aria-label="Upload replacement file"
            onClick={() => fileInputRef.current?.click()}
            onMouseEnter={() => setIsUploadHovered(true)}
            onMouseLeave={() => setIsUploadHovered(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
            }}
          >
            <span style={{ fontSize: '24px' }} aria-hidden>&#8679;</span>
            <p style={styles.uploadText}>
              {isUploading ? 'Uploading…' : 'Click to browse or drop a file here'}
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*,audio/*,image/*"
            style={{ display: 'none' }}
            aria-hidden
            onChange={handleFileChange}
          />
        </div>

        {/* OR divider */}
        <div style={styles.divider}>
          <div style={styles.dividerLine} />
          <span style={styles.dividerLabel}>OR</span>
          <div style={styles.dividerLine} />
        </div>

        {/* Select from library */}
        <div>
          <p style={styles.sectionLabel}>Select from Library</p>
          <div role="listbox" aria-label="Select replacement asset from library" style={styles.libraryList}>
            {candidates.length === 0 ? (
              <p style={styles.emptyLibrary}>No other ready assets in the library.</p>
            ) : (
              candidates.map((candidate) => (
                <LibraryItem
                  key={candidate.id}
                  asset={candidate}
                  isSelected={selectedLibraryId === candidate.id}
                  onSelect={setSelectedLibraryId}
                />
              ))
            )}
          </div>
        </div>

        {/* Actions */}
        <div style={styles.actions}>
          <button
            type="button"
            style={styles.cancelButton}
            onClick={onClose}
            disabled={isReplacing}
            aria-label="Cancel replace"
          >
            Cancel
          </button>
          <button
            type="button"
            style={
              !canConfirm || isReplacing
                ? styles.replaceButtonDisabled
                : isReplaceHovered
                  ? styles.replaceButtonHover
                  : styles.replaceButton
            }
            onClick={handleConfirmLibrary}
            disabled={!canConfirm || isReplacing}
            onMouseEnter={() => setIsReplaceHovered(true)}
            onMouseLeave={() => setIsReplaceHovered(false)}
            aria-label="Replace with selected asset"
          >
            Replace
          </button>
        </div>
      </div>
    </div>
  );
}
