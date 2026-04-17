import React, { useState } from 'react';

import type { AssetSummary } from '../types';

import { audioCardStyles } from './mediaGalleryStyles';

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

  return (
    <button
      type="button"
      style={audioCardStyles.card}
      onClick={() => onAssetSelected(asset)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
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
