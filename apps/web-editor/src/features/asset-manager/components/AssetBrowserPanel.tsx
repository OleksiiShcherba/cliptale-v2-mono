import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { getAssets } from '@/features/asset-manager/api';
import { useAssetUpload } from '@/features/asset-manager/hooks/useAssetUpload';
import { useAssetPolling } from '@/features/asset-manager/hooks/useAssetPolling';
import { useScopeToggle } from '@/features/asset-manager/hooks/useScopeToggle';
import { matchesTab } from '@/features/asset-manager/utils';
import type { Asset, AssetFilterTab } from '@/features/asset-manager/types';

import { AssetDetailPanel } from '@/shared/asset-detail/AssetDetailPanel';

import { AssetCard } from './AssetCard';
import { DeleteAssetDialog } from './DeleteAssetDialog';
import { ReplaceAssetDialog } from './ReplaceAssetDialog';
import { UploadDropzone } from './UploadDropzone';

/** Renders nothing; runs useAssetPolling for one asset and calls onSettled when done. */
function AssetPoller({ fileId, onSettled }: { fileId: string; onSettled: () => void }): null {
  useAssetPolling({ fileId, onReady: onSettled, onError: onSettled });
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
  /** When true, the type filter tabs (All/Video/Audio/Image) are hidden. */
  areFilterTabsHidden?: boolean;
}

/**
 * 320px left sidebar panel: type tabs, search bar, scrollable asset list,
 * scope toggle, and upload button.
 *
 * Scope toggle: defaults to `scope=project` (only files linked to this
 * project). When the project-scoped list is empty on first load the toggle
 * auto-switches to `scope=all`. The toggle is sticky at the bottom of the
 * scroll container and resets when the component unmounts/remounts.
 */
