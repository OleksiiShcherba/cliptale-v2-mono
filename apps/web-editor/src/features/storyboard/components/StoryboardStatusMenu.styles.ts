import type React from 'react';

import {
  BORDER,
  ERROR,
  SURFACE,
  SURFACE_ELEVATED,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from './storyboardPageStyles';

export const storyboardStatusMenuStyles = {
  // Wrapper kept inline-flex so the kebab sits at the block's trailing edge.
  root: {
    position: 'relative' as const,
    flexShrink: 0,
    display: 'inline-flex',
  } as React.CSSProperties,

  // The kebab is always in the DOM (and the tab order) so keyboard users can
  // reach it; it is visually muted until the block is hovered or focused.
  trigger: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    padding: 0,
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: '6px',
    background: 'transparent',
    color: TEXT_SECONDARY,
    cursor: 'pointer',
    lineHeight: 0,
    opacity: 0.55,
    transition: 'opacity 0.12s ease, background 0.12s ease, border-color 0.12s ease',
  } as React.CSSProperties,

  triggerRevealed: {
    opacity: 1,
    background: SURFACE,
    borderColor: BORDER,
  } as React.CSSProperties,

  triggerOpen: {
    opacity: 1,
    background: SURFACE,
    borderColor: BORDER,
    color: TEXT_PRIMARY,
  } as React.CSSProperties,

  menu: {
    position: 'absolute' as const,
    top: 'calc(100% + 4px)',
    right: 0,
    zIndex: 20,
    minWidth: '160px',
    display: 'flex',
    flexDirection: 'column' as const,
    padding: '4px',
    background: SURFACE_ELEVATED,
    border: `1px solid ${BORDER}`,
    borderRadius: '8px',
    boxShadow: '0 12px 28px rgba(0, 0, 0, 0.28)',
  } as React.CSSProperties,

  item: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    padding: '8px 10px',
    border: 'none',
    borderRadius: '6px',
    background: 'transparent',
    color: TEXT_PRIMARY,
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 500,
    fontFamily: 'Inter, sans-serif',
    lineHeight: '16px',
    textAlign: 'left' as const,
  } as React.CSSProperties,

  itemDestructive: {
    color: ERROR,
  } as React.CSSProperties,
} as const;
