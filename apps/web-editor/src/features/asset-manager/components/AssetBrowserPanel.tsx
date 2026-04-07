import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { getAssets } from '@/features/asset-manager/api';
import { useAssetUpload } from '@/features/asset-manager/hooks/useAssetUpload';
import { useAssetPolling } from '@/features/asset-manager/hooks/useAssetPolling';
import { matchesTab } from '@/features/asset-manager/utils';
import type { Asset, AssetFilterTab } from '@/features/asset-manager/types';

import { AssetCard } from './AssetCard';
import { AssetDetailPanel } from './AssetDetailPanel';
import { DeleteAssetDialog } from './DeleteAssetDialog';
import { ReplaceAssetDialog } from './ReplaceAssetDialog';
import { UploadDropzone } from './UploadDropzone';

/** Renders nothing; runs useAssetPolling for one asset and calls onSettled when done. */
function AssetPoller({
  assetId,
  onSettled,
}: {
  assetId: string;
  onSettled: () => void;
}): null {
  useAssetPolling({ assetId, onReady: onSettled, onError: onSettled });
  return null;
}

const TABS: { label: string; value: AssetFilterTab }[] = [
  { label: 'All', value: 'all' },
  { label: 'Video', value: 'video' },
  { label: 'Audio', value: 'audio' },
  { label: 'Image', value: 'image' },
];


export interface AssetBrowserPanelProps {
  projectId: string;
}

/**
 * 320px left sidebar panel: type tabs, search bar, scrollable asset list, and upload button.
 * Shows AssetDetailPanel (280px) to the right when an asset is selected.
 * Upload button opens the UploadDropzone modal.
 */
export function AssetBrowserPanel({ projectId }: AssetBrowserPanelProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState<AssetFilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isReplaceOpen, setIsReplaceOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const queryClient = useQueryClient();

  const { data: assets = [], isLoading, isError } = useQuery({
    queryKey: ['assets', projectId],
    queryFn: () => getAssets(projectId),
  });

  const { entries, isUploading, uploadFiles, clearEntries } = useAssetUpload({
    projectId,
    // Invalidate the asset list when a file finishes so the list refreshes automatically
    onUploadComplete: () => {
      void queryClient.invalidateQueries({ queryKey: ['assets', projectId] });
    },
  });

  const filtered = assets.filter(
    (a) =>
      matchesTab(a, activeTab) &&
      a.filename.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const selectedAsset = assets.find((a) => a.id === selectedAssetId) ?? null;

  const handleDone = () => {
    clearEntries();
    setIsUploadOpen(false);
  };

  return (
    <div style={{ display: 'flex', fontFamily: 'Inter, sans-serif', flex: 1, minHeight: 0 }}>
      {/* Browser panel */}
      <div
        style={{
          width: 320,
          flexShrink: 0,
          height: '100%',
          backgroundColor: '#16161F',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Type tabs */}
        <div
          style={{
            height: 40,
            backgroundColor: '#1E1E2E',
            display: 'flex',
            alignItems: 'center',
            padding: '0 4px',
            gap: 2,
            flexShrink: 0,
          }}
        >
          {TABS.map((tab) => (
            <button
              key={tab.value}
              aria-pressed={activeTab === tab.value}
              onClick={() => setActiveTab(tab.value)}
              style={{
                flex: 1,
                height: 32,
                borderRadius: 4,
                border: 'none',
                backgroundColor: activeTab === tab.value ? '#7C3AED' : 'transparent',
                color: activeTab === tab.value ? '#F0F0FA' : '#8A8AA0',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'Inter, sans-serif',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search bar */}
        <div style={{ padding: '8px 12px 0', flexShrink: 0 }}>
          <input
            type="search"
            placeholder="Search assets…"
            aria-label="Search assets"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              height: 36,
              borderRadius: 4,
              border: '1px solid #252535',
              backgroundColor: 'transparent',
              color: '#F0F0FA',
              fontSize: 12,
              padding: '0 10px',
              boxSizing: 'border-box',
              fontFamily: 'Inter, sans-serif',
              outline: 'none',
            }}
          />
        </div>

        {/* Asset list */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '12px 12px 0',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {isLoading && (
            <p style={{ fontSize: 12, color: '#8A8AA0', textAlign: 'center', marginTop: 40 }}>
              Loading assets…
            </p>
          )}
          {isError && (
            <p role="alert" style={{ fontSize: 12, color: '#EF4444', textAlign: 'center', marginTop: 40 }}>
              Could not load assets
            </p>
          )}
          {!isLoading && !isError && filtered.length === 0 && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                paddingTop: 48,
                gap: 8,
              }}
            >
              <span style={{ fontSize: 28, color: '#8A8AA0' }} aria-hidden>📁</span>
              <p style={{ fontSize: 12, color: '#8A8AA0', margin: 0, textAlign: 'center' }}>
                {searchQuery ? 'No matching assets' : 'No assets yet — upload to get started'}
              </p>
            </div>
          )}
          {filtered.map((asset) => (
            <AssetCard
              key={asset.id}
              asset={asset}
              isSelected={selectedAssetId === asset.id}
              onSelect={setSelectedAssetId}
            />
          ))}
        </div>

        {/* Upload button — pinned to bottom */}
        <div style={{ padding: '8px 12px', flexShrink: 0 }}>
          <button
            onClick={() => setIsUploadOpen(true)}
            style={{
              width: '100%',
              height: 40,
              borderRadius: 8,
              backgroundColor: '#7C3AED',
              border: 'none',
              color: '#F0F0FA',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'Inter, sans-serif',
            }}
          >
            + Upload Assets
          </button>
        </div>
      </div>

      {/* Detail panel — only when an asset is selected */}
      {selectedAsset && (
        <AssetDetailPanel
          asset={selectedAsset}
          projectId={projectId}
          onDelete={() => setIsDeleteOpen(true)}
          onClose={() => setSelectedAssetId(null)}
          onReplace={() => setIsReplaceOpen(true)}
        />
      )}

      {/* Replace file dialog */}
      {isReplaceOpen && selectedAsset && (
        <ReplaceAssetDialog
          asset={selectedAsset}
          libraryAssets={assets}
          projectId={projectId}
          onClose={() => setIsReplaceOpen(false)}
          onReplaced={() => {
            setIsReplaceOpen(false);
            void queryClient.invalidateQueries({ queryKey: ['assets', projectId] });
          }}
        />
      )}

      {/* Delete asset confirmation dialog */}
      {isDeleteOpen && selectedAsset && (
        <DeleteAssetDialog
          asset={selectedAsset}
          onClose={() => setIsDeleteOpen(false)}
          onDeleted={() => {
            setIsDeleteOpen(false);
            setSelectedAssetId(null);
          }}
        />
      )}

      {/* Upload modal */}
      {isUploadOpen && (
        <UploadDropzone
          entries={entries}
          isUploading={isUploading}
          onUploadFiles={uploadFiles}
          onClose={() => setIsUploadOpen(false)}
          onDone={handleDone}
        />
      )}

      {/* Background pollers — one per processing asset; render nothing, fire invalidation when settled */}
      {assets
        .filter((a) => a.status === 'processing' || a.status === 'pending')
        .map((a) => (
          <AssetPoller
            key={a.id}
            assetId={a.id}
            onSettled={() => void queryClient.invalidateQueries({ queryKey: ['assets', projectId] })}
          />
        ))}
    </div>
  );
}
