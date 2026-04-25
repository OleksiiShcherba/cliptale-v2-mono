/**
 * Purely presentational sub-views for MediaGalleryPanel.
 *
 * Extracted to keep MediaGalleryPanel.tsx under the §9.7 300-line cap.
 * These components have no side effects — they only render markup.
 */
import React from 'react';

import { stateStyles } from './mediaGalleryStyles';

/** Three grey skeleton cards shown while the asset query is loading. */
export function GallerySkeleton(): React.ReactElement {
  return (
    <div style={stateStyles.skeletonGrid} data-testid="gallery-skeleton">
      <div style={stateStyles.skeletonCard} />
      <div style={stateStyles.skeletonCard} />
      <div style={stateStyles.skeletonCard} />
    </div>
  );
}

/** Error state shown when the asset query fails. */
export function GalleryError(): React.ReactElement {
  return (
    <div style={stateStyles.centerText} role="alert">
      Could not load assets
    </div>
  );
}

/** Empty state shown when the asset list resolves to zero items. */
export function GalleryEmpty(): React.ReactElement {
  return (
    <div style={stateStyles.centerText}>
      No assets yet — click Upload to add media
    </div>
  );
}

/** Placeholder shown in the Folders tab until folder support is implemented. */
export function FoldersPlaceholder(): React.ReactElement {
  return (
    <div style={stateStyles.foldersPlaceholder} data-testid="folders-placeholder">
      Folders coming soon
    </div>
  );
}
