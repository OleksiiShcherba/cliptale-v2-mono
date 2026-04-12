import React, { useState } from 'react';

import { TranscribeButton } from '@/features/captions/components/TranscribeButton';
import type { Asset } from '@/features/asset-manager/types';
import { formatDuration, formatFileSize, getAssetPreviewUrl, getTypeLabel } from '@/features/asset-manager/utils';
import { config } from '@/lib/config';

import { AddToTimelineDropdown } from './AddToTimelineDropdown';
import { AssetPreviewModal } from './AssetPreviewModal';
import { InlineRenameField } from './InlineRenameField';
import { assetDetailPanelStyles as s, STATUS_BG } from './assetDetailPanel.styles';

export interface AssetDetailPanelProps {
  asset: Asset;
  projectId: string;
  onDelete?: () => void;
  onClose?: () => void;
  onReplace?: () => void;
}

export function AssetDetailPanel({ asset, projectId, onDelete, onClose, onReplace }: AssetDetailPanelProps): React.ReactElement {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const displayedName = asset.displayName ?? asset.filename;
  const badgeBg = STATUS_BG[asset.status] ?? '#8A8AA0';
  const isReady = asset.status === 'ready';
  const isAV = asset.contentType.startsWith('video/') || asset.contentType.startsWith('audio/');
  const previewUrl = getAssetPreviewUrl(asset, config.apiBaseUrl);

  return (
    <div style={s.root}>
      {/* Panel header */}
      <div style={s.header}>
        <span style={s.headerLabel}>Asset Details</span>
        {onClose && (
          <button onClick={onClose} aria-label="Close asset details" style={s.closeButton}>
            ✕
          </button>
        )}
      </div>

      {/* Preview with status badge overlay */}
      <div style={s.previewContainer}>
        {previewUrl ? (
          <img src={previewUrl} alt={`Preview for ${asset.filename}`} style={s.previewImage} />
        ) : (
          <div style={s.previewEmpty}>No preview</div>
        )}
        <div
          aria-label={`Status: ${asset.status}`}
          style={{ ...s.statusBadge, backgroundColor: badgeBg }}
        >
          {asset.status}
        </div>
      </div>

      {/* Inline-editable display name */}
      <InlineRenameField assetId={asset.id} projectId={projectId} displayedName={displayedName} />

      {/* Metadata row */}
      <div style={s.metadataRow}>
        <span style={s.metadataItem}>{getTypeLabel(asset.contentType)}</span>
        <span style={s.metadataItem}>{formatFileSize(asset.fileSizeBytes)}</span>
        {asset.durationSeconds !== null && (
          <span style={s.metadataItem}>{formatDuration(asset.durationSeconds)}</span>
        )}
        {asset.width !== null && asset.height !== null && (
          <span style={s.metadataItem}>{asset.width}×{asset.height}</span>
        )}
      </div>

      {isAV && <TranscribeButton assetId={asset.id} />}

      <div style={{ flex: 1 }} />

      <button
        disabled={!isReady}
        aria-label={`Preview asset ${asset.filename}`}
        onClick={() => setIsPreviewOpen(true)}
        style={s.actionButton(isReady)}
      >
        Preview
      </button>

      <AddToTimelineDropdown asset={asset} projectId={projectId} disabled={!isReady} />

      <button
        disabled={!onReplace}
        aria-label="Replace file"
        onClick={onReplace}
        style={s.actionButton(!!onReplace)}
      >
        Replace File
      </button>

      <button
        disabled={!onDelete}
        aria-label={`Delete asset ${asset.filename}`}
        onClick={onDelete}
        style={s.deleteButton(!!onDelete)}
      >
        Delete Asset
      </button>

      {isPreviewOpen && (
        <AssetPreviewModal asset={asset} onClose={() => setIsPreviewOpen(false)} />
      )}
    </div>
  );
}
