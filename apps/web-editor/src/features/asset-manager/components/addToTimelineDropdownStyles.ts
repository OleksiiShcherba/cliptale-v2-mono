import type React from 'react';

// Design tokens
const PRIMARY = '#7C3AED';
const PRIMARY_DARK = '#5B21B6';
const PRIMARY_LIGHT = '#4C1D95';
const SURFACE_ELEVATED = '#1E1E2E';
const BORDER = '#252535';
const TEXT_PRIMARY = '#F0F0FA';
const TEXT_SECONDARY = '#8A8AA0';

/** Wrapper that establishes the positioning context for the dropdown. */
export const wrapperStyle: React.CSSProperties = {
  position: 'relative',
  width: 248,
  flexShrink: 0,
};

/** The main "Add to Timeline ▾" trigger button (enabled state). */
export const triggerButtonStyle: React.CSSProperties = {
  width: '100%',
  height: 36,
  borderRadius: 8,
  border: 'none',
  backgroundColor: PRIMARY,
  color: TEXT_PRIMARY,
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'Inter, sans-serif',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
};

/** The trigger button in disabled state. */
export const triggerButtonDisabledStyle: React.CSSProperties = {
  ...triggerButtonStyle,
  backgroundColor: PRIMARY_LIGHT,
  color: TEXT_SECONDARY,
  cursor: 'not-allowed',
};

/** The trigger button in hover state. */
export const triggerButtonHoverStyle: React.CSSProperties = {
  ...triggerButtonStyle,
  backgroundColor: PRIMARY_DARK,
};

/**
 * Floating dropdown panel — absolutely positioned below the trigger button.
 * Uses `surface-elevated` background with a border for definition.
 */
export const dropdownPanelStyle: React.CSSProperties = {
  position: 'absolute',
  top: 40,
  left: 0,
  right: 0,
  backgroundColor: SURFACE_ELEVATED,
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  overflow: 'hidden',
  zIndex: 50,
  boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
};

/** Section label above a group of items (e.g. "EXISTING TRACKS"). */
export const sectionLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  color: TEXT_SECONDARY,
  fontFamily: 'Inter, sans-serif',
  letterSpacing: '0.05em',
  padding: '8px 12px 4px',
  textTransform: 'uppercase',
};

/** Horizontal divider between sections. */
export const dividerStyle: React.CSSProperties = {
  height: 1,
  backgroundColor: BORDER,
  margin: '4px 0',
};

/** A single dropdown menu item (default). */
export const itemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '8px 12px',
  fontSize: 14,
  fontFamily: 'Inter, sans-serif',
  color: TEXT_PRIMARY,
  cursor: 'pointer',
  background: 'transparent',
  border: 'none',
  width: '100%',
  textAlign: 'left',
  lineHeight: '20px',
};

/** A single dropdown menu item in hover state. */
export const itemHoverStyle: React.CSSProperties = {
  ...itemStyle,
  backgroundColor: `${PRIMARY}20`,
  color: TEXT_PRIMARY,
};
