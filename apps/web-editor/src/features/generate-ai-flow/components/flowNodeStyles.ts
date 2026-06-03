/**
 * Shared design tokens + node styles for the Generate AI flow canvas (T17).
 * Tokens match §3 Dark Theme — same palette as the storyboard canvas / FlowListPage.
 */

import type React from 'react';

export const SURFACE = '#0D0D14';
export const SURFACE_ELEVATED = '#1E1E2E';
export const SURFACE_BASE = '#13131F';
export const BORDER = '#252535';
export const PRIMARY = '#7C3AED';
export const TEXT_PRIMARY = '#F0F0FA';
export const TEXT_SECONDARY = '#8A8AA0';
export const ERROR = '#EF4444';
export const SUCCESS = '#10B981';

/** Per-modality accent — used to colour handles + the modality label. */
export const MODALITY_COLOR: Record<string, string> = {
  text: '#60A5FA',
  image: '#34D399',
  audio: '#F472B6',
  video: '#FBBF24',
};

export const nodeRoot: React.CSSProperties = {
  position: 'relative',
  minWidth: 200,
  background: SURFACE_ELEVATED,
  border: `1px solid ${BORDER}`,
  borderRadius: 10,
  padding: 12,
  fontFamily: 'Inter, sans-serif',
  color: TEXT_PRIMARY,
};

export const nodeHeader: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  marginBottom: 8,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

export const nodeSubtle: React.CSSProperties = {
  fontSize: 11,
  color: TEXT_SECONDARY,
};

export const handleBase: React.CSSProperties = {
  width: 11,
  height: 11,
  borderRadius: '50%',
  border: `2px solid ${SURFACE_ELEVATED}`,
};

export const handleRow: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 0',
  fontSize: 11,
  color: TEXT_SECONDARY,
};
