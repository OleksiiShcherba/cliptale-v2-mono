import React from 'react';

import { TranscribeButton } from '@/features/captions/components/TranscribeButton';
import type { Asset } from '@/features/asset-manager/types';
import { formatDuration, formatFileSize, getAssetPreviewUrl, getTypeLabel } from '@/features/asset-manager/utils';
import { config } from '@/lib/config';

import { AddToTimelineDropdown } from './AddToTimelineDropdown';

const STATUS_BG: Record<string, string> = {
  ready: '#10B981',
  processing: '#F59E0B',
  error: '#EF4444',
  pending: '#8A8AA0',
};

const BORDER = '#252535';
const ERROR = '#EF4444';
const TEXT_PRIMARY = '#F0F0FA';
const TEXT_SECONDARY = '#8A8AA0';

export interface AssetDetailPanelProps {
  asset: Asset;
  projectId: string;
  /** Called when the user clicks "Delete Asset". Opens the delete confirmation dialog in the parent. */
  onDelete?: () => void;
  onClose?: () => void;
  /** Called when the user clicks "Replace File". Opens the replace dialog in the parent. */
  onReplace?: () => void;
}

/**
 * 280px right panel: preview thumbnail/waveform, filename, metadata row,
 * status badge, and Replace/Delete action buttons.
 * Visible only when an asset is selected in AssetBrowserPanel.
 */
export function AssetDetailPanel({ asset, projectId, onDelete, onClose, onReplace }: AssetDetailPanelProps): React.ReactElement {
  const badgeBg = STATUS_BG[asset.status] ?? '#8A8AA0';
  const isReady = asset.status === 'ready';
  const isAV = asset.contentType.startsWith('video/') || asset.contentType.startsWith('audio/');
  const previewUrl = getAssetPreviewUrl(asset, config.apiBaseUrl);

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
      {/* Panel header: title + close button */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: '#8A8AA0', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          Asset Details
        </span>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close asset details"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#8A8AA0',
              cursor: 'pointer',
              padding: 4,
              lineHeight: 1,
              fontSize: 14,
              borderRadius: 4,
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Preview — status badge overlaid at lower-right corner */}
      <div
        style={{
          width: 248,
          height: 160,
          borderRadius: 8,
          backgroundColor: '#1E1E2E',
          overflow: 'hidden',
          flexShrink: 0,
          position: 'relative',
        }}
      >
        {previewUrl ? (
          <img
            src={previewUrl}
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
        {/* Status badge overlaid on preview, lower-right */}
        <div
          aria-label={`Status: ${asset.status}`}
          style={{
            position: 'absolute',
            bottom: 8,
            right: 8,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: 28,
            paddingLeft: 8,
            paddingRight: 8,
            borderRadius: 9999,
            backgroundColor: badgeBg,
            fontSize: 11,
            fontWeight: 500,
            color: '#F0F0FA',
            textTransform: 'capitalize',
            boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
            letterSpacing: '0.04em',
          }}
        >
          {asset.status}
        </div>
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

      {/* Spacer pushes action buttons to bottom of the 620px panel */}
      <div style={{ flex: 1 }} />

      {/* Add to Timeline — shows a dropdown with "New Track" and existing tracks */}
      <AddToTimelineDropdown
        asset={asset}
        projectId={projectId}
        disabled={!isReady}
      />

      <button
        disabled={!onReplace}
        aria-label="Replace file"
        onClick={onReplace}
        style={{
          width: 248,
          height: 36,
          borderRadius: 8,
          border: `1px solid ${BORDER}`,
          backgroundColor: 'transparent',
          color: onReplace ? TEXT_PRIMARY : TEXT_SECONDARY,
          fontSize: 14,
          cursor: onReplace ? 'pointer' : 'not-allowed',
          fontFamily: 'Inter, sans-serif',
          flexShrink: 0,
          opacity: onReplace ? 1 : 0.5,
        }}
      >
        Replace File
      </button>

      <button
        disabled={!onDelete}
        aria-label={`Delete asset ${asset.filename}`}
        onClick={onDelete}
        style={{
          width: 248,
          height: 36,
          borderRadius: 8,
          border: `1px solid ${BORDER}`,
          backgroundColor: 'transparent',
          color: onDelete ? ERROR : TEXT_SECONDARY,
          fontSize: 14,
          cursor: onDelete ? 'pointer' : 'not-allowed',
          fontFamily: 'Inter, sans-serif',
          flexShrink: 0,
          opacity: onDelete ? 1 : 0.5,
        }}
      >
        Delete Asset
      </button>
    </div>
  );
}
