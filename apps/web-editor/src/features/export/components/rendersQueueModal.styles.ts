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
export const WARNING = '#F59E0B';

export const rendersQueueModalStyles = {
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

  closeButtonHover: {
    background: 'transparent',
    border: 'none',
    color: TEXT_PRIMARY,
    fontSize: '20px',
    lineHeight: '20px',
    cursor: 'pointer',
    padding: '4px 8px',
    transition: 'color 0.15s ease',
  } as React.CSSProperties,

  body: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '16px 24px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
    background: SURFACE,
  } as React.CSSProperties,

  emptyState: {
    padding: '32px 0',
    textAlign: 'center' as const,
    color: TEXT_SECONDARY,
    fontSize: '14px',
    lineHeight: '20px',
  } as React.CSSProperties,

  loadingState: {
    padding: '32px 0',
    textAlign: 'center' as const,
    color: TEXT_SECONDARY,
    fontSize: '14px',
    lineHeight: '20px',
  } as React.CSSProperties,

  errorState: {
    padding: '16px 0',
    color: ERROR,
    fontSize: '14px',
    lineHeight: '20px',
  } as React.CSSProperties,

  jobCard: {
    background: SURFACE_ELEVATED,
    border: `1px solid ${BORDER}`,
    borderRadius: '8px',
    padding: '12px 16px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  } as React.CSSProperties,

  jobCardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
  } as React.CSSProperties,

  jobPresetLabel: {
    fontSize: '14px',
    fontWeight: 600,
    color: TEXT_PRIMARY,
    lineHeight: '20px',
  } as React.CSSProperties,

  jobDate: {
    fontSize: '11px',
    fontWeight: 400,
    color: TEXT_SECONDARY,
    lineHeight: '16px',
    flexShrink: 0,
  } as React.CSSProperties,

  statusBadgeQueued: {
    fontSize: '11px',
    fontWeight: 500,
    color: TEXT_SECONDARY,
    background: SURFACE_ALT,
    borderRadius: '4px',
    padding: '2px 6px',
    lineHeight: '16px',
    flexShrink: 0,
  } as React.CSSProperties,

  statusBadgeProcessing: {
    fontSize: '11px',
    fontWeight: 500,
    color: PRIMARY,
    background: SURFACE_ALT,
    borderRadius: '4px',
    padding: '2px 6px',
    lineHeight: '16px',
    flexShrink: 0,
  } as React.CSSProperties,

  statusBadgeComplete: {
    fontSize: '11px',
    fontWeight: 500,
    color: SUCCESS,
    background: SURFACE_ALT,
    borderRadius: '4px',
    padding: '2px 6px',
    lineHeight: '16px',
    flexShrink: 0,
  } as React.CSSProperties,

  statusBadgeFailed: {
    fontSize: '11px',
    fontWeight: 500,
    color: ERROR,
    background: SURFACE_ALT,
    borderRadius: '4px',
    padding: '2px 6px',
    lineHeight: '16px',
    flexShrink: 0,
  } as React.CSSProperties,

  progressTrack: {
    height: '8px',
    background: SURFACE_ALT,
    borderRadius: '9999px',
    overflow: 'hidden' as const,
  } as React.CSSProperties,

  progressFill: (pct: number, status: string): React.CSSProperties => ({
    height: '8px',
    width: `${pct}%`,
    background: status === 'complete' ? SUCCESS : status === 'failed' ? ERROR : PRIMARY,
    borderRadius: '9999px',
    transition: 'width 0.3s ease',
  }),

  jobFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
  } as React.CSSProperties,

  pctLabel: {
    fontSize: '11px',
    fontWeight: 500,
    color: TEXT_SECONDARY,
    lineHeight: '16px',
  } as React.CSSProperties,

  downloadLink: {
    fontSize: '12px',
    fontWeight: 600,
    color: SUCCESS,
    textDecoration: 'none',
    lineHeight: '16px',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    fontFamily: 'Inter, sans-serif',
  } as React.CSSProperties,

  errorMsg: {
    fontSize: '11px',
    fontWeight: 400,
    color: ERROR,
    lineHeight: '16px',
    margin: 0,
  } as React.CSSProperties,

  footer: {
    flexShrink: 0,
    padding: '16px 24px',
    background: SURFACE_ELEVATED,
    borderTop: `1px solid ${BORDER}`,
  } as React.CSSProperties,

  closeFooterButton: {
    width: '100%',
    height: '40px',
    background: 'transparent',
    border: `1px solid ${BORDER}`,
    borderRadius: '8px',
    color: TEXT_PRIMARY,
    fontSize: '14px',
    fontWeight: 500,
    fontFamily: 'Inter, sans-serif',
    cursor: 'pointer',
  } as React.CSSProperties,
} as const;
