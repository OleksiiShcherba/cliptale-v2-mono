/**
 * Inline style tokens for CheckpointCountdownBar.
 *
 * Design-guide §3: dark theme, Inter font, 4px grid, radius-md = 8px.
 * No CSS custom properties — hex constants only (panel precedent).
 */
import type React from 'react';

// ── Design tokens ──────────────────────────────────────────────────────────────

export const SURFACE_ELEVATED = '#1E1E2E';
export const BORDER = '#252535';
export const TEXT_PRIMARY = '#F0F0FA';
export const TEXT_SECONDARY = '#8A8AA0';
export const PRIMARY = '#7C3AED';
export const SUCCESS = '#34D399';

// ── Bar shell ──────────────────────────────────────────────────────────────────

export const barStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  height: 32,
  padding: '0 8px 0 12px',
  background: SURFACE_ELEVATED,
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  fontFamily: 'Inter, sans-serif',
  fontSize: 12,
  color: TEXT_SECONDARY,
  whiteSpace: 'nowrap',
};

export const countdownTextStyle: React.CSSProperties = {
  color: TEXT_PRIMARY,
  fontVariantNumeric: 'tabular-nums',
};

export const idleTextStyle: React.CSSProperties = {
  color: SUCCESS,
};

export const saveButtonStyle: React.CSSProperties = {
  height: 24,
  padding: '0 10px',
  background: PRIMARY,
  color: TEXT_PRIMARY,
  border: 'none',
  borderRadius: 6,
  fontFamily: 'Inter, sans-serif',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  lineHeight: '24px',
};

export const saveButtonDisabledStyle: React.CSSProperties = {
  ...saveButtonStyle,
  background: BORDER,
  color: TEXT_SECONDARY,
  cursor: 'default',
};
