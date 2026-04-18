import React, { useRef, useState } from 'react';

import type { AssetSummary } from '../types';

import { CHIP_COLORS, createChipElement } from './promptEditorDOM';
import { audioCardStyles } from './mediaGalleryStyles';

/** MIME type used for cross-component drag payloads — must match PromptEditor. */
const ASSET_DRAG_MIME = 'application/x-cliptale-asset';

export interface AudioRowCardProps {
  asset: AssetSummary;
  onAssetSelected: (asset: AssetSummary) => void;
}

/** Formats seconds as `m:ss`. */
function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Audio note icon — inline SVG. */
function AudioIcon(): React.ReactElement {
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
        d="M9 2.5v9a2 2 0 1 1-1-1.73V5.12L5 5.87v5.63a2 2 0 1 1-1-1.73V5l5-1.25V2.5H9Z"
        fill="currentColor"
      />
    </svg>
  );
}

/**
 * Row-layout card for audio assets.
 * Shows audio icon, label, and optional duration.
 * Hover reveals a `+` overlay.
 * Click fires `onAssetSelected` with the full asset.
 */
export function AudioRowCard({
  asset,
  onAssetSelected,
}: AudioRowCardProps): React.ReactElement {
  const [isHovered, setIsHovered] = useState(false);
  // Off-screen drag image node — appended on dragstart, removed on dragend.
  const dragImageRef = useRef<HTMLElement | null>(null);

  function handleDragStart(e: React.DragEvent<HTMLButtonElement>): void {
    const payload = JSON.stringify({
      assetId: asset.id,
      type: asset.type,
      label: asset.label,
    });
    e.dataTransfer.setData(ASSET_DRAG_MIME, payload);
    e.dataTransfer.effectAllowed = 'copy';

    const chipEl = createChipElement({
      type: 'media-ref',
      mediaType: asset.type,
      assetId: asset.id,
      label: asset.label,
    });
    Object.assign(chipEl.style, {
      position: 'fixed',
      top: '-200px',
      left: '-200px',
      pointerEvents: 'none',
    });
    document.body.appendChild(chipEl);
    dragImageRef.current = chipEl;
    e.dataTransfer.setDragImage(chipEl, 0, 8);
  }

  function handleDragEnd(): void {
    if (dragImageRef.current) {
      document.body.removeChild(dragImageRef.current);
      dragImageRef.current = null;
    }
  }

  const dragBorderColor = CHIP_COLORS[asset.type];

  return (
    <button
      type="button"
      draggable
      style={{
        ...audioCardStyles.card,
        ...(isHovered ? { borderColor: dragBorderColor } : {}),
      }}
      onClick={() => onAssetSelected(asset)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      aria-label={asset.label}
    >
      <span style={audioCardStyles.icon}>
        <AudioIcon />
      </span>

      <span style={audioCardStyles.label}>{asset.label}</span>

      {asset.durationSeconds != null && (
        <span style={audioCardStyles.duration} aria-hidden="true">
          {formatDuration(asset.durationSeconds)}
        </span>
      )}

      <div
        style={{
          ...audioCardStyles.plusOverlay,
          ...(isHovered ? audioCardStyles.plusOverlayVisible : {}),
        }}
        aria-hidden="true"
      >
        +
      </div>
    </button>
  );
}
