/**
 * Inline style tokens for SceneModal and SceneModal.mediaSection.
 *
 * Design-guide §3: dark theme, Inter font, 4px grid, radius-md = 8px.
 * No CSS custom properties — hex constants only.
 */
import type React from 'react';

// ── Design tokens ──────────────────────────────────────────────────────────────

export const SURFACE = '#0D0D14';
export const SURFACE_ALT = '#16161F';
export const SURFACE_ELEVATED = '#1E1E2E';
export const BORDER = '#252535';
export const TEXT_PRIMARY = '#F0F0FA';
export const TEXT_SECONDARY = '#8A8AA0';
export const PRIMARY = '#7C3AED';
export const PRIMARY_DARK = '#5B21B6';
export const ERROR = '#EF4444';
export const SUCCESS = '#10B981';
export const WARNING = '#F59E0B';

// ── Backdrop / overlay ─────────────────────────────────────────────────────────

export const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.7)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

// ── Dialog shell ───────────────────────────────────────────────────────────────

export const dialogStyle: React.CSSProperties = {
  background: SURFACE_ELEVATED,
  border: `1px solid ${BORDER}`,
  borderRadius: '8px',
  width: '540px',
  maxHeight: '88vh',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: 'Inter, sans-serif',
  color: TEXT_PRIMARY,
  overflow: 'hidden',
};

// ── Header row ─────────────────────────────────────────────────────────────────

export const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '16px 20px',
  borderBottom: `1px solid ${BORDER}`,
  flexShrink: 0,
};

export const headerTitleStyle: React.CSSProperties = {
  fontSize: '16px',
  fontWeight: 600,
  color: TEXT_PRIMARY,
  lineHeight: '24px',
};

export const closeButtonStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  padding: '4px',
  borderRadius: '4px',
  cursor: 'pointer',
  color: TEXT_SECONDARY,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  lineHeight: 1,
};

// ── Scrollable body ────────────────────────────────────────────────────────────

export const bodyStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '20px',
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
};

// ── Section label ──────────────────────────────────────────────────────────────

export const sectionLabelStyle: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 500,
  color: TEXT_SECONDARY,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  marginBottom: '8px',
};

// ── Form field styles ──────────────────────────────────────────────────────────

export const inputStyle: React.CSSProperties = {
  width: '100%',
  background: SURFACE_ALT,
  border: `1px solid ${BORDER}`,
  borderRadius: '8px',
  padding: '8px 12px',
  fontSize: '14px',
  fontWeight: 400,
  color: TEXT_PRIMARY,
  fontFamily: 'Inter, sans-serif',
  outline: 'none',
  boxSizing: 'border-box',
};

export const textareaStyle: React.CSSProperties = {
  width: '100%',
  background: SURFACE_ALT,
  border: `1px solid ${BORDER}`,
  borderRadius: '8px',
  padding: '8px 12px',
  fontSize: '14px',
  fontWeight: 400,
  color: TEXT_PRIMARY,
  fontFamily: 'Inter, sans-serif',
  outline: 'none',
  resize: 'vertical',
  minHeight: '80px',
  boxSizing: 'border-box',
};

export const numberInputStyle: React.CSSProperties = {
  width: '100%',
  background: SURFACE_ALT,
  border: `1px solid ${BORDER}`,
  borderRadius: '8px',
  padding: '8px 12px',
  fontSize: '14px',
  fontWeight: 400,
  color: TEXT_PRIMARY,
  fontFamily: 'Inter, sans-serif',
  outline: 'none',
  boxSizing: 'border-box',
};

// ── Style card grid ────────────────────────────────────────────────────────────

export const styleGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: '8px',
};

export const styleCardStyle: React.CSSProperties = {
  background: SURFACE_ALT,
  border: `1px solid ${BORDER}`,
  borderRadius: '8px',
  padding: '12px',
  cursor: 'pointer',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
};

export const styleCardSelectedStyle: React.CSSProperties = {
  ...styleCardStyle,
  border: `1px solid ${PRIMARY}`,
  background: '#1a1030',
};

export const styleSwatchStyle: React.CSSProperties = {
  width: '32px',
  height: '32px',
  borderRadius: '4px',
  flexShrink: 0,
};

export const styleCardLabelStyle: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 600,
  color: TEXT_PRIMARY,
};

export const styleCardDescStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 400,
  color: TEXT_SECONDARY,
  lineHeight: '16px',
};

// ── Animation stub ─────────────────────────────────────────────────────────────

export const animationStubStyle: React.CSSProperties = {
  background: SURFACE_ALT,
  border: `1px solid ${BORDER}`,
  borderRadius: '8px',
  padding: '16px',
  color: TEXT_SECONDARY,
  fontSize: '14px',
  fontWeight: 400,
  textAlign: 'center',
  opacity: 0.6,
};

// ── Footer buttons ─────────────────────────────────────────────────────────────

export const footerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '16px 20px',
  borderTop: `1px solid ${BORDER}`,
  flexShrink: 0,
};

export const saveButtonStyle: React.CSSProperties = {
  background: PRIMARY,
  border: 'none',
  borderRadius: '8px',
  padding: '0 20px',
  height: '36px',
  fontSize: '14px',
  fontWeight: 500,
  color: '#FFFFFF',
  cursor: 'pointer',
  fontFamily: 'Inter, sans-serif',
};

export const deleteButtonStyle: React.CSSProperties = {
  background: 'transparent',
  border: `1px solid ${ERROR}`,
  borderRadius: '8px',
  padding: '0 16px',
  height: '36px',
  fontSize: '14px',
  fontWeight: 500,
  color: ERROR,
  cursor: 'pointer',
  fontFamily: 'Inter, sans-serif',
};

export const cancelButtonStyle: React.CSSProperties = {
  background: 'transparent',
  border: `1px solid ${BORDER}`,
  borderRadius: '8px',
  padding: '0 16px',
  height: '36px',
  fontSize: '14px',
  fontWeight: 500,
  color: TEXT_PRIMARY,
  cursor: 'pointer',
  fontFamily: 'Inter, sans-serif',
};
