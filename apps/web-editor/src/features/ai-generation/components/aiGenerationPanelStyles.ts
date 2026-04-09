import type React from 'react';

/** Dark theme color tokens for the AI Generation panel. */
export const SURFACE_ALT = '#16161F';
export const SURFACE_ELEVATED = '#1E1E2E';
export const PRIMARY = '#7C3AED';
export const PRIMARY_DARK = '#5B21B6';
export const TEXT_PRIMARY = '#F0F0FA';
export const TEXT_SECONDARY = '#8A8AA0';
export const BORDER = '#252535';
export const SUCCESS = '#10B981';
export const ERROR = '#EF4444';

/** Inline CSSProperties objects for the AI Generation panel and its sub-components. */
export const aiGenerationPanelStyles = {
  // ── Panel shell ───────────────────────────────────────────────────────────

  panel: {
    width: '320px',
    height: '100%',
    background: SURFACE_ALT,
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'Inter, sans-serif',
    overflow: 'hidden',
  } as React.CSSProperties,

  header: {
    height: '44px',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: '16px',
    paddingRight: '12px',
    borderBottom: `1px solid ${BORDER}`,
  } as React.CSSProperties,

  heading: {
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
    fontSize: '18px',
    lineHeight: '18px',
    cursor: 'pointer',
    padding: '4px 8px',
  } as React.CSSProperties,

  body: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  } as React.CSSProperties,

  // ── Type selector ─────────────────────────────────────────────────────────

  typeRow: {
    display: 'flex',
    gap: '8px',
  } as React.CSSProperties,

  typeButton: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    padding: '12px 4px',
    background: SURFACE_ELEVATED,
    border: `1px solid ${BORDER}`,
    borderRadius: '8px',
    color: TEXT_SECONDARY,
    fontSize: '11px',
    fontWeight: 500,
    fontFamily: 'Inter, sans-serif',
    cursor: 'pointer',
    lineHeight: '14px',
  } as React.CSSProperties,

  typeButtonSelected: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    padding: '12px 4px',
    background: PRIMARY,
    border: `1px solid ${PRIMARY}`,
    borderRadius: '8px',
    color: TEXT_PRIMARY,
    fontSize: '11px',
    fontWeight: 500,
    fontFamily: 'Inter, sans-serif',
    cursor: 'pointer',
    lineHeight: '14px',
  } as React.CSSProperties,

  typeIcon: {
    fontSize: '20px',
    lineHeight: '20px',
  } as React.CSSProperties,

  // ── Prompt ────────────────────────────────────────────────────────────────

  promptTextarea: {
    width: '100%',
    minHeight: '80px',
    maxHeight: '160px',
    resize: 'vertical',
    background: SURFACE_ELEVATED,
    border: `1px solid ${BORDER}`,
    borderRadius: '8px',
    color: TEXT_PRIMARY,
    fontSize: '13px',
    fontFamily: 'Inter, sans-serif',
    padding: '12px',
    outline: 'none',
    lineHeight: '18px',
    boxSizing: 'border-box',
  } as React.CSSProperties,

  charCount: {
    fontSize: '11px',
    color: TEXT_SECONDARY,
    textAlign: 'right',
    margin: '-8px 0 0 0',
    lineHeight: '14px',
  } as React.CSSProperties,

  // ── Options form ──────────────────────────────────────────────────────────

  optionsGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  } as React.CSSProperties,

  optionLabel: {
    fontSize: '12px',
    fontWeight: 500,
    color: TEXT_SECONDARY,
    lineHeight: '16px',
    margin: 0,
  } as React.CSSProperties,

  optionSelect: {
    width: '100%',
    height: '32px',
    background: SURFACE_ELEVATED,
    border: `1px solid ${BORDER}`,
    borderRadius: '8px',
    color: TEXT_PRIMARY,
    fontSize: '13px',
    fontFamily: 'Inter, sans-serif',
    padding: '0 8px',
    outline: 'none',
    cursor: 'pointer',
  } as React.CSSProperties,

  optionSlider: {
    width: '100%',
    accentColor: PRIMARY,
  } as React.CSSProperties,

  // ── Generate button ───────────────────────────────────────────────────────

  generateButton: {
    width: '100%',
    height: '40px',
    background: PRIMARY,
    border: 'none',
    borderRadius: '8px',
    color: TEXT_PRIMARY,
    fontSize: '14px',
    fontWeight: 600,
    fontFamily: 'Inter, sans-serif',
    cursor: 'pointer',
  } as React.CSSProperties,

  generateButtonDisabled: {
    width: '100%',
    height: '40px',
    background: SURFACE_ELEVATED,
    border: `1px solid ${BORDER}`,
    borderRadius: '8px',
    color: TEXT_SECONDARY,
    fontSize: '14px',
    fontWeight: 600,
    fontFamily: 'Inter, sans-serif',
    cursor: 'not-allowed',
  } as React.CSSProperties,

  // ── Progress ──────────────────────────────────────────────────────────────

  progressWrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    padding: '24px 0',
  } as React.CSSProperties,

  progressSpinner: {
    fontSize: '11px',
    color: TEXT_SECONDARY,
    lineHeight: '14px',
    margin: 0,
  } as React.CSSProperties,

  // ── Result states ─────────────────────────────────────────────────────────

  resultWrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    padding: '24px 0',
    textAlign: 'center',
  } as React.CSSProperties,

  successText: {
    fontSize: '14px',
    fontWeight: 600,
    color: SUCCESS,
    margin: 0,
    lineHeight: '20px',
  } as React.CSSProperties,

  assetAddedText: {
    fontSize: '12px',
    fontWeight: 400,
    color: TEXT_SECONDARY,
    margin: 0,
    lineHeight: '16px',
  } as React.CSSProperties,

  errorText: {
    fontSize: '13px',
    color: ERROR,
    margin: 0,
    lineHeight: '18px',
  } as React.CSSProperties,

  linkButton: {
    fontSize: '13px',
    fontWeight: 500,
    color: PRIMARY,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    fontFamily: 'Inter, sans-serif',
    textDecoration: 'underline',
  } as React.CSSProperties,

  secondaryButton: {
    width: '100%',
    height: '36px',
    background: SURFACE_ELEVATED,
    border: `1px solid ${BORDER}`,
    borderRadius: '8px',
    color: TEXT_PRIMARY,
    fontSize: '13px',
    fontWeight: 500,
    fontFamily: 'Inter, sans-serif',
    cursor: 'pointer',
  } as React.CSSProperties,

  disabledNotice: {
    fontSize: '12px',
    color: TEXT_SECONDARY,
    textAlign: 'center',
    margin: 0,
    lineHeight: '16px',
  } as React.CSSProperties,
} as const;
