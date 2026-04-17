import React, { useState } from 'react';

import { useAssets } from '@/features/generate-wizard/hooks/useAssets';

import type { AssetSummary } from '../types';

import { AssetThumbCard } from './AssetThumbCard';
import { AudioRowCard } from './AudioRowCard';
import { MediaGalleryHeader } from './MediaGalleryHeader';
import {
  groupStyles,
  panelStyles,
  stateStyles,
} from './mediaGalleryStyles';
import { MediaGalleryTabs } from './MediaGalleryTabs';
import type { GalleryTab } from './MediaGalleryTabs';

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

/** Formats bytes as GB rounded to 2 decimal places. */
function formatGigabytes(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  return `${gb.toFixed(2)} GB`;
}

// ---------------------------------------------------------------------------
// Internal sub-views
// ---------------------------------------------------------------------------

/** Three grey skeleton cards while the query is loading. */
function GallerySkeleton(): React.ReactElement {
  return (
    <div style={stateStyles.skeletonGrid} data-testid="gallery-skeleton">
      <div style={stateStyles.skeletonCard} />
      <div style={stateStyles.skeletonCard} />
      <div style={stateStyles.skeletonCard} />
    </div>
  );
}

/** Error state. */
function GalleryError(): React.ReactElement {
  return (
    <div style={stateStyles.centerText} role="alert">
      Could not load assets
    </div>
  );
}

/** Empty state — shown when `items` is an empty array. */
function GalleryEmpty(): React.ReactElement {
  return (
    <div style={stateStyles.centerText}>
      No assets yet — upload in the editor
    </div>
  );
}

/** Folders tab placeholder. */
function FoldersPlaceholder(): React.ReactElement {
  return (
    <div style={stateStyles.foldersPlaceholder} data-testid="folders-placeholder">
      Folders coming soon
    </div>
  );
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
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

/**
 * Right-column gallery panel for the Generate Wizard Step 1.
 *
 * - Header: folder icon + "Media Gallery" heading
 * - Tabs: Recent (default) | Folders
 * - Body: grouped asset list (Videos / Images / Audio) with loading/error/empty states
 * - Footer: total count + GB used from the `totals` payload
 *
 * Panel height is 580px per ticket spec; body overflows with scroll.
 */
export function MediaGalleryPanel({
  onAssetSelected,
}: MediaGalleryPanelProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState<GalleryTab>('recent');
  const { data } = useAssets({ type: 'all' });

  const totalCount = data?.totals.count ?? 0;
  const gbUsed = data ? formatGigabytes(data.totals.bytesUsed) : '0.00 GB';

  return (
    <section
      style={panelStyles.panel}
      aria-label="Media gallery"
      aria-labelledby="media-gallery-heading"
    >
      <MediaGalleryHeader />

      <MediaGalleryTabs activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === 'recent' ? (
        <div
          id="tabpanel-recent"
          role="tabpanel"
          aria-labelledby="tab-recent"
          style={panelStyles.body}
          data-testid="tabpanel-recent"
        >
          <RecentBody onAssetSelected={onAssetSelected} />
        </div>
      ) : (
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

      <footer style={panelStyles.footer} aria-label="Gallery summary">
        <span style={panelStyles.footerText} data-testid="footer-asset-count">
          {totalCount} {totalCount === 1 ? 'Asset' : 'Assets'}
        </span>
        <span style={panelStyles.footerText} data-testid="footer-gb-used">
          {gbUsed} used
        </span>
      </footer>
    </section>
  );
}
