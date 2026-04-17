import React, { useEffect, useRef, useCallback } from 'react';

import { useAssets } from '@/features/generate-wizard/hooks/useAssets';

import type { AssetKind, AssetSummary } from '@/features/generate-wizard/types';

import { AssetThumbCard } from './AssetThumbCard';
import { AudioRowCard } from './AudioRowCard';
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

// ---------------------------------------------------------------------------
// Title helpers
// ---------------------------------------------------------------------------

const MEDIA_TYPE_LABELS: Record<AssetKind, string> = {
  video: 'Insert Video',
  image: 'Insert Image',
  audio: 'Insert Audio',
};

// ---------------------------------------------------------------------------
// Loading / error / empty sub-views
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Close (X) icon
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

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
}

// ---------------------------------------------------------------------------
// AssetPickerModal
// ---------------------------------------------------------------------------

/**
 * Modal dialog for picking a single asset of a specific media type.
 *
 * - Dimensions: 520×580px, centered, dark backdrop rgba(0,0,0,0.6).
 * - Title: "Insert Video" / "Insert Image" / "Insert Audio" computed from `mediaType`.
 * - Body: type-filtered card grid (AssetThumbCard for video/image, AudioRowCard for audio).
 * - Close: Esc key, backdrop click, or X button. Does NOT close on card hover or scroll.
 * - Pick: fires `onPick(asset)` then closes.
 * - Focus trap: moves focus to the dialog on open; returns focus to `triggerRef` on close.
 * - ARIA: role="dialog" + aria-modal="true" + aria-labelledby.
 * - Upload affordance: intentionally omitted per architecture decision (2026-04-16).
 */
export function AssetPickerModal({
  mediaType,
  onPick,
  onClose,
  triggerRef,
}: AssetPickerModalProps): React.ReactElement {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const titleId = 'asset-picker-title';

  const { data, isLoading, isError } = useAssets({ type: mediaType });

  // ── Focus management ─────────────────────────────────────────────────────

  useEffect(() => {
    // Move focus into the dialog when it mounts
    dialogRef.current?.focus();

    return () => {
      // Return focus to the trigger when the modal unmounts
      triggerRef?.current?.focus();
    };
  }, [triggerRef]);

  // ── Keyboard handler ─────────────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    },
    [onClose],
  );

  // ── Backdrop click ───────────────────────────────────────────────────────

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Only close when the click target is the backdrop itself, not the dialog
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose],
  );

  // ── Pick handler ─────────────────────────────────────────────────────────

  const handlePick = useCallback(
    (asset: AssetSummary) => {
      onPick(asset);
      onClose();
    },
    [onPick, onClose],
  );

  // ── Body content ─────────────────────────────────────────────────────────

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
          <AssetThumbCard key={asset.id} asset={asset} onAssetSelected={handlePick} />
        ))}
      </div>
    );
  }

  const title = MEDIA_TYPE_LABELS[mediaType];

  return (
    // Backdrop — clicking it closes the modal
    <div
      style={backdropStyle}
      onClick={handleBackdropClick}
      data-testid="picker-backdrop"
    >
      {/* Dialog — Esc key listener lives here so it captures bubbled events */}
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
        {/* Header */}
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

        {/* Scrollable body */}
        <div style={bodyStyle} data-testid="picker-body">
          {bodyContent}
        </div>
      </div>
    </div>
  );
}
