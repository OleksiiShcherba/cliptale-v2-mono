/**
 * Inline styles for ZoomToolbar component.
 *
 * Follows the inline-style + `*.styles.ts` convention.
 * Design-guide tokens: design-guide.md §3.
 */
import type React from 'react';

// Design-guide tokens (repeated here for module isolation — single source is design-guide.md §3)
const SURFACE_ELEVATED = '#1E1E2E';
const BORDER = '#252535';
const TEXT_PRIMARY = '#F0F0FA';

export const zoomToolbarStyles = {
  /** Wrapper: absolute bottom-left of canvas, z-index 10 */
  toolbar: {
    position: 'absolute' as const,
    bottom: '16px',
    left: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    zIndex: 10,
    background: SURFACE_ELEVATED,
    border: `1px solid ${BORDER}`,
    borderRadius: '8px',
    padding: '0 4px',
    height: '36px',
  } as React.CSSProperties,

  /** "+" and "−" icon buttons */
  button: {
    background: 'transparent',
    border: 'none',
    borderRadius: '4px',
    width: '28px',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    color: TEXT_PRIMARY,
    fontFamily: 'Inter, sans-serif',
    fontSize: '16px',
    fontWeight: 400,
    flexShrink: 0,
  } as React.CSSProperties,

  /** Percentage readout label */
  label: {
    fontSize: '12px',
    fontWeight: 500,
    color: TEXT_PRIMARY,
    fontFamily: 'Inter, sans-serif',
    minWidth: '40px',
    textAlign: 'center' as const,
    letterSpacing: '-0.01em',
    userSelect: 'none' as const,
  } as React.CSSProperties,

  /** Thin vertical divider between elements */
  divider: {
    width: '1px',
    height: '16px',
    background: BORDER,
    flexShrink: 0,
    margin: '0 4px',
  } as React.CSSProperties,
} as const;