export function AssetBrowserPanel({
  projectId,
  areFilterTabsHidden = false,
}: AssetBrowserPanelProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState<AssetFilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isReplaceOpen, setIsReplaceOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const queryClient = useQueryClient();

  // Fetch project-scoped assets first so useScopeToggle can detect empty first load.
  // The queryKey ['assets', projectId, 'project'] is shared with useProjectAssets hook
  // so that useRemotionPlayer can read the same cache entry without a second fetch.
  const { data: projectData, isLoading, isError } = useQuery({
    queryKey: ['assets', projectId, 'project'],
    queryFn: () => getAssets(projectId, 'project'),
  });
  const projectAssets = projectData?.items ?? [];

  const { scope, toggleScope } = useScopeToggle({
    isSettled: !isLoading && !isError,
    isEmpty: projectAssets.length === 0,
  });

  // Fetch all-scoped when user toggled or auto-switched; cached via query key
  const { data: allData } = useQuery({
    queryKey: ['assets', projectId, 'all'],
    queryFn: () => getAssets(projectId, 'all'),
    enabled: scope === 'all',
  });
  const allAssets = allData?.items ?? [];

  const assets = scope === 'project' ? projectAssets : allAssets;

  const { entries, isUploading, uploadFiles, clearEntries } = useAssetUpload({
    projectId,
    onUploadComplete: () => {
      void queryClient.invalidateQueries({ queryKey: ['assets', projectId] });
    },
  });

  const filtered = assets.filter(
    (a: Asset) =>
      matchesTab(a, activeTab) &&
      a.filename.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const selectedAsset = assets.find((a: Asset) => a.id === selectedAssetId) ?? null;
  const handleDone = () => { clearEntries(); setIsUploadOpen(false); };

  return (
    <div style={{ display: 'flex', fontFamily: 'Inter, sans-serif', flex: 1, minHeight: 0 }}>
      <div style={{ width: 320, flexShrink: 0, height: '100%', backgroundColor: '#16161F', display: 'flex', flexDirection: 'column' }}>
        {!areFilterTabsHidden && (
          <div style={{ height: 40, backgroundColor: '#1E1E2E', display: 'flex', alignItems: 'center', padding: '0 4px', gap: 2, flexShrink: 0 }}>
            {TABS.map((tab) => (
              <button
                key={tab.value}
                aria-pressed={activeTab === tab.value}
                onClick={() => setActiveTab(tab.value)}
                style={{
                  flex: 1, height: 32, borderRadius: 4, border: 'none',
                  backgroundColor: activeTab === tab.value ? '#7C3AED' : 'transparent',
                  color: activeTab === tab.value ? '#F0F0FA' : '#8A8AA0',
                  fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        <div style={{ padding: '8px 12px 0', flexShrink: 0 }}>
          <input
            type="search" placeholder="Search assets…" aria-label="Search assets"
            value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '100%', height: 36, borderRadius: 4, border: '1px solid #252535', backgroundColor: 'transparent', color: '#F0F0FA', fontSize: 12, padding: '0 10px', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif', outline: 'none' }}
          />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {isLoading && <p style={{ fontSize: 12, color: '#8A8AA0', textAlign: 'center', marginTop: 40 }}>Loading assets…</p>}
          {isError && <p role="alert" style={{ fontSize: 12, color: '#EF4444', textAlign: 'center', marginTop: 40 }}>Could not load assets</p>}
          {!isLoading && !isError && filtered.length === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: 48, gap: 8 }}>
              <span style={{ fontSize: 28, color: '#8A8AA0' }} aria-hidden>📁</span>
              <p style={{ fontSize: 12, color: '#8A8AA0', margin: 0, textAlign: 'center' }}>
                {searchQuery ? 'No matching assets' : 'No assets yet — upload to get started'}
              </p>
            </div>
          )}
          {filtered.map((asset: Asset) => (
            <AssetCard key={asset.id} asset={asset} isSelected={selectedAssetId === asset.id} onSelect={setSelectedAssetId} />
          ))}
        </div>

        {/* Scope toggle — sticky at bottom of the scroll container */}
        <div style={{ padding: '8px 12px 0', flexShrink: 0 }}>
          <button
            data-testid="scope-toggle"
            aria-pressed={scope === 'all'}
            onClick={toggleScope}
            style={{ width: '100%', height: 32, borderRadius: 4, border: '1px solid #252535', backgroundColor: 'transparent', color: '#8A8AA0', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
          >
            {scope === 'project' ? 'Show all' : 'Show only this project'}
          </button>
        </div>

        {/* Upload button — pinned to bottom */}
        <div style={{ padding: '8px 12px', flexShrink: 0 }}>
          <button
            onClick={() => setIsUploadOpen(true)}
            style={{ width: '100%', height: 40, borderRadius: 8, backgroundColor: '#7C3AED', border: 'none', color: '#F0F0FA', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
          >
            + Upload Assets
          </button>
        </div>
      </div>

      {selectedAsset && (
        <AssetDetailPanel
          asset={selectedAsset}
          context={{ kind: 'project', projectId }}
          onDelete={() => setIsDeleteOpen(true)}
          onClose={() => setSelectedAssetId(null)}
          onReplace={() => setIsReplaceOpen(true)}
        />
      )}

      {isReplaceOpen && selectedAsset && (
        <ReplaceAssetDialog
          asset={selectedAsset} libraryAssets={assets} projectId={projectId}
          onClose={() => setIsReplaceOpen(false)}
          onReplaced={() => { setIsReplaceOpen(false); void queryClient.invalidateQueries({ queryKey: ['assets', projectId] }); }}
        />
      )}

      {isDeleteOpen && selectedAsset && (
        <DeleteAssetDialog
          asset={selectedAsset} projectId={projectId}
          onClose={() => setIsDeleteOpen(false)}
          onDeleted={() => { setIsDeleteOpen(false); setSelectedAssetId(null); }}
        />
      )}

      {isUploadOpen && (
        <UploadDropzone entries={entries} isUploading={isUploading} onUploadFiles={uploadFiles} onClose={() => setIsUploadOpen(false)} onDone={handleDone} />
      )}

      {assets
        .filter((a: Asset) => a.status === 'processing' || a.status === 'pending')
        .map((a: Asset) => (
          <AssetPoller key={a.id} fileId={a.id} onSettled={() => void queryClient.invalidateQueries({ queryKey: ['assets', projectId] })} />
        ))}
    </div>
  );
}
