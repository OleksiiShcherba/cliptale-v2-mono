/**
 * Inline style tokens for StoryboardHistoryPanel.
 *
 * Design-guide §3: dark theme, Inter font, 4px grid, radius-md = 8px.
 * No CSS custom properties — hex constants only.
 */
import type React from 'react';

// ── Design tokens ──────────────────────────────────────────────────────────────

export const SURFACE_ALT = '#16161F';
export const SURFACE_ELEVATED = '#1E1E2E';
export const BORDER = '#252535';
export const TEXT_PRIMARY = '#F0F0FA';
export const TEXT_SECONDARY = '#8A8AA0';
export const PRIMARY = '#7C3AED';
export const ERROR = '#EF4444';

// ── Panel shell ────────────────────────────────────────────────────────────────

export const panelStyle: React.CSSProperties = {
  width: '320px',
  flexShrink: 0,
  background: SURFACE_ALT,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  borderLeft: `1px solid ${BORDER}`,
  fontFamily: 'Inter, sans-serif',
};

// ── Panel header ───────────────────────────────────────────────────────────────

export const headerStyle: React.CSSProperties = {
  height: '48px',
  flexShrink: 0,
  background: SURFACE_ELEVATED,
  borderBottom: `1px solid ${BORDER}`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingLeft: '16px',
  paddingRight: '12px',
};

export const headingStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '16px',
  fontWeight: 600,
  color: TEXT_PRIMARY,
  lineHeight: '24px',
};

export const closeButtonStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: TEXT_SECONDARY,
  fontSize: '20px',
  lineHeight: '20px',
  cursor: 'pointer',
  padding: '4px 8px',
  borderRadius: '4px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

// ── Scroll area ────────────────────────────────────────────────────────────────

export const scrollAreaStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
};

// ── Status messages ────────────────────────────────────────────────────────────

export const statusTextStyle: React.CSSProperties = {
  margin: 0,
  padding: '16px',
  fontSize: '14px',
  color: TEXT_SECONDARY,
  textAlign: 'center',
};

export const errorTextStyle: React.CSSProperties = {
  margin: 0,
  padding: '16px',
  fontSize: '14px',
  color: ERROR,
  textAlign: 'center',
};

// ── Entry row ──────────────────────────────────────────────────────────────────

export const entryRowStyle: React.CSSProperties = {
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '12px',
  borderBottom: `1px solid ${BORDER}`,
  background: SURFACE_ELEVATED,
};

export const entryMetaStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  overflow: 'hidden',
};

export const timestampStyle: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 400,
  color: TEXT_SECONDARY,
  lineHeight: '16px',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  cursor: 'help',
};

// ── Restore button ─────────────────────────────────────────────────────────────

export const restoreButtonStyle: React.CSSProperties = {
  flexShrink: 0,
  background: PRIMARY,
  border: 'none',
  borderRadius: '4px',
  color: TEXT_PRIMARY,
  fontSize: '12px',
  fontWeight: 600,
  fontFamily: 'Inter, sans-serif',
  padding: '8px 12px',
  cursor: 'pointer',
  lineHeight: '16px',
  height: '28px',
  display: 'flex',
  alignItems: 'center',
};
