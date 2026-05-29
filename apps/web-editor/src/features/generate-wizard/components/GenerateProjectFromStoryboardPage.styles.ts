import type React from 'react';

const SURFACE = '#0D0D14';
const SURFACE_ALT = '#16161F';
const SURFACE_ELEVATED = '#1E1E2E';
const BORDER = '#252535';
const TEXT_PRIMARY = '#F0F0FA';
const TEXT_SECONDARY = '#8A8AA0';
const PRIMARY = '#7C3AED';
const ERROR = '#EF4444';

export const generateProjectFromStoryboardPageStyles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    background: SURFACE,
    color: TEXT_PRIMARY,
    fontFamily: 'Inter, sans-serif',
  } as React.CSSProperties,
  panel: {
    width: 'min(440px, 100%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    padding: 24,
    background: SURFACE_ALT,
    border: `1px solid ${BORDER}`,
    borderRadius: 8,
    textAlign: 'center',
  } as React.CSSProperties,
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 9999,
    background: PRIMARY,
  } as React.CSSProperties,
  heading: {
    margin: 0,
    fontSize: 20,
    lineHeight: '28px',
    fontWeight: 600,
    color: TEXT_PRIMARY,
  } as React.CSSProperties,
  message: {
    margin: 0,
    fontSize: 14,
    lineHeight: '20px',
    color: TEXT_SECONDARY,
  } as React.CSSProperties,
  error: {
    margin: 0,
    fontSize: 14,
    lineHeight: '20px',
    color: ERROR,
  } as React.CSSProperties,
  actions: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 4,
  } as React.CSSProperties,
  primaryButton: {
    height: 36,
    padding: '0 14px',
    border: 0,
    borderRadius: 8,
    background: PRIMARY,
    color: TEXT_PRIMARY,
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
  } as React.CSSProperties,
  secondaryLink: {
    minHeight: 36,
    display: 'inline-flex',
    alignItems: 'center',
    padding: '0 14px',
    border: `1px solid ${BORDER}`,
    borderRadius: 8,
    background: SURFACE_ELEVATED,
    color: TEXT_PRIMARY,
    fontSize: 14,
    fontWeight: 500,
    textDecoration: 'none',
  } as React.CSSProperties,
} as const;
