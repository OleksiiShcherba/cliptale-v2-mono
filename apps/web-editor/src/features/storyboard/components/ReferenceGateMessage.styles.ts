/**
 * Co-located styles for ReferenceGateMessage / UnlinkedScenesMessage (T10).
 *
 * Uses shared design-guide tokens from nodeStyles — no raw inline hex.
 */
import type React from 'react';

import {
  ACCENT_LIGHT,
  ERROR_BORDER,
  ERROR_LIGHT,
  ERROR_SURFACE,
  PRIMARY_LIGHT,
  TEXT_PRIMARY,
} from './nodeStyles';

export const referenceGateMessageStyles = {
  root: {
    background: ERROR_SURFACE,
    border: `1px solid ${ERROR_LIGHT}`,
    borderRadius: 8,
    padding: '16px 20px',
    color: TEXT_PRIMARY,
    fontFamily: 'Inter, sans-serif',
    fontSize: 14,
  } as React.CSSProperties,

  heading: {
    margin: '0 0 12px',
    fontWeight: 600,
    color: ERROR_LIGHT,
  } as React.CSSProperties,

  list: {
    margin: 0,
    padding: 0,
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  } as React.CSSProperties,

  listItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  } as React.CSSProperties,

  blockName: {
    flex: 1,
  } as React.CSSProperties,

  retryButton: {
    background: 'transparent',
    border: `1px solid ${PRIMARY_LIGHT}`,
    borderRadius: 6,
    color: ACCENT_LIGHT,
    fontSize: 12,
    padding: '4px 10px',
    cursor: 'pointer',
    fontFamily: 'Inter, sans-serif',
  } as React.CSSProperties,

  deleteButton: {
    background: 'transparent',
    border: `1px solid ${ERROR_BORDER}`,
    borderRadius: 6,
    color: ERROR_LIGHT,
    fontSize: 12,
    padding: '4px 10px',
    cursor: 'pointer',
    fontFamily: 'Inter, sans-serif',
  } as React.CSSProperties,
} as const;
