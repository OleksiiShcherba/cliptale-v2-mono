import React, { useEffect, useRef, useCallback } from 'react';

import { useAssets } from '@/features/generate-wizard/hooks/useAssets';
import { useBulkFileStreamUrls } from '@/shared/hooks/useBulkFileStreamUrls';

import type { AssetKind, AssetSummary } from '@/features/generate-wizard/types';
import type { UploadTarget } from '@/shared/file-upload/types';

import { AssetThumbCard } from './AssetThumbCard';
import { AudioRowCard } from './AudioRowCard';
import { AssetPickerUploadAffordance } from './AssetPickerUploadAffordance';
import {
  backdropStyle,
  bodyStyle,
  closeButtonStyle,
  dialogStyle,
  headerStyle,
  headerTextStyle,
  subtitleStyle,
  thumbGridStyle,
  audioListStyle,
  titleStyle,
} from './assetPickerModalStyles';
import { stateStyles } from './mediaGalleryStyles';

const MEDIA_TYPE_LABELS: Record<AssetKind, string> = {
  video: 'Insert Video',
  image: 'Insert Image',
  audio: 'Insert Audio',
};

function PickerSkeleton(): React.ReactElement {
  return (
    <div style={stateStyles.skeletonGrid} data-testid="picker-skeleton">
      <div style={stateStyles.skeletonCard} />
      <div style={stateStyles.skeletonCard} />
      <div style={stateStyles.skeletonCard} />
    </div>
  );
}

function PickerError(): React.ReactElement {
  return (
    <div style={stateStyles.centerText} role="alert">
      Could not load assets
    </div>
  );
}

function PickerEmpty(): React.ReactElement {
  return (
    <div style={stateStyles.centerText}>
      No assets found for this type
    </div>
  );
}

function CloseIcon(): React.ReactElement {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M12 4L4 12M4 4l8 8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export interface AssetPickerModalProps {
  /** Which asset kind to list. */
  mediaType: AssetKind;
  /** Fired when an asset is chosen; modal closes itself immediately after. */
  onPick: (asset: AssetSummary) => void;
  /** Fired when the modal should close (Esc, backdrop, X button, or after pick). */
  onClose: () => void;
  /**
   * Optional ref to the trigger element so focus can be restored on close.
   * When provided, the modal moves focus back to the trigger after closing.
   */
  triggerRef?: React.RefObject<HTMLElement | null>;
  /**
   * When provided, an "Upload new file" button is rendered at the top of the
   * scrollable body. Upload is opt-in — omitting this prop leaves the modal
   * exactly as before (backward-compatible). See SB-UPLOAD-1 (2026-04-27).
   */
  uploadTarget?: UploadTarget;
  /** Optional draft id for draft-scoped asset listing. */
  draftId?: string;
  /** Asset scope used when draftId is provided. Defaults to draft. */
  scope?: 'draft' | 'all';
}

/**
 * Modal dialog for picking a single asset of a specific media type.
 */
export function AssetPickerModal({
  mediaType,
  onPick,
  onClose,
  triggerRef,
  uploadTarget,
  draftId,
  scope = 'draft',
}: AssetPickerModalProps): React.ReactElement {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const titleId = 'asset-picker-title';

  const { data, isLoading, isError } = useAssets({ type: mediaType, draftId, scope });
  const imageStreamFileIds = React.useMemo(
    () => (data?.items ?? [])
      .filter((asset) => asset.type === 'image' && asset.thumbnailUrl === null)
      .map((asset) => asset.id),
    [data?.items],
  );
  const { urls: imageStreamUrls } = useBulkFileStreamUrls(imageStreamFileIds);

  useEffect(() => {
    dialogRef.current?.focus();

    return () => {
      triggerRef?.current?.focus();
    };
  }, [triggerRef]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    },
    [onClose],
  );

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose],
  );

  const handlePick = useCallback(
    (asset: AssetSummary) => {
      onPick(asset);
      onClose();
    },
    [onPick, onClose],
  );

  const handleUploadComplete = useCallback(
    (fileId: string, file: File) => {
      const asset: AssetSummary = {
        id: fileId,
        type: mediaType,
        label: file.name,
        durationSeconds: null,
        thumbnailUrl: null,
        createdAt: new Date().toISOString(),
      };
      handlePick(asset);
    },
    [mediaType, handlePick],
  );

  let bodyContent: React.ReactElement;
  if (isLoading) {
    bodyContent = <PickerSkeleton />;
  } else if (isError) {
    bodyContent = <PickerError />;
  } else if (!data || data.items.length === 0) {
    bodyContent = <PickerEmpty />;
  } else if (mediaType === 'audio') {
    bodyContent = (
      <div style={audioListStyle}>
        {data.items.map((asset) => (
          <AudioRowCard key={asset.id} asset={asset} onAssetSelected={handlePick} />
        ))}
      </div>
    );
  } else {
    bodyContent = (
      <div style={thumbGridStyle}>
        {data.items.map((asset) => (
          <AssetThumbCard
            key={asset.id}
            asset={asset}
            onAssetSelected={handlePick}
            previewUrl={
              asset.type === 'image' && asset.thumbnailUrl === null
                ? (imageStreamUrls[asset.id] ?? null)
                : undefined
            }
          />
        ))}
      </div>
    );
  }

  const title = MEDIA_TYPE_LABELS[mediaType];

  return (
    <div
      style={backdropStyle}
      onClick={handleBackdropClick}
      data-testid="picker-backdrop"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={dialogStyle}
        onKeyDown={handleKeyDown}
        tabIndex={-1}
        data-testid="picker-dialog"
      >
        <div style={headerStyle}>
          <div style={headerTextStyle}>
            <h2 id={titleId} style={titleStyle}>
              {title}
            </h2>
            <p style={subtitleStyle}>Select from your library</p>
          </div>

          <button
            type="button"
            style={closeButtonStyle}
            onClick={onClose}
            aria-label="Close picker"
            data-testid="picker-close-button"
          >
            <CloseIcon />
          </button>
        </div>

        <div style={bodyStyle} data-testid="picker-body">
          {uploadTarget && (
            <AssetPickerUploadAffordance
              mediaType={mediaType}
              uploadTarget={uploadTarget}
              onUploadComplete={handleUploadComplete}
            />
          )}

          {bodyContent}
        </div>
      </div>
    </div>
  );
}
