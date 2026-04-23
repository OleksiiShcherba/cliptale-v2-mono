/**
 * Inline style tokens for EffectsPanel.
 *
 * Design-guide §3: dark theme, Inter font, 4px grid, radius-md = 8px.
 * No CSS custom properties — hex constants only.
 */
import type React from 'react';

// ── Design tokens ──────────────────────────────────────────────────────────────

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
export const SURFACE = '#0D0D14';

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

// ── Section header ─────────────────────────────────────────────────────────────

export const sectionHeaderStyle: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 600,
  color: TEXT_SECONDARY,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  margin: 0,
  padding: '12px 12px 8px',
  borderBottom: `1px solid ${BORDER}`,
  flexShrink: 0,
};

// ── Style cards list ───────────────────────────────────────────────────────────

export const cardsListStyle: React.CSSProperties = {
  padding: '8px',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  flexShrink: 0,
};

export const styleCardStyle: React.CSSProperties = {
  background: SURFACE_CARD,
  border: `1px solid ${BORDER}`,
  borderRadius: '8px',
  padding: '12px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'flex-start',
  gap: '12px',
};

export const styleCardLabelStyle: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 400,
  color: TEXT_PRIMARY,
  marginBottom: '4px',
};

export const styleCardDescriptionStyle: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 400,
  color: TEXT_SECONDARY,
  lineHeight: '16px',
};

export const styleCardTextStyle: React.CSSProperties = {
  flex: 1,
};

// ── Color swatch ───────────────────────────────────────────────────────────────

export const swatchStyle: React.CSSProperties = {
  width: '32px',
  height: '32px',
  borderRadius: '8px',
  border: `1px solid ${BORDER}`,
  flexShrink: 0,
};

// ── Apply dialog (inline) ──────────────────────────────────────────────────────

export const applyDialogStyle: React.CSSProperties = {
  background: SURFACE_ELEVATED,
  border: `1px solid ${BORDER}`,
  borderRadius: '8px',
  padding: '12px',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  marginTop: '4px',
};

export const applyButtonStyle: React.CSSProperties = {
  background: PRIMARY,
  border: 'none',
  borderRadius: '4px',
  padding: '0 12px',
  height: '32px',
  fontSize: '12px',
  fontWeight: 500,
  color: '#FFFFFF',
  cursor: 'pointer',
  fontFamily: 'Inter, sans-serif',
  textAlign: 'left',
};

export const applyButtonDisabledStyle: React.CSSProperties = {
  background: SURFACE_CARD,
  border: `1px solid ${BORDER}`,
  borderRadius: '4px',
  padding: '0 12px',
  height: '32px',
  fontSize: '12px',
  fontWeight: 500,
  color: TEXT_MUTED,
  cursor: 'not-allowed',
  fontFamily: 'Inter, sans-serif',
  opacity: 0.6,
  textAlign: 'left',
};

export const applyAllButtonStyle: React.CSSProperties = {
  background: 'transparent',
  border: `1px solid ${PRIMARY}`,
  borderRadius: '4px',
  padding: '0 12px',
  height: '32px',
  fontSize: '12px',
  fontWeight: 500,
  color: PRIMARY,
  cursor: 'pointer',
  fontFamily: 'Inter, sans-serif',
  textAlign: 'left',
};

export const tooltipTextStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 400,
  color: TEXT_MUTED,
  fontStyle: 'italic',
};

// ── Animation section ──────────────────────────────────────────────────────────

export const animationSectionStyle: React.CSSProperties = {
  padding: '12px',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  borderTop: `1px solid ${BORDER}`,
  marginTop: '8px',
};

export const animationSectionHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
};

export const animationTitleStyle: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 600,
  color: TEXT_SECONDARY,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  margin: 0,
};

export const comingSoonBadgeStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 400,
  color: TEXT_MUTED,
  background: SURFACE_ELEVATED,
  border: `1px solid ${BORDER}`,
  borderRadius: '4px',
  padding: '4px 8px',
  letterSpacing: '0.04em',
};

export const animationItemStyle: React.CSSProperties = {
  background: SURFACE_CARD,
  border: `1px solid ${BORDER}`,
  borderRadius: '8px',
  padding: '12px',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  opacity: 0.45,
  cursor: 'not-allowed',
};

export const animationItemLabelStyle: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 400,
  color: TEXT_SECONDARY,
};
