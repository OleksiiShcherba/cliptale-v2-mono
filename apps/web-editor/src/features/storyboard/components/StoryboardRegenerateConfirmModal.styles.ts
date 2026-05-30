import type React from 'react';

import {
  BORDER,
  ERROR,
  PRIMARY,
  SURFACE_ELEVATED,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from './storyboardPageStyles';

export const storyboardRegenerateConfirmModalStyles = {
  backdrop: {
    position: 'fixed' as const,
    inset: 0,
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    background: 'rgba(13, 13, 20, 0.76)',
    backdropFilter: 'blur(2px)',
  } as React.CSSProperties,

  dialog: {
    width: 'min(420px, 100%)',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '14px',
    padding: '20px',
    background: SURFACE_ELEVATED,
    border: `1px solid ${BORDER}`,
    borderRadius: '12px',
    boxShadow: '0 24px 64px rgba(0, 0, 0, 0.42)',
    outline: 'none',
  } as React.CSSProperties,

  title: {
    margin: 0,
    color: TEXT_PRIMARY,
    fontSize: '15px',
    fontWeight: 600,
    lineHeight: '20px',
  } as React.CSSProperties,

  body: {
    color: TEXT_SECONDARY,
    fontSize: '12px',
    fontWeight: 400,
    lineHeight: '18px',
  } as React.CSSProperties,

  lossList: {
    margin: '4px 0 0',
    paddingLeft: '18px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
    color: TEXT_PRIMARY,
    fontSize: '12px',
    lineHeight: '18px',
  } as React.CSSProperties,

  lossItem: {
    fontWeight: 500,
  } as React.CSSProperties,

  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
    marginTop: '4px',
  } as React.CSSProperties,

  cancelButton: {
    height: '34px',
    padding: '0 14px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: BORDER,
    borderRadius: '8px',
    background: 'transparent',
    color: TEXT_PRIMARY,
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 600,
    fontFamily: 'Inter, sans-serif',
    lineHeight: '16px',
  } as React.CSSProperties,

  confirmButton: {
    height: '34px',
    padding: '0 14px',
    border: 'none',
    borderRadius: '8px',
    background: ERROR,
    color: '#FFFFFF',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 600,
    fontFamily: 'Inter, sans-serif',
    lineHeight: '16px',
  } as React.CSSProperties,

  accent: {
    color: PRIMARY,
  } as React.CSSProperties,
} as const;
