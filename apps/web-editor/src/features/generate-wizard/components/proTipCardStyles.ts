/**
 * Style map for the ProTipCard component.
 *
 * Follows the "inline token constants → inline styles" convention used
 * throughout the generate-wizard feature. All values come from design-guide.md §3.
 *
 * Tokens shared with mediaGalleryStyles.ts are imported from there to avoid
 * duplication.
 */

import React from 'react';

import { SURFACE_ELEVATED, BORDER, TEXT_PRIMARY, TEXT_SECONDARY } from './mediaGalleryStyles';

// Re-export shared tokens so consumers of this file don't need to import both.
export { SURFACE_ELEVATED, BORDER, TEXT_PRIMARY, TEXT_SECONDARY };

// ---------------------------------------------------------------------------
// ProTipCard-specific tokens
// ---------------------------------------------------------------------------

/**
 * Border colour: primary at 30% opacity (`rgba(124, 58, 237, 0.3)`).
 * Spec: EPIC 2 ticket — "primary/30 border".
 */
export const PRIMARY_BORDER = 'rgba(124, 58, 237, 0.3)';

/** Border radius — design-guide `radius-md` = 8 px (ROUND_EIGHT). */
export const RADIUS_MD = '8px';

// ---------------------------------------------------------------------------
// z-index layering
// ---------------------------------------------------------------------------

/**
 * Above the gallery panel (which sits at the default stacking context) but
 * below any modal (modals use z-index 1000 in enhancePreviewModalStyles.ts).
 */
export const Z_INDEX_PRO_TIP = 100;

// ---------------------------------------------------------------------------
// Card container
// ---------------------------------------------------------------------------

export const cardStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: '24px',
  right: '24px',
  zIndex: Z_INDEX_PRO_TIP,
  width: '280px',
  background: SURFACE_ELEVATED,
  border: `1px solid ${PRIMARY_BORDER}`,
  borderRadius: RADIUS_MD,
  padding: '16px',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  fontFamily: 'Inter, sans-serif',
  boxShadow: '0 4px 24px rgba(0, 0, 0, 0.4)',
};

// ---------------------------------------------------------------------------
// Header row (label + close button)
// ---------------------------------------------------------------------------

export const headerRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
};

export const labelStyle: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 500,
  lineHeight: '16px',
  color: TEXT_SECONDARY,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
};

export const closeButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: '4px',
  color: TEXT_SECONDARY,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '4px',
  flexShrink: 0,
};

// ---------------------------------------------------------------------------
// Body text
// ---------------------------------------------------------------------------

export const bodyTextStyle: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 400,
  lineHeight: '20px',
  color: TEXT_PRIMARY,
  margin: 0,
};
