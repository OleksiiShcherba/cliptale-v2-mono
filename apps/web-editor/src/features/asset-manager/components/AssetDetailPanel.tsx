import React from 'react';

import type { Asset } from '@/features/asset-manager/types';

const STATUS_BG: Record<string, string> = {
  ready: '#10B981',
  processing: '#F59E0B',
  error: '#EF4444',
  pending: '#8A8AA0',
};

/** Formats bytes to a human-readable string (B / KB / MB / GB). */
function formatFileSize(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

/** Formats duration in seconds to M:SS. */
function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function getTypeLabel(contentType: string): string {
  if (contentType.startsWith('video/')) return 'Video';
  if (contentType.startsWith('audio/')) return 'Audio';
  if (contentType.startsWith('image/')) return 'Image';
  return 'File';
}

export interface AssetDetailPanelProps {
  asset: Asset;
  onDelete?: (id: string) => void;
}

/**
 * 280px right panel: preview thumbnail/waveform, filename, metadata row,
 * status badge, and Replace/Delete action buttons.
 * Visible only when an asset is selected in AssetBrowserPanel.
 */
export function AssetDetailPanel({ asset, onDelete }: AssetDetailPanelProps): React.ReactElement {
  const badgeBg = STATUS_BG[asset.status] ?? '#8A8AA0';

  return (
    <div
      style={{
        width: 280,
        height: 620,
        backgroundColor: '#16161F',
        display: 'flex',
        flexDirection: 'column',
        padding: 16,
        boxSizing: 'border-box',
        gap: 16,
        fontFamily: 'Inter, sans-serif',
        flexShrink: 0,
      }}
    >
      {/* Preview */}
      <div
        style={{
          width: 248,
          height: 160,
          borderRadius: 8,
          backgroundColor: '#1E1E2E',
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        {asset.thumbnailUri ? (
          <img
            src={asset.thumbnailUri}
            alt={`Preview for ${asset.filename}`}
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
              color: '#8A8AA0',
              fontSize: 12,
            }}
          >
            No preview
          </div>
        )}
      </div>

      {/* Filename */}
      <div
        style={{
          width: 248,
          height: 32,
          borderRadius: 6,
          backgroundColor: '#1E1E2E',
          display: 'flex',
          alignItems: 'center',
          padding: '0 8px',
          boxSizing: 'border-box',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 13,
            color: '#F0F0FA',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {asset.filename}
        </span>
      </div>

      {/* File type + size + duration + resolution */}
      <div
        style={{
          width: 248,
          height: 40,
          borderRadius: 6,
          backgroundColor: '#1E1E2E',
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          padding: '0 8px',
          gap: 8,
          boxSizing: 'border-box',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 12, color: '#8A8AA0' }}>{getTypeLabel(asset.contentType)}</span>
        <span style={{ fontSize: 12, color: '#8A8AA0' }}>{formatFileSize(asset.fileSizeBytes)}</span>
        {asset.durationSeconds !== null && (
          <span style={{ fontSize: 12, color: '#8A8AA0' }}>
            {formatDuration(asset.durationSeconds)}
          </span>
        )}
        {asset.width !== null && asset.height !== null && (
          <span style={{ fontSize: 12, color: '#8A8AA0' }}>
            {asset.width}×{asset.height}
          </span>
        )}
      </div>

      {/* Status badge */}
      <div
        aria-label={`Status: ${asset.status}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: 28,
          width: 140,
          borderRadius: 9999,
          backgroundColor: badgeBg,
          fontSize: 11,
          fontWeight: 500,
          color: '#F0F0FA',
          textTransform: 'capitalize',
          flexShrink: 0,
        }}
      >
        {asset.status}
      </div>

      {/* Spacer pushes action buttons to bottom of the 620px panel */}
      <div style={{ flex: 1 }} />

      <button
        disabled
        style={{
          width: 248,
          height: 36,
          borderRadius: 8,
          border: '1px solid #252535',
          backgroundColor: 'transparent',
          color: '#555560',
          fontSize: 13,
          cursor: 'not-allowed',
          fontFamily: 'Inter, sans-serif',
          flexShrink: 0,
          opacity: 0.5,
        }}
      >
        Replace File
      </button>

      <button
        disabled
        aria-label={`Delete asset ${asset.filename}`}
        style={{
          width: 248,
          height: 36,
          borderRadius: 8,
          border: '1px solid #252535',
          backgroundColor: 'transparent',
          color: '#555560',
          fontSize: 13,
          cursor: 'not-allowed',
          fontFamily: 'Inter, sans-serif',
          flexShrink: 0,
          opacity: 0.5,
        }}
      >
        Delete Asset
      </button>
    </div>
  );
}
