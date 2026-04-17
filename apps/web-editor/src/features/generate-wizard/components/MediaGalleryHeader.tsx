import React from 'react';

import { panelStyles } from './mediaGalleryStyles';

/** Folder SVG icon — inline, no external dependency. */
function FolderIcon(): React.ReactElement {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M2 5a2 2 0 0 1 2-2h3.17a2 2 0 0 1 1.42.59l.82.82A2 2 0 0 0 10.83 5H16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5Z"
        fill="currentColor"
        fillOpacity="0.7"
      />
    </svg>
  );
}

/** Header row of the MediaGalleryPanel: folder icon + "Media Gallery" heading. */
export function MediaGalleryHeader(): React.ReactElement {
  return (
    <div style={panelStyles.header}>
      <span style={panelStyles.headerIcon}>
        <FolderIcon />
      </span>
      <h2 style={panelStyles.headerTitle} id="media-gallery-heading">
        Media Gallery
      </h2>
    </div>
  );
}
