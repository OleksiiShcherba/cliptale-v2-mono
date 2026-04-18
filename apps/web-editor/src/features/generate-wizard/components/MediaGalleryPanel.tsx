import React, { useState, useCallback } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { AiGenerationPanel } from '@/shared/ai-generation/components/AiGenerationPanel';
import { useFileUpload } from '@/shared/file-upload/useFileUpload';
import { UploadDropzone } from '@/shared/file-upload/UploadDropzone';
import { useAssets } from '@/features/generate-wizard/hooks/useAssets';

import type { AssetSummary } from '../types';

import { AssetThumbCard } from './AssetThumbCard';
import { AudioRowCard } from './AudioRowCard';
import { MediaGalleryHeader } from './MediaGalleryHeader';
import {
  groupStyles,
  panelStyles,
} from './mediaGalleryStyles';
import { MediaGalleryTabs } from './MediaGalleryTabs';
import type { GalleryTab } from './MediaGalleryTabs';
import {
  FoldersPlaceholder,
  GalleryEmpty,
  GalleryError,
  GallerySkeleton,
} from './MediaGalleryPanelViews';

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

/** Formats bytes as GB rounded to 2 decimal places. */
function formatGigabytes(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  return `${gb.toFixed(2)} GB`;
}

// ---------------------------------------------------------------------------
// Asset group section
// ---------------------------------------------------------------------------

interface AssetGroupProps {
  label: string;
  assets: AssetSummary[];
  onAssetSelected: (asset: AssetSummary) => void;
}

function AssetGroup({ label, assets, onAssetSelected }: AssetGroupProps): React.ReactElement {
  const isAudio = assets[0]?.type === 'audio';

  return (
    <div style={groupStyles.section} data-testid={`asset-group-${label.toLowerCase()}`}>
      <div style={groupStyles.sectionLabel}>{label}</div>
      {isAudio ? (
        <div style={groupStyles.audioList}>
          {assets.map((asset) => (
            <AudioRowCard
              key={asset.id}
              asset={asset}
              onAssetSelected={onAssetSelected}
            />
          ))}
        </div>
      ) : (
        <div style={groupStyles.thumbGrid}>
          {assets.map((asset) => (
            <AssetThumbCard
              key={asset.id}
              asset={asset}
              onAssetSelected={onAssetSelected}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recent tab body
// ---------------------------------------------------------------------------

interface RecentBodyProps {
  onAssetSelected: (asset: AssetSummary) => void;
}

function RecentBody({ onAssetSelected }: RecentBodyProps): React.ReactElement {
  const { data, isLoading, isError } = useAssets({ type: 'all' });

  if (isLoading) return <GallerySkeleton />;
  if (isError) return <GalleryError />;
  if (!data || data.items.length === 0) return <GalleryEmpty />;

  const videos = data.items.filter((a) => a.type === 'video');
  const images = data.items.filter((a) => a.type === 'image');
  const audios = data.items.filter((a) => a.type === 'audio');

  return (
    <>
      {videos.length > 0 && (
        <AssetGroup label="Videos" assets={videos} onAssetSelected={onAssetSelected} />
      )}
      {images.length > 0 && (
        <AssetGroup label="Images" assets={images} onAssetSelected={onAssetSelected} />
      )}
      {audios.length > 0 && (
        <AssetGroup label="Audio" assets={audios} onAssetSelected={onAssetSelected} />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface MediaGalleryPanelProps {
  /** Called when the user clicks an asset card. Parent wires this to the PromptEditor ref. */
  onAssetSelected: (asset: AssetSummary) => void;
  /**
   * The current generation draft ID.
   * Used to link uploaded files to the draft via `POST /generation-drafts/:id/files`.
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
 * Panel height is 580px per spec; body overflows with scroll.
 */
export function MediaGalleryPanel({
  onAssetSelected,
  draftId,
}: MediaGalleryPanelProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState<GalleryTab>('recent');
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const { data } = useAssets({ type: 'all' });
  const queryClient = useQueryClient();

  const { entries, isUploading, uploadFiles, clearEntries } = useFileUpload({
    target: draftId
      ? { kind: 'draft', draftId }
      : { kind: 'draft', draftId: '' },
    onUploadComplete: () => {
      // Invalidate so the gallery refreshes after each file is linked to the draft
      void queryClient.invalidateQueries({ queryKey: ['generate-wizard', 'assets'] });
    },
  });

  const totalCount = data?.totals.count ?? 0;
  const gbUsed = data ? formatGigabytes(data.totals.bytesUsed) : '0.00 GB';

  const handleOpenUpload = useCallback(() => setIsUploadOpen(true), []);
  const handleCloseUpload = useCallback(() => setIsUploadOpen(false), []);
  const handleDoneUpload = useCallback(() => {
    clearEntries();
    setIsUploadOpen(false);
  }, [clearEntries]);

  // Switch back to Recent tab when AI generation completes and the user clicks
  // "View in Assets". Invalidate the wizard gallery query at this point so the
  // newly generated asset is visible in the Recent tab immediately.
  const handleSwitchToRecent = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['generate-wizard', 'assets'] });
    setActiveTab('recent');
  }, [queryClient]);

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
          <RecentBody onAssetSelected={onAssetSelected} />
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
