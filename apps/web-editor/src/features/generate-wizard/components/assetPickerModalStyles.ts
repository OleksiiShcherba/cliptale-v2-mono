/**
 * Style maps for the AssetPickerModal component.
 *
 * Follows the "inline token constants → inline styles" convention used throughout
 * the generate-wizard feature (see GenerateWizardPage.tsx, PromptEditor.tsx).
 * All values come from design-guide.md §3.
 */

import React from 'react';

import { SURFACE_ELEVATED, BORDER, TEXT_PRIMARY, TEXT_SECONDARY } from './mediaGalleryStyles';

// Re-export tokens needed by the modal for convenience
export { SURFACE_ELEVATED, BORDER, TEXT_PRIMARY, TEXT_SECONDARY };

// ---------------------------------------------------------------------------
// Backdrop
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
  width: '520px',
  height: '580px',
  background: SURFACE_ELEVATED,
  borderRadius: '8px',
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
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  padding: '16px 16px 12px',
  flexShrink: 0,
  borderBottom: `1px solid ${BORDER}`,
};

export const headerTextStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
};

export const titleStyle: React.CSSProperties = {
  fontSize: '20px',
  fontWeight: 600,
  lineHeight: '28px',
  color: TEXT_PRIMARY,
  margin: 0,
};

export const subtitleStyle: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 400,
  lineHeight: '16px',
  color: TEXT_SECONDARY,
  margin: 0,
};

export const closeButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: '4px',
  color: TEXT_SECONDARY,
  fontSize: '20px',
  lineHeight: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '4px',
  flexShrink: 0,
};

// ---------------------------------------------------------------------------
// Body (scrollable content area)
// ---------------------------------------------------------------------------

export const bodyStyle: React.CSSProperties = {
  flex: 1,
  overflow: 'auto',
  padding: '16px 16px',
};

// ---------------------------------------------------------------------------
// Grid / list layouts
// ---------------------------------------------------------------------------

export const thumbGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
  gap: '8px',
};

export const audioListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
};

// ---------------------------------------------------------------------------
// Upload affordance (opt-in via uploadTarget prop)
// ---------------------------------------------------------------------------

export const uploadButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '4px 8px',
  marginBottom: '8px',
  background: 'none',
  border: `1px solid ${BORDER}`,
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 500,
  lineHeight: '16px',
  color: TEXT_PRIMARY,
  fontFamily: 'Inter, sans-serif',
  transition: 'opacity 0.15s',
};

export const uploadProgressStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '4px 8px',
  marginBottom: '8px',
  fontSize: '12px',
  fontWeight: 500,
  lineHeight: '16px',
  color: TEXT_SECONDARY,
  fontFamily: 'Inter, sans-serif',
};
