/**
 * Inline style tokens for BlockingLoader.
 *
 * Full-screen blocking overlay rendered during an active pipeline run phase.
 * Follows the inline-style convention used throughout the web-editor.
 */
import type React from 'react';

import { TEXT_PRIMARY, TEXT_SECONDARY, SURFACE, BORDER } from './storyboardPageStyles';

const FONT = 'Inter, sans-serif';

export const blockingLoaderStyles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 9999,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    background: 'rgba(0, 0, 0, 0.65)',
    backdropFilter: 'blur(2px)',
    fontFamily: FONT,
    color: TEXT_PRIMARY,
  } as React.CSSProperties,

  label: {
    fontSize: 18,
    fontWeight: 600,
    color: TEXT_PRIMARY,
    textAlign: 'center',
    maxWidth: 400,
    lineHeight: '28px',
  } as React.CSSProperties,

  cancelButton: {
    marginTop: 8,
    height: 36,
    padding: '0 16px',
    border: `1px solid ${BORDER}`,
    borderRadius: 8,
    background: SURFACE,
    color: TEXT_SECONDARY,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    fontFamily: FONT,
  } as React.CSSProperties,
} as const;
