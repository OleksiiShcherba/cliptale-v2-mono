/**
 * StoryboardAssetPanel — asset browser panel for the Storyboard page.
 *
 * Wraps AssetBrowserPanel with `hideTranscribe={true}` (A3: TranscribeButton
 * must not appear on the Storyboard page) and the draftId scoped as projectId.
 * The scope toggle auto-switches to `all` when no draft-scoped assets exist —
 * the expected state for new drafts.
 *
 * When an asset card is clicked, AssetBrowserPanel shows AssetDetailPanel
 * with InlineRenameField — satisfying A2 (asset rename on Storyboard).
 */

import React from 'react';

import { AssetBrowserPanel } from '@/features/asset-manager/components/AssetBrowserPanel';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface StoryboardAssetPanelProps {
  /** The generation draft id scoped as the asset browser's projectId. */
  draftId: string;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const SURFACE_ALT = '#16161F';
const BORDER_COLOR = '#252535';

const rootStyle: React.CSSProperties = {
  width: 320,
  flexShrink: 0,
  height: '100%',
  backgroundColor: SURFACE_ALT,
  borderRight: `1px solid ${BORDER_COLOR}`,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Left panel for the Storyboard page that provides asset browsing and rename.
 *
 * - `hideTranscribe={true}` suppresses TranscribeButton (A3).
 * - Clicking an asset card opens AssetDetailPanel with InlineRenameField (A2).
 */
export function StoryboardAssetPanel({
  draftId,
}: StoryboardAssetPanelProps): React.ReactElement {
  return (
    <div style={rootStyle} data-testid="storyboard-asset-panel">
      <AssetBrowserPanel
        projectId={draftId}
        hideTranscribe
      />
    </div>
  );
}
