import React, { useCallback, useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { TranscribeButton } from '@/features/captions/components/TranscribeButton';
import type { Asset } from '@/features/asset-manager/types';
import { formatDuration, formatFileSize, getAssetPreviewUrl, getTypeLabel } from '@/features/asset-manager/utils';
import { AddToTimelineDropdown } from '@/features/asset-manager/components/AddToTimelineDropdown';
import { AssetPreviewModal } from '@/features/asset-manager/components/AssetPreviewModal';
import { InlineRenameField } from '@/features/asset-manager/components/InlineRenameField';
import { config } from '@/lib/config';

import { getAssetDetailPanelStyles, STATUS_BG } from './assetDetailPanel.styles';

// ---------------------------------------------------------------------------
// Context discriminated union
// ---------------------------------------------------------------------------

/** Project context: the panel is used inside the main editor. */
type ProjectContext = { kind: 'project'; projectId: string };

/** Draft context: the panel is used inside the generate wizard. */
type DraftContext = { kind: 'draft'; draftId: string };

/** Discriminated union describing which container the panel is embedded in. */
export type AssetDetailPanelContext = ProjectContext | DraftContext;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AssetDetailPanelProps {
  /** The asset to display. */
  asset: Asset;
  /**
   * Context determines the primary action:
   * - `project` → shows "Add to Timeline" dropdown (existing behaviour).
   * - `draft`   → shows "Add to Prompt" button; fires `onAddToPrompt`.
   */
  context: AssetDetailPanelContext;
  /** Called when the user confirms deletion (both contexts). */
  onDelete?: () => void;
  /** Called when the panel close button is clicked (both contexts). */
  onClose?: () => void;
  /** Called when the user wants to replace the file (project context only). */
  onReplace?: () => void;
  /**
   * Called when the user presses "Add to Prompt" (draft context only).
   * The consumer is responsible for inserting the MediaRef chip.
   */
  onAddToPrompt?: (asset: Asset) => void;
  /**
   * When `true` (default) the panel uses a fixed 280×620 px layout suited for
   * the editor right sidebar. When `false` the panel grows to fill its
   * container (max 520 px) — used inside the generate-wizard right column.
   */
  compact?: boolean;
  /**
   * When `true` the TranscribeButton is not rendered.
   * Use on pages where transcription is not available (e.g. Storyboard page).
   */
  hideTranscribe?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Detail panel for a single asset.
 *
 * Renders preview, metadata, inline rename, and a context-driven primary action:
 * - `project` context → "Add to Timeline" dropdown
 * - `draft`   context → "Add to Prompt" button (calls `onAddToPrompt`)
 *
 * Pass `compact={false}` in the generate-wizard to let the panel fill the
 * wider right column instead of keeping the editor-sidebar fixed 280 px width.
 */
export function AssetDetailPanel({
  asset,
  context,
  onDelete,
  onClose,
  onReplace,
  onAddToPrompt,
  compact = true,
  hideTranscribe = false,
}: AssetDetailPanelProps): React.ReactElement {
  const s = getAssetDetailPanelStyles(compact);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const queryClient = useQueryClient();

  const displayedName = asset.displayName ?? asset.filename;
  const badgeBg = STATUS_BG[asset.status] ?? '#8A8AA0';
  const isReady = asset.status === 'ready';
  const isAV = asset.contentType.startsWith('video/') || asset.contentType.startsWith('audio/');
  const previewUrl = getAssetPreviewUrl(asset, config.apiBaseUrl);

  // The projectId is needed by sub-components in project context.
  const projectId = context.kind === 'project' ? context.projectId : '';

  /**
   * In draft context, after a rename succeeds, also invalidate the wizard
   * gallery so the renamed asset reflects immediately without a page reload.
   */
  const handleRenameSuccess = useCallback((): void => {
    if (context.kind === 'draft') {
      void queryClient.invalidateQueries({ queryKey: ['generate-wizard', 'assets'] });
    }
  }, [context.kind, queryClient]);

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
      <InlineRenameField
        fileId={asset.id}
        projectId={projectId}
        displayedName={displayedName}
        onRenameSuccess={handleRenameSuccess}
      />

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

      {isAV && !hideTranscribe && <TranscribeButton fileId={asset.id} />}

      <div style={{ flex: 1 }} />

      {/* Preview button — both contexts */}
      <button
        disabled={!isReady}
        aria-label={`Preview asset ${asset.filename}`}
        onClick={() => setIsPreviewOpen(true)}
        style={s.actionButton(isReady)}
      >
        Preview
      </button>

      {/* Context-driven primary action */}
      {context.kind === 'project' ? (
        <AddToTimelineDropdown asset={asset} projectId={context.projectId} disabled={!isReady} />
      ) : (
        <button
          disabled={!isReady || !onAddToPrompt}
          aria-label={`Add ${asset.filename} to prompt`}
          onClick={() => onAddToPrompt?.(asset)}
          style={s.primaryActionButton(isReady && !!onAddToPrompt)}
        >
          Add to Prompt
        </button>
      )}

      {/* Replace File — project context only (hidden in draft) */}
      {context.kind === 'project' && (
        <button
          disabled={!onReplace}
          aria-label="Replace file"
          onClick={onReplace}
          style={s.actionButton(!!onReplace)}
        >
          Replace File
        </button>
      )}

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
