/**
 * Inline style tokens for LibraryPanel and LibraryPanel.templateCard.
 *
 * Design-guide §3: dark theme, Inter font, 4px grid, radius-md = 8px.
 * No CSS custom properties — hex constants only.
 */
import type React from 'react';

// ── Design tokens ──────────────────────────────────────────────────────────────

export const SURFACE = '#0D0D14';
export const SURFACE_ALT = '#16161F';
export const SURFACE_ELEVATED = '#1E1E2E';
export const SURFACE_CARD = '#23233A';
export const BORDER = '#252535';
export const TEXT_PRIMARY = '#F0F0FA';
export const TEXT_SECONDARY = '#8A8AA0';
export const TEXT_MUTED = '#5A5A70';
export const PRIMARY = '#7C3AED';
export const PRIMARY_DARK = '#5B21B6';
export const PRIMARY_LIGHT = '#4C1D95';
export const DANGER = '#EF4444';
export const DANGER_DARK = '#DC2626';

// ── Panel shell ────────────────────────────────────────────────────────────────

export const panelStyle: React.CSSProperties = {
  width: '280px',
  background: SURFACE_ALT,
  borderRight: `1px solid ${BORDER}`,
  display: 'flex',
  flexDirection: 'column',
  fontFamily: 'Inter, sans-serif',
  color: TEXT_PRIMARY,
  overflow: 'hidden',
  flexShrink: 0,
};

// ── Panel header ───────────────────────────────────────────────────────────────

export const headerStyle: React.CSSProperties = {
  flexShrink: 0,
  padding: '12px',
  borderBottom: `1px solid ${BORDER}`,
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
};

export const headerTitleRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

export const headerTitleStyle: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 600,
  color: TEXT_SECONDARY,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  margin: 0,
};

export const newSceneButtonStyle: React.CSSProperties = {
  background: PRIMARY,
  border: 'none',
  borderRadius: '6px',
  padding: '0 10px',
  height: '28px',
  fontSize: '11px',
  fontWeight: 600,
  color: '#FFFFFF',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  flexShrink: 0,
  fontFamily: 'Inter, sans-serif',
};

// ── Search input ───────────────────────────────────────────────────────────────

export const searchInputStyle: React.CSSProperties = {
  width: '100%',
  background: SURFACE_ELEVATED,
  border: `1px solid ${BORDER}`,
  borderRadius: '6px',
  padding: '0 10px',
  height: '32px',
  fontSize: '12px',
  fontWeight: 400,
  color: TEXT_PRIMARY,
  fontFamily: 'Inter, sans-serif',
  outline: 'none',
  boxSizing: 'border-box',
};

// ── List area ──────────────────────────────────────────────────────────────────

export const listStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '8px',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
};

// ── Empty state ────────────────────────────────────────────────────────────────

export const emptyStateStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  color: TEXT_MUTED,
  fontSize: '13px',
  fontWeight: 400,
  textAlign: 'center',
  padding: '24px',
};

// ── Template card ──────────────────────────────────────────────────────────────

export const cardStyle: React.CSSProperties = {
  background: SURFACE_CARD,
  border: `1px solid ${BORDER}`,
  borderRadius: '8px',
  overflow: 'hidden',
  cursor: 'pointer',
  flexShrink: 0,
};

export const cardThumbnailRowStyle: React.CSSProperties = {
  display: 'flex',
  height: '60px',
  overflow: 'hidden',
  borderBottom: `1px solid ${BORDER}`,
};

export const thumbnailStyle: React.CSSProperties = {
  flex: 1,
  background: SURFACE_ELEVATED,
  overflow: 'hidden',
};

export const thumbnailImgStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  display: 'block',
};

export const thumbnailPlaceholderStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: TEXT_MUTED,
};

export const cardBodyStyle: React.CSSProperties = {
  padding: '8px',
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
};

export const cardNameStyle: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 600,
  color: TEXT_PRIMARY,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

export const cardMetaRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '4px',
};

export const cardBadgesRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '4px',
};

export const mediaBadgeStyle: React.CSSProperties = {
  fontSize: '9px',
  fontWeight: 600,
  padding: '2px 5px',
  borderRadius: '3px',
  background: SURFACE_ELEVATED,
  color: TEXT_SECONDARY,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
};

export const cardActionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: '4px',
};

export const cardActionButtonStyle: React.CSSProperties = {
  background: 'transparent',
  border: `1px solid ${BORDER}`,
  borderRadius: '4px',
  padding: '2px 7px',
  fontSize: '10px',
  fontWeight: 500,
  color: TEXT_SECONDARY,
  cursor: 'pointer',
  fontFamily: 'Inter, sans-serif',
};

export const addButtonStyle: React.CSSProperties = {
  background: PRIMARY,
  border: 'none',
  borderRadius: '4px',
  padding: '2px 7px',
  fontSize: '10px',
  fontWeight: 600,
  color: '#FFFFFF',
  cursor: 'pointer',
  fontFamily: 'Inter, sans-serif',
};

export const deleteButtonStyle: React.CSSProperties = {
  background: DANGER,
  border: 'none',
  borderRadius: '4px',
  padding: '2px 7px',
  fontSize: '10px',
  fontWeight: 600,
  color: '#FFFFFF',
  cursor: 'pointer',
  fontFamily: 'Inter, sans-serif',
};

// ── Error / loading banners ────────────────────────────────────────────────────

export const errorBannerStyle: React.CSSProperties = {
  margin: '8px',
  padding: '8px 12px',
  borderRadius: '6px',
  background: '#3B1010',
  border: `1px solid ${DANGER}`,
  fontSize: '12px',
  color: DANGER,
  flexShrink: 0,
};

export const loadingStyle: React.CSSProperties = {
  padding: '24px',
  textAlign: 'center',
  color: TEXT_SECONDARY,
  fontSize: '12px',
};
