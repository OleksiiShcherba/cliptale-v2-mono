import React from 'react';

import { TranscribeButton } from '@/features/captions/components/TranscribeButton';
import type { Asset } from '@/features/asset-manager/types';
import { useAddAssetToTimeline } from '@/features/asset-manager/hooks/useAddAssetToTimeline';
import { formatDuration, formatFileSize, getTypeLabel } from '@/features/asset-manager/utils';

const STATUS_BG: Record<string, string> = {
  ready: '#10B981',
  processing: '#F59E0B',
  error: '#EF4444',
  pending: '#8A8AA0',
};

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
  const addAssetToTimeline = useAddAssetToTimeline();
  const badgeBg = STATUS_BG[asset.status] ?? '#8A8AA0';
  const isReady = asset.status === 'ready';
  const isAV = asset.contentType.startsWith('video/') || asset.contentType.startsWith('audio/');

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
            fontSize: 14,
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

      {/* Transcribe button — video and audio assets only */}
      {isAV && <TranscribeButton assetId={asset.id} />}

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

      {/* Add to Timeline — enabled only when the asset is ready */}
      <button
        disabled={!isReady}
        title={isReady ? undefined : 'Processing…'}
        aria-label={`Add ${asset.filename} to timeline`}
        onClick={() => addAssetToTimeline(asset)}
        style={{
          width: 248,
          height: 36,
          borderRadius: 8,
          border: 'none',
          backgroundColor: isReady ? '#7C3AED' : '#4C1D95',
          color: isReady ? '#F0F0FA' : '#8A8AA0',
          fontSize: 14,
          fontWeight: 500,
          cursor: isReady ? 'pointer' : 'not-allowed',
          fontFamily: 'Inter, sans-serif',
          flexShrink: 0,
        }}
      >
        Add to Timeline
      </button>

      <button
        disabled
        style={{
          width: 248,
          height: 36,
          borderRadius: 8,
          border: '1px solid #252535',
          backgroundColor: 'transparent',
          color: '#8A8AA0',
          fontSize: 12,
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
          color: '#8A8AA0',
          fontSize: 12,
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
