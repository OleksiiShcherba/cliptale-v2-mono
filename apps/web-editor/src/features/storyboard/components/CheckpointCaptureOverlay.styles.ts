/**
 * Inline style tokens for CheckpointCaptureOverlay.
 *
 * Design-guide §3: dark theme, Inter font. The overlay covers the full page
 * during the capture moment (AC-03) so the screenshot never includes a
 * half-rendered interaction.
 */
import type React from 'react';

export const TEXT_PRIMARY = '#F0F0FA';

export const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 1000,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 12,
  background: 'rgba(13, 13, 20, 0.72)',
  backdropFilter: 'blur(2px)',
  fontFamily: 'Inter, sans-serif',
  color: TEXT_PRIMARY,
  fontSize: 14,
};

export const spinnerStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  border: '3px solid rgba(240, 240, 250, 0.25)',
  borderTopColor: TEXT_PRIMARY,
  borderRadius: '50%',
  animation: 'checkpoint-overlay-spin 0.8s linear infinite',
};

/** Keyframes injected once alongside the overlay (no separate CSS file). */
export const spinnerKeyframes = `
@keyframes checkpoint-overlay-spin {
  to { transform: rotate(360deg); }
}
`;
