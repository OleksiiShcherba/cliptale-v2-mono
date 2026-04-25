import React from 'react';

// Design-guide tokens
export const SURFACE = '#0D0D14';
export const SURFACE_ALT = '#16161F';
export const SURFACE_ELEVATED = '#1E1E2E';
export const PRIMARY = '#7C3AED';
export const TEXT_PRIMARY = '#F0F0FA';
export const TEXT_SECONDARY = '#8A8AA0';
export const BORDER = '#252535';
export const SUCCESS = '#10B981';
export const ERROR = '#EF4444';

export const exportModalStyles = {
  backdrop: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0, 0, 0, 0.75)',
    zIndex: 100,
  } as React.CSSProperties,

  modal: {
    position: 'fixed' as const,
    top: '100px',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '560px',
    maxHeight: '700px',
    background: SURFACE_ELEVATED,
    borderRadius: '16px',
    zIndex: 101,
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
    fontFamily: 'Inter, sans-serif',
  } as React.CSSProperties,

  header: {
    height: '44px',
    flexShrink: 0,
    background: SURFACE_ALT,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: '24px',
    paddingRight: '16px',
    borderBottom: `1px solid ${BORDER}`,
  } as React.CSSProperties,

  heading: {
    margin: 0,
    fontSize: '16px',
    fontWeight: 600,
    color: TEXT_PRIMARY,
    lineHeight: '24px',
  } as React.CSSProperties,

  closeButton: {
    background: 'transparent',
    border: 'none',
    color: TEXT_SECONDARY,
    fontSize: '20px',
    lineHeight: '20px',
    cursor: 'pointer',
    padding: '4px 8px',
    transition: 'color 0.15s ease',
  } as React.CSSProperties,

  body: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '24px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
    background: SURFACE,
  } as React.CSSProperties,

  sectionLabel: {
    margin: '0 0 12px',
    fontSize: '11px',
    fontWeight: 500,
    color: TEXT_SECONDARY,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    lineHeight: '16px',
  } as React.CSSProperties,

  presetGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '12px',
  } as React.CSSProperties,

  presetCard: {
    background: SURFACE_ALT,
    border: `1px solid ${BORDER}`,
    borderRadius: '8px',
    padding: '12px 8px',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
    textAlign: 'left' as const,
    minHeight: '52px',
    transition: 'border-color 0.15s ease',
  } as React.CSSProperties,

  presetCardSelected: {
    background: SURFACE_ALT,
    border: `2px solid ${PRIMARY}`,
    borderRadius: '8px',
    padding: '11px 7px',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
    textAlign: 'left' as const,
    minHeight: '52px',
  } as React.CSSProperties,

  presetCardLabel: {
    fontSize: '13px',
    fontWeight: 600,
    color: TEXT_PRIMARY,
    lineHeight: '20px',
  } as React.CSSProperties,

  presetCardMeta: {
    fontSize: '11px',
    fontWeight: 400,
    color: TEXT_SECONDARY,
    lineHeight: '16px',
  } as React.CSSProperties,

  startButton: {
    width: '100%',
    height: '48px',
    background: PRIMARY,
    border: 'none',
    borderRadius: '8px',
    color: TEXT_PRIMARY,
    fontSize: '14px',
    fontWeight: 600,
    fontFamily: 'Inter, sans-serif',
    cursor: 'pointer',
    transition: 'background 0.15s ease',
  } as React.CSSProperties,

  startButtonDisabled: {
    width: '100%',
    height: '48px',
    background: SURFACE_ALT,
    border: `1px solid ${BORDER}`,
    borderRadius: '8px',
    color: TEXT_SECONDARY,
    fontSize: '14px',
    fontWeight: 600,
    fontFamily: 'Inter, sans-serif',
    cursor: 'not-allowed',
  } as React.CSSProperties,

  downloadButton: {
    display: 'block',
    width: '100%',
    height: '48px',
    lineHeight: '48px',
    background: SUCCESS,
    border: 'none',
    borderRadius: '8px',
    color: TEXT_PRIMARY,
    fontSize: '14px',
    fontWeight: 600,
    fontFamily: 'Inter, sans-serif',
    cursor: 'pointer',
    textAlign: 'center' as const,
    textDecoration: 'none',
    boxSizing: 'border-box' as const,
  } as React.CSSProperties,

  errorText: {
    margin: 0,
    fontSize: '13px',
    fontWeight: 400,
    color: ERROR,
    lineHeight: '20px',
  } as React.CSSProperties,

  successText: {
    margin: '0 0 16px',
    fontSize: '13px',
    fontWeight: 400,
    color: SUCCESS,
    lineHeight: '20px',
  } as React.CSSProperties,

  statusRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '12px',
  } as React.CSSProperties,

  statusBadgeQueued: {
    fontSize: '12px',
    fontWeight: 500,
    color: TEXT_SECONDARY,
    background: SURFACE_ELEVATED,
    borderRadius: '4px',
    padding: '4px 8px',
    lineHeight: '16px',
  } as React.CSSProperties,

  statusBadgeProcessing: {
    fontSize: '12px',
    fontWeight: 500,
    color: PRIMARY,
    background: SURFACE_ELEVATED,
    borderRadius: '4px',
    padding: '4px 8px',
    lineHeight: '16px',
  } as React.CSSProperties,

  pctText: {
    fontSize: '12px',
    fontWeight: 500,
    color: TEXT_PRIMARY,
    lineHeight: '16px',
  } as React.CSSProperties,

  statusHint: {
    margin: '12px 0 16px',
    fontSize: '12px',
    fontWeight: 400,
    color: TEXT_SECONDARY,
    lineHeight: '16px',
  } as React.CSSProperties,

  footer: {
    flexShrink: 0,
    padding: '16px 24px',
    background: SURFACE_ELEVATED,
    borderTop: `1px solid ${BORDER}`,
  } as React.CSSProperties,

  cancelButton: {
    width: '100%',
    height: '40px',
    background: 'transparent',
    border: `1px solid ${BORDER}`,
    borderRadius: '8px',
    color: TEXT_SECONDARY,
    fontSize: '13px',
    fontWeight: 500,
    fontFamily: 'Inter, sans-serif',
    cursor: 'pointer',
  } as React.CSSProperties,
} as const;
