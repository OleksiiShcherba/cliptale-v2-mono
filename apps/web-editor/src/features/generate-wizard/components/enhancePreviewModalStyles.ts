/**
 * Style maps for the EnhancePreviewModal component.
 *
 * Follows the "inline token constants → inline styles" convention used throughout
 * the generate-wizard feature. All values come from design-guide.md §3.
 *
 * Tokens that are already defined in mediaGalleryStyles.ts are imported from
 * there to avoid duplication.
 */

import React from 'react';

import { SURFACE_ELEVATED, BORDER, TEXT_PRIMARY, TEXT_SECONDARY } from './mediaGalleryStyles';

// Re-export tokens used by both the modal component and its tests.
export { SURFACE_ELEVATED, BORDER, TEXT_PRIMARY, TEXT_SECONDARY };

// ---------------------------------------------------------------------------
// Additional tokens needed by this modal only
// ---------------------------------------------------------------------------

export const PRIMARY = '#7C3AED';
export const ERROR_COLOR = '#EF4444';
export const RADIUS_MD = '8px';

// ---------------------------------------------------------------------------
// Backdrop (full-screen scrim)
// ---------------------------------------------------------------------------

export const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

// ---------------------------------------------------------------------------
// Dialog shell
// ---------------------------------------------------------------------------

export const dialogStyle: React.CSSProperties = {
  position: 'relative',
  width: '680px',
  maxWidth: '92vw',
  maxHeight: '85vh',
  background: SURFACE_ELEVATED,
  border: `1px solid ${BORDER}`,
  borderRadius: RADIUS_MD,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  fontFamily: 'Inter, sans-serif',
};

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

export const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '16px 24px',
  borderBottom: `1px solid ${BORDER}`,
  flexShrink: 0,
};

export const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '20px',
  fontWeight: 600,
  lineHeight: '28px',
  color: TEXT_PRIMARY,
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
};

// ---------------------------------------------------------------------------
// Diff panels area (side-by-side on wide, stacked on narrow)
// ---------------------------------------------------------------------------

export const panelsWrapperStyle: React.CSSProperties = {
  display: 'flex',
  flex: 1,
  overflow: 'hidden',
  gap: '0',
};

export const panelStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

export const panelDividerStyle: React.CSSProperties = {
  width: '1px',
  background: BORDER,
  flexShrink: 0,
};

export const panelLabelStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 500,
  lineHeight: '16px',
  color: TEXT_SECONDARY,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  padding: '10px 16px 6px',
  flexShrink: 0,
  borderBottom: `1px solid ${BORDER}`,
};

export const panelBodyStyle: React.CSSProperties = {
  flex: 1,
  overflow: 'auto',
  padding: '12px 16px',
  background: SURFACE_ELEVATED,
  fontSize: '14px',
  fontWeight: 400,
  lineHeight: '20px',
  color: TEXT_PRIMARY,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

// ---------------------------------------------------------------------------
// Error state (shown when status === 'failed')
// ---------------------------------------------------------------------------

export const errorBodyStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  padding: '24px',
};

export const errorTextStyle: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 400,
  lineHeight: '20px',
  color: ERROR_COLOR,
  textAlign: 'center',
};

// ---------------------------------------------------------------------------
// Footer actions
// ---------------------------------------------------------------------------

export const footerStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  justifyContent: 'flex-end',
  padding: '12px 24px',
  borderTop: `1px solid ${BORDER}`,
  flexShrink: 0,
};

// Shared button base
const buttonBase: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 500,
  fontFamily: 'Inter, sans-serif',
  lineHeight: '20px',
  padding: '8px 20px',
  borderRadius: '6px',
  cursor: 'pointer',
  border: 'none',
};

export const discardButtonStyle: React.CSSProperties = {
  ...buttonBase,
  background: 'transparent',
  border: `1px solid ${BORDER}`,
  color: TEXT_PRIMARY,
};

export const acceptButtonStyle: React.CSSProperties = {
  ...buttonBase,
  background: PRIMARY,
  color: '#FFFFFF',
  fontWeight: 600,
};
