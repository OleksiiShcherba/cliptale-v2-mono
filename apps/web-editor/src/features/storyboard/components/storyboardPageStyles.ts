/**
 * Styles for StoryboardPage shell.
 *
 * Follows the inline-style + `*.styles.ts` convention used throughout
 * the web-editor (see generateWizardPage.styles.ts, topBar.styles.ts).
 * No CSS files — no CSS-in-JS library.
 */
import type React from 'react';

// Design-guide tokens (design-guide.md §3)
const SURFACE = '#0D0D14';
const SURFACE_ALT = '#16161F';
const SURFACE_ELEVATED = '#1E1E2E';
const BORDER = '#252535';
const TEXT_PRIMARY = '#F0F0FA';
const TEXT_SECONDARY = '#8A8AA0';
const PRIMARY = '#7C3AED';
const PRIMARY_LIGHT = '#4C1D95';
const ERROR = '#EF4444';

export { SURFACE, SURFACE_ALT, SURFACE_ELEVATED, BORDER, TEXT_PRIMARY, TEXT_SECONDARY, PRIMARY, PRIMARY_LIGHT, ERROR };

export const storyboardPageStyles = {
  // ── Root page shell ────────────────────────────────────────────────────────

  page: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100vh',
    overflow: 'hidden',
    background: SURFACE,
    color: TEXT_PRIMARY,
    fontFamily: 'Inter, sans-serif',
  } as React.CSSProperties,

  // ── Top bar ────────────────────────────────────────────────────────────────

  topBar: {
    flexShrink: 0,
    height: '48px',
    display: 'flex',
    alignItems: 'center',
    background: SURFACE_ELEVATED,
    borderBottom: `1px solid ${BORDER}`,
    position: 'relative' as const,
    paddingLeft: '16px',
    paddingRight: '16px',
  } as React.CSSProperties,

  topBarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexShrink: 0,
    minWidth: '120px',
  } as React.CSSProperties,

  topBarCenter: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  } as React.CSSProperties,

  topBarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexShrink: 0,
    minWidth: '120px',
    justifyContent: 'flex-end',
  } as React.CSSProperties,

  logoText: {
    fontSize: '14px',
    fontWeight: 700,
    color: TEXT_PRIMARY,
    letterSpacing: '-0.01em',
  } as React.CSSProperties,

  autosaveIndicator: {
    fontSize: '12px',
    fontWeight: 400,
    color: TEXT_SECONDARY,
  } as React.CSSProperties,

  iconButton: {
    background: 'transparent',
    border: 'none',
    padding: '4px',
    borderRadius: '4px',
    cursor: 'pointer',
    color: TEXT_SECONDARY,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
  } as React.CSSProperties,

  // ── Body (sidebar + canvas) ────────────────────────────────────────────────

  body: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
  } as React.CSSProperties,

  // ── Left sidebar ───────────────────────────────────────────────────────────

  sidebar: {
    flexShrink: 0,
    width: '48px',
    background: SURFACE_ALT,
    borderRight: `1px solid ${BORDER}`,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    paddingTop: '8px',
    gap: '4px',
  } as React.CSSProperties,

  sidebarTabActive: {
    width: '36px',
    height: '36px',
    borderRadius: '8px',
    background: PRIMARY_LIGHT,
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: PRIMARY,
    flexShrink: 0,
  } as React.CSSProperties,

  sidebarTabInactive: {
    width: '36px',
    height: '36px',
    borderRadius: '8px',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: TEXT_SECONDARY,
    flexShrink: 0,
  } as React.CSSProperties,

  // ── Canvas area ────────────────────────────────────────────────────────────

  canvasArea: {
    flex: 1,
    background: SURFACE,
    position: 'relative' as const,
    overflow: 'hidden',
  } as React.CSSProperties,

  canvasPlaceholder: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: TEXT_SECONDARY,
    fontSize: '14px',
    fontWeight: 400,
    pointerEvents: 'none' as const,
  } as React.CSSProperties,

  // ── Bottom bar ─────────────────────────────────────────────────────────────

  bottomBar: {
    flexShrink: 0,
    height: '56px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 24px',
    background: SURFACE_ELEVATED,
    borderTop: `1px solid ${BORDER}`,
  } as React.CSSProperties,

  bottomBarLabel: {
    fontSize: '12px',
    fontWeight: 500,
    color: TEXT_SECONDARY,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
  } as React.CSSProperties,

  backButton: {
    background: 'transparent',
    border: `1px solid ${BORDER}`,
    padding: '0 16px',
    height: '36px',
    fontSize: '12px',
    fontWeight: 500,
    color: TEXT_PRIMARY,
    cursor: 'pointer',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  } as React.CSSProperties,

  nextButton: {
    background: PRIMARY,
    border: 'none',
    padding: '0 16px',
    height: '36px',
    fontSize: '12px',
    fontWeight: 500,
    color: '#FFFFFF',
    cursor: 'pointer',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  } as React.CSSProperties,

  // ── Canvas toolbar (floating above canvas, bottom-right) ───────────────────

  canvasToolbar: {
    position: 'absolute' as const,
    bottom: '16px',
    right: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    zIndex: 10,
  } as React.CSSProperties,

  canvasToolbarButton: {
    background: SURFACE_ELEVATED,
    border: `1px solid ${BORDER}`,
    borderRadius: '8px',
    padding: '0 16px',
    height: '36px',
    fontSize: '12px',
    fontWeight: 500,
    color: TEXT_PRIMARY,
    cursor: 'pointer',
    fontFamily: 'Inter, sans-serif',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  } as React.CSSProperties,

  canvasToolbarButtonDisabled: {
    background: SURFACE_ELEVATED,
    border: `1px solid ${BORDER}`,
    borderRadius: '8px',
    padding: '0 16px',
    height: '36px',
    fontSize: '12px',
    fontWeight: 500,
    color: TEXT_SECONDARY,
    cursor: 'not-allowed',
    fontFamily: 'Inter, sans-serif',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    opacity: 0.5,
  } as React.CSSProperties,

  // ── Ghost drag clone portal ────────────────────────────────────────────────

  ghostClone: {
    position: 'fixed' as const,
    pointerEvents: 'none' as const,
    zIndex: 9999,
    opacity: 1,
    transform: 'translate(-50%, -50%)',
  } as React.CSSProperties,

} as const;
