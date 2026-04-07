import type React from 'react';

// Design-guide tokens used by TopBar.
const SURFACE_ALT = '#16161F';
const BORDER = '#252535';
const TEXT_PRIMARY = '#F0F0FA';
const TEXT_SECONDARY = '#8A8AA0';
const PRIMARY = '#7C3AED';
const PRIMARY_LIGHT = '#4C1D95';
const TEXT_DISABLED = '#4A4A5A';
const SURFACE_DISABLED = '#252535';

export const styles = {
  topBar: {
    height: '48px',
    flexShrink: 0,
    background: SURFACE_ALT,
    borderBottom: `1px solid ${BORDER}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: '16px',
    paddingRight: '16px',
  } as React.CSSProperties,

  topBarTitle: {
    fontSize: '14px',
    fontWeight: 500,
    color: TEXT_PRIMARY,
  } as React.CSSProperties,

  topBarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  } as React.CSSProperties,

  undoRedoGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  } as React.CSSProperties,

  iconButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    background: 'transparent',
    border: `1px solid ${BORDER}`,
    borderRadius: '6px',
    color: TEXT_PRIMARY,
    cursor: 'pointer',
    padding: '0',
  } as React.CSSProperties,

  iconButtonDisabled: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    background: 'transparent',
    border: `1px solid ${BORDER}`,
    borderRadius: '6px',
    color: TEXT_DISABLED,
    cursor: 'not-allowed',
    padding: '0',
  } as React.CSSProperties,

  historyButton: {
    background: 'transparent',
    border: `1px solid ${BORDER}`,
    borderRadius: '6px',
    color: TEXT_SECONDARY,
    fontSize: '12px',
    fontWeight: 500,
    fontFamily: 'Inter, sans-serif',
    padding: '4px 10px',
    cursor: 'pointer',
    lineHeight: '16px',
  } as React.CSSProperties,

  historyButtonActive: {
    background: PRIMARY_LIGHT,
    border: `1px solid ${PRIMARY}`,
    borderRadius: '6px',
    color: TEXT_PRIMARY,
    fontSize: '12px',
    fontWeight: 500,
    fontFamily: 'Inter, sans-serif',
    padding: '4px 10px',
    cursor: 'pointer',
    lineHeight: '16px',
  } as React.CSSProperties,

  rendersButtonWrapper: {
    position: 'relative' as const,
    display: 'inline-flex',
    alignItems: 'center',
  } as React.CSSProperties,

  rendersButton: {
    background: 'transparent',
    border: `1px solid ${BORDER}`,
    borderRadius: '6px',
    color: TEXT_SECONDARY,
    fontSize: '12px',
    fontWeight: 500,
    fontFamily: 'Inter, sans-serif',
    padding: '4px 10px',
    cursor: 'pointer',
    lineHeight: '16px',
  } as React.CSSProperties,

  rendersButtonActive: {
    background: PRIMARY_LIGHT,
    border: `1px solid ${PRIMARY}`,
    borderRadius: '6px',
    color: TEXT_PRIMARY,
    fontSize: '12px',
    fontWeight: 500,
    fontFamily: 'Inter, sans-serif',
    padding: '4px 10px',
    cursor: 'pointer',
    lineHeight: '16px',
  } as React.CSSProperties,

  rendersBadge: {
    position: 'absolute' as const,
    top: '-6px',
    right: '-6px',
    minWidth: '16px',
    height: '16px',
    background: PRIMARY,
    borderRadius: '9999px',
    fontSize: '10px',
    fontWeight: 600,
    fontFamily: 'Inter, sans-serif',
    color: TEXT_PRIMARY,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 4px',
    lineHeight: '16px',
    pointerEvents: 'none' as const,
  } as React.CSSProperties,

  exportButton: {
    background: PRIMARY,
    border: 'none',
    borderRadius: '6px',
    color: TEXT_PRIMARY,
    fontSize: '12px',
    fontWeight: 600,
    fontFamily: 'Inter, sans-serif',
    padding: '4px 12px',
    cursor: 'pointer',
    lineHeight: '16px',
  } as React.CSSProperties,

  exportButtonActive: {
    background: PRIMARY_LIGHT,
    border: `1px solid ${PRIMARY}`,
    borderRadius: '6px',
    color: TEXT_PRIMARY,
    fontSize: '12px',
    fontWeight: 600,
    fontFamily: 'Inter, sans-serif',
    padding: '4px 12px',
    cursor: 'pointer',
    lineHeight: '16px',
  } as React.CSSProperties,

  settingsButton: {
    background: 'transparent',
    border: `1px solid ${BORDER}`,
    borderRadius: '6px',
    color: TEXT_SECONDARY,
    fontSize: '12px',
    fontWeight: 500,
    fontFamily: 'Inter, sans-serif',
    padding: '4px 10px',
    cursor: 'pointer',
    lineHeight: '16px',
  } as React.CSSProperties,

  settingsButtonActive: {
    background: PRIMARY_LIGHT,
    border: `1px solid ${PRIMARY}`,
    borderRadius: '6px',
    color: TEXT_PRIMARY,
    fontSize: '12px',
    fontWeight: 500,
    fontFamily: 'Inter, sans-serif',
    padding: '4px 10px',
    cursor: 'pointer',
    lineHeight: '16px',
  } as React.CSSProperties,

  exportButtonDisabled: {
    background: SURFACE_DISABLED,
    border: `1px solid ${BORDER}`,
    borderRadius: '6px',
    color: TEXT_DISABLED,
    fontSize: '12px',
    fontWeight: 600,
    fontFamily: 'Inter, sans-serif',
    padding: '4px 12px',
    cursor: 'not-allowed',
    lineHeight: '16px',
  } as React.CSSProperties,
};
