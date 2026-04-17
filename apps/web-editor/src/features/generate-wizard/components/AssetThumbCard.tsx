import React, { useState } from 'react';

import { buildAuthenticatedUrl } from '@/lib/api-client';

import type { AssetSummary } from '../types';

import { thumbCardStyles } from './mediaGalleryStyles';

export interface AssetThumbCardProps {
  asset: AssetSummary;
  onAssetSelected: (asset: AssetSummary) => void;
}

/** Formats seconds as `m:ss`. */
function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Thumbnail card for video and image assets.
 * Shows the thumbnail (via authenticated URL), filename, and optional duration badge.
 * Hover reveals a `+` overlay with PRIMARY accent.
 * Click fires `onAssetSelected` with the full asset.
 */
export function AssetThumbCard({
  asset,
  onAssetSelected,
}: AssetThumbCardProps): React.ReactElement {
  const [isHovered, setIsHovered] = useState(false);

  const thumbSrc = asset.thumbnailUrl
    ? buildAuthenticatedUrl(asset.thumbnailUrl)
    : null;

  return (
    <button
      type="button"
      style={thumbCardStyles.card}
      onClick={() => onAssetSelected(asset)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      aria-label={asset.label}
    >
      <div style={thumbCardStyles.thumbWrapper}>
        {thumbSrc ? (
          <img
            src={thumbSrc}
            alt={asset.label}
            style={thumbCardStyles.thumb}
          />
        ) : (
          <div
            style={{
              ...thumbCardStyles.thumb,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#8A8AA0',
              fontSize: '11px',
            }}
          >
            {asset.type === 'video' ? '▶' : '🖼'}
          </div>
        )}

        {asset.type === 'video' && asset.durationSeconds != null && (
          <span style={thumbCardStyles.durationBadge} aria-hidden="true">
            {formatDuration(asset.durationSeconds)}
          </span>
        )}

        <div
          style={{
            ...thumbCardStyles.overlay,
            ...(isHovered ? thumbCardStyles.overlayVisible : {}),
          }}
          aria-hidden="true"
        >
          <span style={thumbCardStyles.overlayPlus}>+</span>
        </div>
      </div>

      <div style={thumbCardStyles.label}>{asset.label}</div>
    </button>
  );
}
