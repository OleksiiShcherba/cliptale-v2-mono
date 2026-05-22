import type React from 'react';

import {
  BORDER,
  ERROR,
  PRIMARY,
  PRIMARY_DARK,
  SURFACE,
  SURFACE_ELEVATED,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from './storyboardPageStyles';

export const storyboardPlanControlStyles = {
  control: {
    position: 'absolute' as const,
    top: '16px',
    left: '16px',
    zIndex: 12,
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    maxWidth: 'min(560px, calc(100% - 32px))',
    padding: '8px',
    background: SURFACE_ELEVATED,
    border: `1px solid ${BORDER}`,
    borderRadius: '8px',
    boxShadow: '0 12px 28px rgba(0, 0, 0, 0.24)',
  } as React.CSSProperties,

  illustrationControl: {
    top: '78px',
  } as React.CSSProperties,

  controlText: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
    minWidth: 0,
    flex: '1 1 auto',
  } as React.CSSProperties,

  controlTitle: {
    color: TEXT_PRIMARY,
    fontSize: '12px',
    fontWeight: 600,
    lineHeight: '16px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,

  controlMeta: {
    color: TEXT_SECONDARY,
    fontSize: '11px',
    fontWeight: 400,
    lineHeight: '16px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,

  controlError: {
    color: ERROR,
    fontSize: '11px',
    fontWeight: 400,
    lineHeight: '16px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,

  button: {
    flexShrink: 0,
    height: '32px',
    padding: '0 12px',
    border: 'none',
    borderRadius: '8px',
    background: PRIMARY,
    color: '#FFFFFF',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 600,
    fontFamily: 'Inter, sans-serif',
    lineHeight: '16px',
  } as React.CSSProperties,

  buttonDisabled: {
    flexShrink: 0,
    height: '32px',
    padding: '0 12px',
    border: 'none',
    borderRadius: '8px',
    background: PRIMARY_DARK,
    color: '#FFFFFF',
    cursor: 'not-allowed',
    opacity: 0.65,
    fontSize: '12px',
    fontWeight: 600,
    fontFamily: 'Inter, sans-serif',
    lineHeight: '16px',
  } as React.CSSProperties,

  referencePreview: {
    flexShrink: 0,
    width: '40px',
    height: '40px',
    borderRadius: '8px',
    border: `1px solid ${BORDER}`,
    background: SURFACE,
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  } as React.CSSProperties,

  referencePreviewImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
    display: 'block',
  } as React.CSSProperties,

  referencePreviewFallback: {
    color: TEXT_SECONDARY,
    fontSize: '10px',
    fontWeight: 600,
    lineHeight: '12px',
    textAlign: 'center' as const,
    padding: '4px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
  } as React.CSSProperties,

  referencePreviewSpinner: {
    width: '12px',
    height: '12px',
    borderRadius: '999px',
    border: `2px solid ${BORDER}`,
    borderTopColor: PRIMARY,
    flexShrink: 0,
    animation: 'storyboard-reference-spin 0.8s linear infinite',
  } as React.CSSProperties,

  overlay: {
    position: 'absolute' as const,
    inset: 0,
    zIndex: 50,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    background: 'rgba(13, 13, 20, 0.76)',
    backdropFilter: 'blur(2px)',
  } as React.CSSProperties,

  overlayPanel: {
    width: 'min(360px, 100%)',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '10px',
    padding: '20px',
    background: SURFACE_ELEVATED,
    border: `1px solid ${BORDER}`,
    borderRadius: '8px',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.38)',
    textAlign: 'center' as const,
  } as React.CSSProperties,

  spinner: {
    width: '28px',
    height: '28px',
    borderRadius: '9999px',
    border: `3px solid ${BORDER}`,
    borderTopColor: PRIMARY,
  } as React.CSSProperties,

  overlayTitle: {
    color: TEXT_PRIMARY,
    fontSize: '14px',
    fontWeight: 600,
    lineHeight: '20px',
  } as React.CSSProperties,

  overlayText: {
    color: TEXT_SECONDARY,
    fontSize: '12px',
    fontWeight: 400,
    lineHeight: '18px',
  } as React.CSSProperties,
} as const;
