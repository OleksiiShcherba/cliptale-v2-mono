/**
 * State-view styles for the MediaGalleryPanel family (skeleton, error, empty, folders).
 * Split from `mediaGalleryStyles.ts` to stay within the 300-line §9.7 cap.
 */

import React from 'react';

// Design tokens (matching mediaGalleryStyles.ts)
const SURFACE_ELEVATED = '#1E1E2E';
const TEXT_SECONDARY = '#8A8AA0';

export const stateStyles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  } as React.CSSProperties,

  skeletonGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
    gap: '8px',
  } as React.CSSProperties,

  skeletonCard: {
    height: '80px',
    background: SURFACE_ELEVATED,
    borderRadius: '4px',
    animation: 'pulse 1.5s ease-in-out infinite',
  } as React.CSSProperties,

  centerText: {
    textAlign: 'center' as const,
    padding: '32px 16px',
    color: TEXT_SECONDARY,
    fontSize: '14px',
    lineHeight: '20px',
  } as React.CSSProperties,

  foldersPlaceholder: {
    textAlign: 'center' as const,
    padding: '48px 16px',
    color: TEXT_SECONDARY,
    fontSize: '14px',
    lineHeight: '20px',
  } as React.CSSProperties,
} as const;
