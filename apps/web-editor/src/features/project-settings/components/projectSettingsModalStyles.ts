import type React from 'react';

// Design tokens
const SURFACE_ELEVATED = '#1E1E2E';
const BORDER = '#252535';
const TEXT_PRIMARY = '#F0F0FA';
const TEXT_SECONDARY = '#8A8AA0';
const PRIMARY = '#7C3AED';
const PRIMARY_LIGHT = '#4C1D95';

/** Semi-transparent overlay that covers the full viewport. */
export const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 100,
};

/** Centered modal panel — 480×auto. */
export const panelStyle: React.CSSProperties = {
  width: 480,
  maxHeight: '80vh',
  overflowY: 'auto',
  background: SURFACE_ELEVATED, // surface-elevated token: cards, modals, inspector panels
  border: `1px solid ${BORDER}`,
  borderRadius: 16, // radius-lg token
  display: 'flex',
  flexDirection: 'column',
  fontFamily: 'Inter, sans-serif',
};

/** Header row: title + close button. */
export const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '16px 20px',
  borderBottom: `1px solid ${BORDER}`,
  flexShrink: 0,
};

/** Modal title. */
export const titleStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  color: TEXT_PRIMARY,
};

/** Close (✕) button. */
export const closeButtonStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: TEXT_SECONDARY,
  cursor: 'pointer',
  fontSize: 16,
  padding: 4,
  lineHeight: 1,
  borderRadius: 4,
};

/** Scrollable body below the header. */
export const bodyStyle: React.CSSProperties = {
  padding: '20px',
  display: 'flex',
  flexDirection: 'column',
  gap: 24, // space-6 token (4px grid)
};

/** Section container (label + preset grid). */
export const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

/** Section label (e.g. "FRAME RATE"). */
export const sectionLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  color: TEXT_SECONDARY,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
};

/** Grid of preset buttons. */
export const presetGridStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
};

/** A single preset button in its default (unselected) state. */
export const presetButtonStyle: React.CSSProperties = {
  background: SURFACE_ELEVATED,
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  color: TEXT_PRIMARY,
  fontSize: 14, // body token
  fontFamily: 'Inter, sans-serif',
  padding: '8px 12px',
  cursor: 'pointer',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 2,
  minWidth: 88,
};

/** A preset button in its selected (active) state. */
export const presetButtonActiveStyle: React.CSSProperties = {
  ...presetButtonStyle,
  background: PRIMARY_LIGHT,
  border: `1px solid ${PRIMARY}`,
};

/** Small subtitle line inside a resolution preset button. */
export const presetSubtitleStyle: React.CSSProperties = {
  fontSize: 11,
  color: TEXT_SECONDARY,
  fontFamily: 'Inter, sans-serif',
};
