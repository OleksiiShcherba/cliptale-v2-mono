import React from 'react';

import type { Asset } from '@/features/asset-manager/types';
import { TranscribeButton } from '@/features/captions/components/TranscribeButton';

const STATUS_BG: Record<string, string> = {
  ready: '#10B981',
  processing: '#F59E0B',
  error: '#EF4444',
  pending: '#8A8AA0',
};

/** Returns a human-readable media type label for a MIME content type. */
function getTypeLabel(contentType: string): string {
  if (contentType.startsWith('video/')) return 'Video';
  if (contentType.startsWith('audio/')) return 'Audio';
  if (contentType.startsWith('image/')) return 'Image';
  return 'File';
}

/** Returns an SVG icon element representing the media type. Used as thumbnail placeholder. */
function TypeIcon({ contentType }: { contentType: string }): React.ReactElement {
  const color = '#8A8AA0';

  if (contentType.startsWith('video/')) {
    // Film/play icon
    return (
      <svg
        data-testid="type-icon-video"
        aria-hidden="true"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polygon points="5,3 19,12 5,21" fill={color} stroke="none" />
      </svg>
    );
  }

  if (contentType.startsWith('audio/')) {
    // Music note icon
    return (
      <svg
        data-testid="type-icon-audio"
        aria-hidden="true"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </svg>
    );
  }

  if (contentType.startsWith('image/')) {
    // Image/mountain + sun icon
    return (
      <svg
        data-testid="type-icon-image"
        aria-hidden="true"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21,15 16,10 5,21" />
      </svg>
    );
  }

  // Generic file icon
  return (
    <svg
      data-testid="type-icon-file"
      aria-hidden="true"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14,2 14,8 20,8" />
    </svg>
  );
}

export interface AssetCardProps {
  asset: Asset;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

/**
 * A 296×64px card row: 48×48 thumbnail on the left, filename + status badge on the right.
 * While status is `processing` the badge pulses to indicate ongoing ingest.
 */
const isTranscribable = (contentType: string) =>
  contentType.startsWith('video/') || contentType.startsWith('audio/');

export function AssetCard({ asset, isSelected, onSelect }: AssetCardProps): React.ReactElement {
  const badgeBg = STATUS_BG[asset.status] ?? '#8A8AA0';
  const isDraggable = asset.status === 'ready';

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/cliptale-asset', JSON.stringify(asset));
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      aria-label={`Asset: ${asset.filename}, status: ${asset.status}`}
      draggable={isDraggable}
      onDragStart={isDraggable ? handleDragStart : undefined}
      onClick={() => onSelect(asset.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelect(asset.id);
      }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: 296,
        minHeight: 64,
        padding: 8,
        borderRadius: 8,
        backgroundColor: isSelected ? '#4C1D95' : '#1E1E2E',
        cursor: isDraggable ? 'grab' : 'pointer',
        boxSizing: 'border-box',
        outline: 'none',
        flexShrink: 0,
      }}
    >
      {/* Top row: thumbnail + metadata */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Thumbnail */}
        <div
          aria-hidden
          style={{
            width: 48,
            height: 48,
            borderRadius: 4,
            backgroundColor: '#16161F',
            flexShrink: 0,
            overflow: 'hidden',
          }}
        >
          {asset.thumbnailUri ? (
            <img
              src={asset.thumbnailUri}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <TypeIcon contentType={asset.contentType} />
            </div>
          )}
        </div>

        {/* Metadata */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: '#F0F0FA',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              fontFamily: 'Inter, sans-serif',
            }}
          >
            {asset.filename}
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: '#8A8AA0', fontFamily: 'Inter, sans-serif' }}>
              {getTypeLabel(asset.contentType)}
            </span>
            <span
              aria-label={`Status: ${asset.status}`}
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: '#F0F0FA',
                backgroundColor: badgeBg,
                borderRadius: 9999,
                padding: '2px 8px',
                fontFamily: 'Inter, sans-serif',
                textTransform: 'capitalize',
              }}
            >
              {asset.status}
            </span>
          </div>
        </div>
      </div>

      {/* Transcription CTA — only for video and audio assets */}
      {asset.status === 'ready' && isTranscribable(asset.contentType) && (
        <TranscribeButton assetId={asset.id} />
      )}
    </div>
  );
}
