import type React from 'react';

// ---------------------------------------------------------------------------
// Design-guide tokens
// ---------------------------------------------------------------------------

const SURFACE_ELEVATED = '#1E1E2E';
const TEXT_PRIMARY = '#F0F0FA';
const TEXT_SECONDARY = '#8A8AA0';
const BORDER = '#252535';
const ERROR = '#EF4444';
const ERROR_DARK = '#DC2626';
const WARNING = '#F59E0B';

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

export const deleteAssetDialogStyles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.7)',
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
    padding: '24px',
    width: '480px',
    maxWidth: '95vw',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    fontFamily: 'Inter, sans-serif',
  } as React.CSSProperties,

  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  } as React.CSSProperties,

  title: {
    margin: 0,
    fontSize: '20px',
    fontWeight: 600,
    color: TEXT_PRIMARY,
    lineHeight: '28px',
  } as React.CSSProperties,

  closeButton: {
    background: 'transparent',
    border: 'none',
    color: TEXT_SECONDARY,
    cursor: 'pointer',
    fontSize: '16px',
    lineHeight: 1,
    padding: '4px',
    borderRadius: '4px',
  } as React.CSSProperties,

  warningBanner: {
    background: 'rgba(245, 158, 11, 0.12)',
    border: `1px solid ${WARNING}`,
    borderRadius: '8px',
    padding: '12px 16px',
    display: 'flex',
    gap: '8px',
    alignItems: 'flex-start',
  } as React.CSSProperties,

  warningIcon: {
    fontSize: '16px',
    flexShrink: 0,
    lineHeight: '20px',
  } as React.CSSProperties,

  warningText: {
    margin: 0,
    fontSize: '14px',
    color: TEXT_PRIMARY,
    lineHeight: '20px',
  } as React.CSSProperties,

  warningTextSecondary: {
    margin: '4px 0 0',
    fontSize: '12px',
    color: TEXT_SECONDARY,
    lineHeight: '16px',
  } as React.CSSProperties,

  actions: {
    display: 'flex',
    gap: '8px',
    justifyContent: 'flex-end',
    paddingTop: '4px',
  } as React.CSSProperties,

  cancelButton: {
    background: 'transparent',
    border: `1px solid ${BORDER}`,
    borderRadius: '8px',
    color: TEXT_PRIMARY,
    fontSize: '14px',
    fontWeight: 500,
    fontFamily: 'Inter, sans-serif',
    padding: '8px 16px',
    cursor: 'pointer',
    lineHeight: '20px',
  } as React.CSSProperties,

  deleteButton: {
    background: ERROR,
    border: 'none',
    borderRadius: '8px',
    color: TEXT_PRIMARY,
    fontSize: '14px',
    fontWeight: 600,
    fontFamily: 'Inter, sans-serif',
    padding: '8px 16px',
    cursor: 'pointer',
    lineHeight: '20px',
  } as React.CSSProperties,

  deleteButtonHover: {
    background: ERROR_DARK,
    border: 'none',
    borderRadius: '8px',
    color: TEXT_PRIMARY,
    fontSize: '14px',
    fontWeight: 600,
    fontFamily: 'Inter, sans-serif',
    padding: '8px 16px',
    cursor: 'pointer',
    lineHeight: '20px',
  } as React.CSSProperties,
} as const;
