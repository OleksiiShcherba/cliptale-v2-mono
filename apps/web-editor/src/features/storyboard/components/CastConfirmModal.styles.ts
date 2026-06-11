/**
 * Co-located styles for CastConfirmModal (F14).
 *
 * Uses shared design-guide tokens from nodeStyles — no raw inline hex.
 */
import type React from 'react';

import { BORDER } from './nodeStyles';

export const castConfirmModalStyles = {
  // AC-02: full-viewport dimmed backdrop; clicking it (outside the dialog) closes.
  backdrop: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0, 0, 0, 0.5)',
    zIndex: 1000,
  } as React.CSSProperties,
  // AC-02: centered dialog shell — every modal state renders inside this.
  dialog: {
    background: '#fff',
    borderRadius: '8px',
    border: `1px solid ${BORDER}`,
    padding: '1.5rem',
    maxWidth: '640px',
    width: '90%',
    maxHeight: '85vh',
    overflowY: 'auto',
    outline: 'none',
    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.25)',
  } as React.CSSProperties,
  entryEditor: {
    marginBottom: '1rem',
    padding: '0.5rem',
    border: `1px solid ${BORDER}`,
  } as React.CSSProperties,
} as const;
