import React from 'react';

import { AssetDetailPanel } from '@/shared/asset-detail/AssetDetailPanel';
import type { Asset } from '@/features/asset-manager/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface WizardAssetDetailSlotProps {
  /** Full asset record (undefined while loading). */
  asset: Asset | undefined;
  /** True while `useWizardAsset` is fetching the full record. */
  isLoading: boolean;
  /** Current generation draft id, used for the `draft` context. */
  draftId: string | null;
  /** Called when the user clicks the panel's close button. */
  onClose: () => void;
  /** Called when the user clicks "Add to Prompt" in the panel. */
  onAddToPrompt: (asset: Asset) => void;
  /** Called when the user clicks "Delete Asset" in the panel. */
  onDelete: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Right-column slot that renders `AssetDetailPanel` in the generate wizard.
 *
 * Displays a loading indicator while the full `Asset` record is being fetched
 * (gallery only holds `AssetSummary`). Once ready, renders `AssetDetailPanel`
 * with `context.kind === 'draft'` so the "Add to Prompt" button is shown.
 */
export function WizardAssetDetailSlot({
  asset,
  isLoading,
  draftId,
  onClose,
  onAddToPrompt,
  onDelete,
}: WizardAssetDetailSlotProps): React.ReactElement {
  if (isLoading || !asset) {
    return (
      <div style={loadingSlotStyle} aria-busy="true" aria-label="Loading asset details">
        Loading…
      </div>
    );
  }

  return (
    <AssetDetailPanel
      asset={asset}
      context={{ kind: 'draft', draftId: draftId ?? '' }}
      onClose={onClose}
      onAddToPrompt={onAddToPrompt}
      onDelete={onDelete}
    />
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const loadingSlotStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  color: '#8A8AA0',
  fontSize: 14,
  fontFamily: 'Inter, sans-serif',
};
