import React, { useRef, useState } from 'react';

import { buildAuthenticatedUrl } from '@/lib/api-client';

import type { AssetSummary } from '../types';

import { CHIP_COLORS, createChipElement } from './promptEditorDOM';
import { thumbCardStyles } from './mediaGalleryStyles';

/** MIME type used for cross-component drag payloads — must match PromptEditor. */
const ASSET_DRAG_MIME = 'application/x-cliptale-asset';

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
  // Holds a reference to the off-screen drag image so we can remove it after
  // the drag ends. The element is appended to `document.body` during `dragstart`
  // and removed on `dragend` to avoid leaking DOM nodes.
  const dragImageRef = useRef<HTMLElement | null>(null);

  const thumbSrc = asset.thumbnailUrl
    ? buildAuthenticatedUrl(asset.thumbnailUrl)
    : null;

  function handleDragStart(e: React.DragEvent<HTMLButtonElement>): void {
    const payload = JSON.stringify({
      fileId: asset.id,
      type: asset.type,
      label: asset.label,
    });
    e.dataTransfer.setData(ASSET_DRAG_MIME, payload);
    e.dataTransfer.effectAllowed = 'copy';

    // Build a chip-styled drag image using the same `createChipElement` helper
    // so the visual matches the final chip exactly.
    const chipEl = createChipElement({
      type: 'media-ref',
      mediaType: asset.type,
      fileId: asset.id,
      label: asset.label,
    });
    // Mount off-screen so the browser can snapshot it.
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

  // Compute a visual drag affordance hint — a subtle border highlight in the
  // chip color corresponding to this asset's media type.
  const dragBorderColor = CHIP_COLORS[asset.type];

  return (
    <button
      type="button"
      draggable
      style={{
        ...thumbCardStyles.card,
        ...(isHovered ? { borderColor: dragBorderColor } : {}),
      }}
      onClick={() => onAssetSelected(asset)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
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
