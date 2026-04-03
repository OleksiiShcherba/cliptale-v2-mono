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

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      aria-label={`Asset: ${asset.filename}, status: ${asset.status}`}
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
        cursor: 'pointer',
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
          {asset.thumbnailUri && (
            <img
              src={asset.thumbnailUri}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
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
