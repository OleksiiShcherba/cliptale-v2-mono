import React, { useState, useCallback, useEffect, useRef } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { AiGenerationPanel } from '@/shared/ai-generation/components/AiGenerationPanel';
import { useFileUpload } from '@/shared/file-upload/useFileUpload';
import { UploadDropzone } from '@/shared/file-upload/UploadDropzone';
import { useAssets } from '@/features/generate-wizard/hooks/useAssets';

import type { AssetSummary } from '../types';

import { MediaGalleryHeader } from './MediaGalleryHeader';
import { panelStyles } from './mediaGalleryStyles';
import { MediaGalleryTabs } from './MediaGalleryTabs';
import type { GalleryTab } from './MediaGalleryTabs';
import { FoldersPlaceholder } from './MediaGalleryPanelViews';
import { MediaGalleryRecentBody } from './MediaGalleryRecentBody';

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

/** Formats bytes as GB rounded to 2 decimal places. */
function formatGigabytes(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  return `${gb.toFixed(2)} GB`;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface MediaGalleryPanelProps {
  /** Called when the user clicks an asset card. Parent wires this to the PromptEditor ref. */
  onAssetSelected: (asset: AssetSummary) => void;
  /**
   * The current generation draft ID.
   * Used to scope the asset list and link uploaded files to the draft.
   * When undefined the Upload button is hidden (e.g. during initial draft creation).
   */
  draftId: string | undefined;
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

/**
 * Right-column gallery panel for the Generate Wizard Step 1.
 * Tabs: Recent | Folders | AI. AI tab renders AiGenerationPanel scoped to the
 * current draft; on completion the gallery query is invalidated automatically.
 *
 * Scope toggle (Recent tab): defaults to `scope=draft` when `draftId` is
 * provided. Auto-switches to `scope=all` on first load when the draft-scoped
 * list is empty. Toggle resets to `draft` when the component re-mounts.
 */
export function MediaGalleryPanel({
  onAssetSelected,
  draftId,
}: MediaGalleryPanelProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState<GalleryTab>('recent');
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [scope, setScope] = useState<'draft' | 'all'>('draft');
  const autoSwitchedRef = useRef(false);

  // Fetch draft-scoped assets for auto-switch detection
  const { data: scopedData } = useAssets({ type: 'all', draftId, scope: 'draft' });
  // Fetch totals (full library) for the footer counter
  const { data: totalsData } = useAssets({ type: 'all' });

  const queryClient = useQueryClient();

  // Auto-switch to 'all' on first load when the draft-scoped list is empty
  useEffect(() => {
    if (
      draftId &&
      scopedData !== undefined &&
      scopedData.items.length === 0 &&
      scope === 'draft' &&
      !autoSwitchedRef.current
    ) {
      autoSwitchedRef.current = true;
      setScope('all');
    }
  }, [draftId, scopedData, scope]);

  const { entries, isUploading, uploadFiles, clearEntries } = useFileUpload({
    target: draftId
      ? { kind: 'draft', draftId }
      : { kind: 'draft', draftId: '' },
    onUploadComplete: () => {
      void queryClient.invalidateQueries({ queryKey: ['generate-wizard', 'assets'] });
    },
  });

  const totalCount = totalsData?.totals.count ?? 0;
  const gbUsed = totalsData ? formatGigabytes(totalsData.totals.bytesUsed) : '0.00 GB';

  const handleOpenUpload = useCallback(() => setIsUploadOpen(true), []);
  const handleCloseUpload = useCallback(() => setIsUploadOpen(false), []);
  const handleDoneUpload = useCallback(() => {
    clearEntries();
    setIsUploadOpen(false);
  }, [clearEntries]);

  const handleSwitchToRecent = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['generate-wizard', 'assets'] });
    setActiveTab('recent');
  }, [queryClient]);

  const handleScopeToggle = useCallback(() => {
    setScope((prev) => (prev === 'draft' ? 'all' : 'draft'));
  }, []);

  return (
    <section
      style={panelStyles.panel}
      aria-label="Media gallery"
      aria-labelledby="media-gallery-heading"
    >
      <div style={headerRowStyles}>
        <MediaGalleryHeader />
        {draftId && activeTab !== 'ai' && (
          <button
            onClick={handleOpenUpload}
            aria-label="Upload files"
            data-testid="upload-button"
            style={uploadButtonStyle}
          >
            Upload
          </button>
        )}
      </div>

      <MediaGalleryTabs activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === 'recent' && (
        <div
          id="tabpanel-recent"
          role="tabpanel"
          aria-labelledby="tab-recent"
          style={panelStyles.body}
          data-testid="tabpanel-recent"
        >
          <MediaGalleryRecentBody
            onAssetSelected={onAssetSelected}
            draftId={draftId}
            scope={scope}
            onScopeToggle={handleScopeToggle}
          />
        </div>
      )}

      {activeTab === 'folders' && (
        <div
          id="tabpanel-folders"
          role="tabpanel"
          aria-labelledby="tab-folders"
          style={panelStyles.body}
          data-testid="tabpanel-folders"
        >
          <FoldersPlaceholder />
        </div>
      )}

      {activeTab === 'ai' && (
        <div
          id="tabpanel-ai"
          role="tabpanel"
          aria-labelledby="tab-ai"
          style={panelStyles.body}
          data-testid="tabpanel-ai"
        >
          {draftId ? (
            <AiGenerationPanel
              context={{ kind: 'draft', id: draftId }}
              onSwitchToAssets={handleSwitchToRecent}
            />
          ) : (
            <p style={aiUnavailableStyle}>
              AI generation is available after the draft is created.
            </p>
          )}
        </div>
      )}

      <footer style={panelStyles.footer} aria-label="Gallery summary">
        <span style={panelStyles.footerText} data-testid="footer-asset-count">
          {totalCount} {totalCount === 1 ? 'Asset' : 'Assets'}
        </span>
        <span style={panelStyles.footerText} data-testid="footer-gb-used">
          {gbUsed} used
        </span>
      </footer>

      {isUploadOpen && (
        <UploadDropzone
          entries={entries}
          isUploading={isUploading}
          onUploadFiles={uploadFiles}
          onClose={handleCloseUpload}
          onDone={handleDoneUpload}
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const headerRowStyles: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingRight: 16,
  flexShrink: 0,
};

const uploadButtonStyle: React.CSSProperties = {
  height: 32,
  padding: '0 16px',
  borderRadius: 8,
  backgroundColor: '#7C3AED',
  border: 'none',
  color: '#F0F0FA',
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'Inter, sans-serif',
  flexShrink: 0,
};

const aiUnavailableStyle: React.CSSProperties = {
  fontSize: 14,
  color: '#8A8AA0',
  textAlign: 'center',
  marginTop: 32,
  fontFamily: 'Inter, sans-serif',
};
