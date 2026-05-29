/**
 * Recent tab body for MediaGalleryPanel.
 *
 * Fetches assets scoped to the current draft (or the full library when
 * `scope='all'`). Groups results into Videos / Images / Audio sections.
 * Shows skeleton / error / empty state views while loading.
 */

import React from 'react';

import { useAssets } from '@/features/generate-wizard/hooks/useAssets';
import { useBulkFileStreamUrls } from '@/shared/hooks/useBulkFileStreamUrls';

import type { AssetSummary } from '../types';

import { AssetThumbCard } from './AssetThumbCard';
import { AudioRowCard } from './AudioRowCard';
import { groupStyles } from './mediaGalleryStyles';
import {
  GalleryEmpty,
  GalleryError,
  GallerySkeleton,
} from './MediaGalleryPanelViews';

// ---------------------------------------------------------------------------
// Asset group section
// ---------------------------------------------------------------------------

interface AssetGroupProps {
  label: string;
  assets: AssetSummary[];
  onAssetSelected: (asset: AssetSummary) => void;
  previewUrls: Record<string, string>;
}

function AssetGroup({
  label,
  assets,
  onAssetSelected,
  previewUrls,
}: AssetGroupProps): React.ReactElement {
  const isAudio = assets[0]?.type === 'audio';

  return (
    <div style={groupStyles.section} data-testid={`asset-group-${label.toLowerCase()}`}>
      <div style={groupStyles.sectionLabel}>{label}</div>
      {isAudio ? (
        <div style={groupStyles.audioList}>
          {assets.map((asset) => (
            <AudioRowCard key={asset.id} asset={asset} onAssetSelected={onAssetSelected} />
          ))}
        </div>
      ) : (
        <div style={groupStyles.thumbGrid}>
          {assets.map((asset) => (
            <AssetThumbCard
              key={asset.id}
              asset={asset}
              onAssetSelected={onAssetSelected}
              previewUrl={
                asset.type === 'image' && asset.thumbnailUrl === null
                  ? (previewUrls[asset.id] ?? null)
                  : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recent body
// ---------------------------------------------------------------------------

export interface MediaGalleryRecentBodyProps {
  onAssetSelected: (asset: AssetSummary) => void;
  draftId: string | undefined;
  scope: 'draft' | 'all';
  /** Called when toggle button is clicked. */
  onScopeToggle: () => void;
}

/** Renders the content of the Recent tab panel including the scope toggle. */
export function MediaGalleryRecentBody({
  onAssetSelected,
  draftId,
  scope,
  onScopeToggle,
}: MediaGalleryRecentBodyProps): React.ReactElement {
  const { data, isLoading, isError } = useAssets({ type: 'all', draftId, scope });
  const items = data?.items ?? [];
  const videos = items.filter((a) => a.type === 'video');
  const images = items.filter((a) => a.type === 'image');
  const audios = items.filter((a) => a.type === 'audio');
  const imageStreamFileIds = React.useMemo(
    () => items
      .filter((asset) => asset.type === 'image' && asset.thumbnailUrl === null)
      .map((asset) => asset.id),
    [items],
  );
  const { urls: imageStreamUrls } = useBulkFileStreamUrls(imageStreamFileIds);

  if (isLoading) return <GallerySkeleton />;
  if (isError) return <GalleryError />;

  return (
    <>
      {items.length === 0 && <GalleryEmpty />}
      {videos.length > 0 && (
        <AssetGroup
          label="Videos"
          assets={videos}
          onAssetSelected={onAssetSelected}
          previewUrls={imageStreamUrls}
        />
      )}
      {images.length > 0 && (
        <AssetGroup
          label="Images"
          assets={images}
          onAssetSelected={onAssetSelected}
          previewUrls={imageStreamUrls}
        />
      )}
      {audios.length > 0 && (
        <AssetGroup
          label="Audio"
          assets={audios}
          onAssetSelected={onAssetSelected}
          previewUrls={imageStreamUrls}
        />
      )}

      {/* Scope toggle — sticky at bottom of the scroll container, only when draftId present */}
      {draftId && (
        <div style={scopeToggleContainerStyle}>
          <button
            data-testid="scope-toggle"
            aria-pressed={scope === 'all'}
            onClick={onScopeToggle}
            style={scopeToggleStyle}
          >
            {scope === 'draft' ? 'Show all' : 'Show only this draft'}
          </button>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const scopeToggleContainerStyle: React.CSSProperties = {
  position: 'sticky',
  bottom: 0,
  padding: '8px 16px',
  backgroundColor: '#16161F',
};

const scopeToggleStyle: React.CSSProperties = {
  width: '100%',
  height: 32,
  borderRadius: 4,
  border: '1px solid #252535',
  backgroundColor: 'transparent',
  color: '#8A8AA0',
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'Inter, sans-serif',
};
