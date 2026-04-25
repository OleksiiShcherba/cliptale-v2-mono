import React from 'react';

import { panelStyles } from './mediaGalleryStyles';

export type GalleryTab = 'recent' | 'folders' | 'ai';

export interface MediaGalleryTabsProps {
  activeTab: GalleryTab;
  onTabChange: (tab: GalleryTab) => void;
}

/**
 * Tab row for MediaGalleryPanel.
 * Renders "Recent" and "Folders" tabs with ARIA tablist semantics.
 */
export function MediaGalleryTabs({
  activeTab,
  onTabChange,
}: MediaGalleryTabsProps): React.ReactElement {
  return (
    <div role="tablist" aria-label="Gallery view" style={panelStyles.tabList}>
      <button
        role="tab"
        id="tab-recent"
        aria-selected={activeTab === 'recent'}
        aria-controls="tabpanel-recent"
        type="button"
        style={panelStyles.tabButton(activeTab === 'recent')}
        onClick={() => onTabChange('recent')}
      >
        Recent
      </button>
      <button
        role="tab"
        id="tab-folders"
        aria-selected={activeTab === 'folders'}
        aria-controls="tabpanel-folders"
        type="button"
        style={panelStyles.tabButton(activeTab === 'folders')}
        onClick={() => onTabChange('folders')}
      >
        Folders
      </button>
      <button
        role="tab"
        id="tab-ai"
        aria-selected={activeTab === 'ai'}
        aria-controls="tabpanel-ai"
        type="button"
        style={panelStyles.tabButton(activeTab === 'ai')}
        onClick={() => onTabChange('ai')}
      >
        AI
      </button>
    </div>
  );
}
