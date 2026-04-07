import type React from 'react';

// ---------------------------------------------------------------------------
// Design-guide tokens
// ---------------------------------------------------------------------------

const SURFACE_ELEVATED = '#1E1E2E';
const SURFACE_ALT = '#16161F';
const TEXT_PRIMARY = '#F0F0FA';
const TEXT_SECONDARY = '#8A8AA0';
const BORDER = '#252535';
const PRIMARY = '#7C3AED';
const PRIMARY_DARK = '#5B21B6';
const WARNING = '#F59E0B';
const SUCCESS = '#10B981';

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

export const replaceAssetDialogStyles = {
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

  sectionLabel: {
    margin: 0,
    fontSize: '12px',
    fontWeight: 500,
    color: TEXT_SECONDARY,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  } as React.CSSProperties,

  /** Upload new file option area */
  uploadArea: {
    border: `1px dashed ${BORDER}`,
    borderRadius: '8px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    alignItems: 'center',
    cursor: 'pointer',
    transition: 'background 0.15s, border-color 0.15s',
  } as React.CSSProperties,

  uploadAreaHover: {
    border: `1px dashed ${PRIMARY}`,
    borderRadius: '8px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    alignItems: 'center',
    cursor: 'pointer',
    background: 'rgba(124, 58, 237, 0.08)',
    transition: 'background 0.15s, border-color 0.15s',
  } as React.CSSProperties,

  uploadText: {
    fontSize: '12px',
    color: TEXT_SECONDARY,
    lineHeight: '16px',
    margin: 0,
  } as React.CSSProperties,

  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  } as React.CSSProperties,

  dividerLine: {
    flex: 1,
    height: '1px',
    background: BORDER,
  } as React.CSSProperties,

  dividerLabel: {
    fontSize: '11px',
    color: TEXT_SECONDARY,
    fontWeight: 500,
  } as React.CSSProperties,

  /** Scrollable list of library assets */
  libraryList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    maxHeight: '180px',
    overflowY: 'auto',
    padding: '4px 0',
  } as React.CSSProperties,

  libraryItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    borderRadius: '4px',
    cursor: 'pointer',
    border: `1px solid transparent`,
  } as React.CSSProperties,

  libraryItemHover: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    borderRadius: '4px',
    cursor: 'pointer',
    background: SURFACE_ALT,
    border: `1px solid ${BORDER}`,
  } as React.CSSProperties,

  libraryItemSelected: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    borderRadius: '4px',
    cursor: 'pointer',
    background: 'rgba(124, 58, 237, 0.16)',
    border: `1px solid ${PRIMARY}`,
  } as React.CSSProperties,

  libraryItemThumb: {
    width: '40px',
    height: '28px',
    borderRadius: '4px',
    objectFit: 'cover',
    flexShrink: 0,
    background: SURFACE_ALT,
  } as React.CSSProperties,

  libraryItemName: {
    fontSize: '14px',
    lineHeight: '20px',
    color: TEXT_PRIMARY,
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    margin: 0,
  } as React.CSSProperties,

  libraryItemCheck: {
    fontSize: '14px',
    color: SUCCESS,
    flexShrink: 0,
  } as React.CSSProperties,

  emptyLibrary: {
    fontSize: '12px',
    color: TEXT_SECONDARY,
    textAlign: 'center',
    padding: '16px',
    margin: 0,
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

  replaceButton: {
    background: PRIMARY,
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

  replaceButtonHover: {
    background: PRIMARY_DARK,
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

  replaceButtonDisabled: {
    background: PRIMARY,
    border: 'none',
    borderRadius: '8px',
    color: TEXT_PRIMARY,
    fontSize: '14px',
    fontWeight: 600,
    fontFamily: 'Inter, sans-serif',
    padding: '8px 16px',
    cursor: 'not-allowed',
    lineHeight: '20px',
    opacity: 0.5,
  } as React.CSSProperties,
} as const;
