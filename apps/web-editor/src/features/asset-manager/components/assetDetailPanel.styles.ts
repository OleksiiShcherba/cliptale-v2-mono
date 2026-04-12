import type React from 'react';

// ---------------------------------------------------------------------------
// Design-guide tokens
// ---------------------------------------------------------------------------

const SURFACE_ELEVATED = '#1E1E2E';
const SURFACE_ALT = '#16161F';
const TEXT_PRIMARY = '#F0F0FA';
const TEXT_SECONDARY = '#8A8AA0';
const BORDER = '#252535';
const ERROR = '#EF4444';
const ACCENT = '#7C3AED';

export const STATUS_BG: Record<string, string> = {
  ready: '#10B981',
  processing: '#F59E0B',
  error: '#EF4444',
  pending: '#8A8AA0',
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

export const assetDetailPanelStyles = {
  root: {
    width: 280,
    height: 620,
    backgroundColor: SURFACE_ALT,
    display: 'flex',
    flexDirection: 'column',
    padding: 16,
    boxSizing: 'border-box',
    gap: 16,
    fontFamily: 'Inter, sans-serif',
    flexShrink: 0,
  } as React.CSSProperties,

  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexShrink: 0,
  } as React.CSSProperties,

  headerLabel: {
    fontSize: 12,
    fontWeight: 500,
    lineHeight: '16px',
    color: TEXT_SECONDARY,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  } as React.CSSProperties,

  closeButton: {
    background: 'transparent',
    border: 'none',
    color: TEXT_SECONDARY,
    cursor: 'pointer',
    padding: 4,
    lineHeight: 1,
    fontSize: 14,
    borderRadius: 4,
  } as React.CSSProperties,

  previewContainer: {
    width: 248,
    height: 160,
    borderRadius: 8,
    backgroundColor: SURFACE_ELEVATED,
    overflow: 'hidden',
    flexShrink: 0,
    position: 'relative',
  } as React.CSSProperties,

  previewImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  } as React.CSSProperties,

  previewEmpty: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: TEXT_SECONDARY,
    fontSize: 12,
    fontWeight: 400,
    lineHeight: '16px',
  } as React.CSSProperties,

  statusBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 28,
    paddingLeft: 8,
    paddingRight: 8,
    borderRadius: 9999,
    fontSize: 11,
    fontWeight: 400,
    lineHeight: '16px',
    color: TEXT_PRIMARY,
    textTransform: 'capitalize',
    boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
    letterSpacing: '0.04em',
  } as React.CSSProperties,

  metadataRow: {
    width: 248,
    height: 40,
    borderRadius: 8,
    backgroundColor: SURFACE_ELEVATED,
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    padding: '0 8px',
    gap: 8,
    boxSizing: 'border-box',
    flexShrink: 0,
  } as React.CSSProperties,

  metadataItem: {
    fontSize: 12,
    fontWeight: 400,
    lineHeight: '16px',
    color: TEXT_SECONDARY,
  } as React.CSSProperties,

  actionButton: (enabled: boolean): React.CSSProperties => ({
    width: 248,
    height: 36,
    borderRadius: 8,
    border: `1px solid ${BORDER}`,
    backgroundColor: 'transparent',
    color: enabled ? TEXT_PRIMARY : TEXT_SECONDARY,
    fontSize: 14,
    fontWeight: 400,
    lineHeight: '20px',
    cursor: enabled ? 'pointer' : 'not-allowed',
    fontFamily: 'Inter, sans-serif',
    flexShrink: 0,
    opacity: enabled ? 1 : 0.5,
  }),

  deleteButton: (enabled: boolean): React.CSSProperties => ({
    width: 248,
    height: 36,
    borderRadius: 8,
    border: `1px solid ${BORDER}`,
    backgroundColor: 'transparent',
    color: enabled ? ERROR : TEXT_SECONDARY,
    fontSize: 14,
    fontWeight: 400,
    lineHeight: '20px',
    cursor: enabled ? 'pointer' : 'not-allowed',
    fontFamily: 'Inter, sans-serif',
    flexShrink: 0,
    opacity: enabled ? 1 : 0.5,
  }),
} as const;

// ---------------------------------------------------------------------------
// InlineRenameField styles
// ---------------------------------------------------------------------------

export const inlineRenameStyles = {
  wrapper: {
    width: 248,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  } as React.CSSProperties,

  inputRow: (hasError: boolean): React.CSSProperties => ({
    width: 248,
    height: 32,
    borderRadius: 8,
    backgroundColor: SURFACE_ELEVATED,
    display: 'flex',
    alignItems: 'center',
    padding: '0 8px',
    boxSizing: 'border-box',
    border: `1px solid ${hasError ? ERROR : ACCENT}`,
  }),

  input: (isLoading: boolean): React.CSSProperties => ({
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    fontSize: 14,
    fontWeight: 400,
    lineHeight: '20px',
    color: TEXT_PRIMARY,
    fontFamily: 'Inter, sans-serif',
    cursor: isLoading ? 'wait' : 'text',
  }),

  errorText: {
    fontSize: 11,
    fontWeight: 400,
    lineHeight: '16px',
    color: ERROR,
    paddingLeft: 2,
  } as React.CSSProperties,

  viewRow: {
    width: 248,
    height: 32,
    borderRadius: 8,
    backgroundColor: SURFACE_ELEVATED,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 8px',
    boxSizing: 'border-box',
  } as React.CSSProperties,

  displayName: {
    fontSize: 14,
    fontWeight: 400,
    lineHeight: '20px',
    color: TEXT_PRIMARY,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    flex: 1,
  } as React.CSSProperties,

  pencilButton: {
    background: 'transparent',
    border: 'none',
    color: TEXT_SECONDARY,
    cursor: 'pointer',
    padding: '0 0 0 4px',
    fontSize: 12,
    fontWeight: 400,
    lineHeight: '16px',
    flexShrink: 0,
  } as React.CSSProperties,
} as const;
