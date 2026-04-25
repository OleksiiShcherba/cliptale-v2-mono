import type React from 'react';

// ---------------------------------------------------------------------------
// Design-guide tokens
// ---------------------------------------------------------------------------

const SURFACE_ELEVATED = '#1E1E2E';
const SURFACE_ALT = '#16161F';
const TEXT_PRIMARY = '#F0F0FA';
const TEXT_SECONDARY = '#8A8AA0';
const BORDER = '#252535';

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

export const assetPreviewModalStyles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.75)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  } as React.CSSProperties,

  modal: {
    background: SURFACE_ELEVATED,
    border: `1px solid ${BORDER}`,
    borderRadius: '16px',
    width: 'min(880px, 92vw)',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
    fontFamily: 'Inter, sans-serif',
    overflow: 'hidden',
  } as React.CSSProperties,

  header: {
    height: 48,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 24,
    paddingRight: 16,
    background: SURFACE_ALT,
    borderBottom: `1px solid ${BORDER}`,
  } as React.CSSProperties,

  title: {
    margin: 0,
    fontSize: 16,
    fontWeight: 600,
    color: TEXT_PRIMARY,
    lineHeight: '24px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '75%',
  } as React.CSSProperties,

  closeButton: {
    background: 'transparent',
    border: 'none',
    color: TEXT_SECONDARY,
    cursor: 'pointer',
    fontSize: 18,
    padding: '6px 8px',
    borderRadius: 4,
  } as React.CSSProperties,

  body: {
    flex: 1,
    minHeight: 0,
    padding: 24,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    background: SURFACE_ELEVATED,
    overflow: 'auto',
  } as React.CSSProperties,

  video: {
    width: '100%',
    maxHeight: '65vh',
    background: '#000',
    borderRadius: 8,
    outline: 'none',
  } as React.CSSProperties,

  image: {
    maxWidth: '100%',
    maxHeight: '65vh',
    objectFit: 'contain',
    borderRadius: 8,
    background: '#000',
  } as React.CSSProperties,

  audioWrapper: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
  } as React.CSSProperties,

  waveformBox: {
    position: 'relative',
    width: '100%',
    height: 120,
    background: SURFACE_ALT,
    border: `1px solid ${BORDER}`,
    borderRadius: 8,
    overflow: 'hidden',
  } as React.CSSProperties,

  waveformEmpty: {
    width: '100%',
    height: 120,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: SURFACE_ALT,
    border: `1px solid ${BORDER}`,
    borderRadius: 8,
    color: TEXT_SECONDARY,
    fontSize: 12,
    fontWeight: 400,
    lineHeight: '16px',
  } as React.CSSProperties,

  audio: {
    width: '100%',
  } as React.CSSProperties,

  notReady: {
    padding: '24px 0',
    color: TEXT_SECONDARY,
    fontSize: 14,
    fontWeight: 400,
    lineHeight: '20px',
  } as React.CSSProperties,
} as const;
