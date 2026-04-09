import type React from 'react';

/** Dark theme color tokens for the AI Providers modal. */
export const SURFACE = '#0D0D14';
export const SURFACE_ALT = '#16161F';
export const SURFACE_ELEVATED = '#1E1E2E';
export const PRIMARY = '#7C3AED';
export const PRIMARY_DARK = '#5B21B6';
export const TEXT_PRIMARY = '#F0F0FA';
export const TEXT_SECONDARY = '#8A8AA0';
export const BORDER = '#252535';
export const SUCCESS = '#10B981';
export const ERROR = '#EF4444';

/** Inline CSSProperties objects for AI Providers modal layout and provider card components. */
export const aiProvidersModalStyles = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.75)',
    zIndex: 100,
  } as React.CSSProperties,

  modal: {
    position: 'fixed',
    top: '80px',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '560px',
    maxHeight: 'calc(100vh - 120px)',
    background: SURFACE_ELEVATED,
    borderRadius: '16px',
    zIndex: 101,
    display: 'flex',
    flexDirection: 'column',
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
    overflowY: 'auto',
    padding: '16px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    background: SURFACE,
  } as React.CSSProperties,

  footer: {
    flexShrink: 0,
    padding: '12px 24px',
    background: SURFACE_ELEVATED,
    borderTop: `1px solid ${BORDER}`,
    textAlign: 'center',
  } as React.CSSProperties,

  footerLink: {
    fontSize: '12px',
    fontWeight: 400,
    color: TEXT_SECONDARY,
    lineHeight: '16px',
    background: 'none',
    border: 'none',
    cursor: 'default',
    fontFamily: 'Inter, sans-serif',
  } as React.CSSProperties,

  loadingText: {
    fontSize: '14px',
    color: TEXT_SECONDARY,
    textAlign: 'center',
    padding: '32px 0',
  } as React.CSSProperties,

  errorText: {
    fontSize: '13px',
    color: ERROR,
    textAlign: 'center',
    padding: '16px 0',
  } as React.CSSProperties,

  // ── ProviderCard styles ──────────────────────────────────────────────────

  card: {
    background: SURFACE_ELEVATED,
    border: `1px solid ${BORDER}`,
    borderRadius: '8px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  } as React.CSSProperties,

  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  } as React.CSSProperties,

  providerIcon: {
    width: '32px',
    height: '32px',
    borderRadius: '6px',
    background: SURFACE_ALT,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    fontWeight: 600,
    color: PRIMARY,
    flexShrink: 0,
  } as React.CSSProperties,

  cardInfo: {
    flex: 1,
    minWidth: 0,
  } as React.CSSProperties,

  providerName: {
    fontSize: '14px',
    fontWeight: 600,
    color: TEXT_PRIMARY,
    lineHeight: '20px',
    margin: 0,
  } as React.CSSProperties,

  providerDescription: {
    fontSize: '12px',
    fontWeight: 400,
    color: TEXT_SECONDARY,
    lineHeight: '16px',
    margin: 0,
  } as React.CSSProperties,

  badgeRow: {
    display: 'flex',
    gap: '4px',
    flexWrap: 'wrap',
    marginTop: '2px',
  } as React.CSSProperties,

  typeBadge: {
    fontSize: '10px',
    fontWeight: 500,
    color: TEXT_SECONDARY,
    background: SURFACE_ALT,
    borderRadius: '4px',
    padding: '2px 6px',
    lineHeight: '14px',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  } as React.CSSProperties,

  connectedBadge: {
    fontSize: '11px',
    fontWeight: 500,
    color: SUCCESS,
    background: 'rgba(16, 185, 129, 0.1)',
    borderRadius: '4px',
    padding: '2px 8px',
    lineHeight: '16px',
  } as React.CSSProperties,

  cardActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexShrink: 0,
  } as React.CSSProperties,

  toggleButton: {
    fontSize: '12px', fontWeight: 500, color: TEXT_SECONDARY,
    background: SURFACE_ALT, border: `1px solid ${BORDER}`, borderRadius: '4px',
    padding: '4px 10px', cursor: 'pointer', lineHeight: '16px', fontFamily: 'Inter, sans-serif',
  } as React.CSSProperties,

  toggleButtonActive: {
    fontSize: '12px', fontWeight: 500, color: SUCCESS,
    background: 'rgba(16, 185, 129, 0.1)', border: `1px solid ${SUCCESS}`, borderRadius: '4px',
    padding: '4px 10px', cursor: 'pointer', lineHeight: '16px', fontFamily: 'Inter, sans-serif',
  } as React.CSSProperties,

  // ── Key input row ────────────────────────────────────────────────────────

  keyInputRow: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  } as React.CSSProperties,

  keyInput: {
    flex: 1,
    height: '36px',
    background: SURFACE_ALT,
    border: `1px solid ${BORDER}`,
    borderRadius: '6px',
    color: TEXT_PRIMARY,
    fontSize: '13px',
    fontFamily: 'Inter, sans-serif',
    padding: '0 12px',
    outline: 'none',
  } as React.CSSProperties,

  saveButton: {
    height: '36px', padding: '0 16px', background: PRIMARY, border: 'none',
    borderRadius: '6px', color: TEXT_PRIMARY, fontSize: '13px', fontWeight: 600,
    fontFamily: 'Inter, sans-serif', cursor: 'pointer', flexShrink: 0,
  } as React.CSSProperties,

  saveButtonDisabled: {
    height: '36px', padding: '0 16px', background: SURFACE_ALT, border: `1px solid ${BORDER}`,
    borderRadius: '6px', color: TEXT_SECONDARY, fontSize: '13px', fontWeight: 600,
    fontFamily: 'Inter, sans-serif', cursor: 'not-allowed', flexShrink: 0,
  } as React.CSSProperties,

  secondaryButton: {
    fontSize: '12px', fontWeight: 500, color: TEXT_SECONDARY, background: 'transparent',
    border: `1px solid ${BORDER}`, borderRadius: '4px', padding: '4px 10px',
    cursor: 'pointer', lineHeight: '16px', fontFamily: 'Inter, sans-serif',
  } as React.CSSProperties,

  deleteButton: {
    fontSize: '12px', fontWeight: 500, color: ERROR, background: 'transparent',
    border: `1px solid ${BORDER}`, borderRadius: '4px', padding: '4px 10px',
    cursor: 'pointer', lineHeight: '16px', fontFamily: 'Inter, sans-serif',
  } as React.CSSProperties,
} as const;
