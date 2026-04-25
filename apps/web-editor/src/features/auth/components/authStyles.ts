import type React from 'react';

const SURFACE = '#0D0D14';
const SURFACE_ELEVATED = '#1E1E2E';
const PRIMARY = '#7C3AED';
const PRIMARY_DARK = '#5B21B6';
const TEXT_PRIMARY = '#F0F0FA';
const TEXT_SECONDARY = '#8A8AA0';
const BORDER = '#252535';
const ERROR = '#EF4444';

export const authStyles = {
  page: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    background: SURFACE,
    fontFamily: 'Inter, sans-serif',
    padding: 16,
  } as React.CSSProperties,

  card: {
    width: '100%',
    maxWidth: 400,
    background: SURFACE_ELEVATED,
    borderRadius: 16,
    padding: 24,
    border: `1px solid ${BORDER}`,
  } as React.CSSProperties,

  title: {
    fontSize: 24,
    fontWeight: 700,
    color: TEXT_PRIMARY,
    margin: 0,
    marginBottom: 8,
    lineHeight: '32px',
  } as React.CSSProperties,

  subtitle: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    margin: 0,
    marginBottom: 24,
    lineHeight: '20px',
  } as React.CSSProperties,

  label: {
    display: 'block',
    fontSize: 12,
    fontWeight: 500,
    color: TEXT_SECONDARY,
    marginBottom: 4,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    lineHeight: '16px',
  } as React.CSSProperties,

  input: {
    display: 'block',
    width: '100%',
    padding: '8px 12px',
    fontSize: 14,
    fontFamily: 'Inter, sans-serif',
    color: TEXT_PRIMARY,
    background: SURFACE,
    border: `1px solid ${BORDER}`,
    borderRadius: 8,
    outline: 'none',
    marginBottom: 16,
    lineHeight: '20px',
  } as React.CSSProperties,

  inputError: {
    borderColor: ERROR,
  } as React.CSSProperties,

  button: {
    display: 'block',
    width: '100%',
    padding: '8px 16px',
    fontSize: 14,
    fontWeight: 600,
    fontFamily: 'Inter, sans-serif',
    color: TEXT_PRIMARY,
    background: PRIMARY,
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    marginTop: 8,
    lineHeight: '20px',
  } as React.CSSProperties,

  buttonHover: {
    background: PRIMARY_DARK,
  } as React.CSSProperties,

  buttonDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  } as React.CSSProperties,

  errorText: {
    color: ERROR,
    fontSize: 12,
    margin: 0,
    marginBottom: 12,
    lineHeight: '16px',
  } as React.CSSProperties,

  successText: {
    color: '#10B981',
    fontSize: 14,
    margin: 0,
    marginBottom: 12,
    lineHeight: '20px',
  } as React.CSSProperties,

  link: {
    color: PRIMARY,
    fontSize: 14,
    textDecoration: 'none',
    cursor: 'pointer',
  } as React.CSSProperties,

  footer: {
    marginTop: 24,
    textAlign: 'center' as const,
    fontSize: 14,
    color: TEXT_SECONDARY,
    lineHeight: '20px',
  } as React.CSSProperties,

  divider: {
    display: 'flex',
    alignItems: 'center',
    margin: '20px 0',
    gap: 12,
  } as React.CSSProperties,

  dividerText: {
    fontSize: 12,
    color: TEXT_SECONDARY,
    whiteSpace: 'nowrap' as const,
    flex: 'none',
  } as React.CSSProperties,

  oauthRow: {
    display: 'flex',
    gap: 12,
  } as React.CSSProperties,

  oauthButton: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '8px 16px',
    fontSize: 14,
    fontWeight: 500,
    fontFamily: 'Inter, sans-serif',
    color: TEXT_PRIMARY,
    background: SURFACE,
    border: `1px solid ${BORDER}`,
    borderRadius: 8,
    cursor: 'pointer',
    textDecoration: 'none',
    lineHeight: '20px',
  } as React.CSSProperties,

  fieldError: {
    color: ERROR,
    fontSize: 11,
    margin: 0,
    marginTop: -12,
    marginBottom: 12,
    lineHeight: '16px',
  } as React.CSSProperties,
} as const;
