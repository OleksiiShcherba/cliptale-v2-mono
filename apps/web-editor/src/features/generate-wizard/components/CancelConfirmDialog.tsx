/**
 * CancelConfirmDialog — modal confirmation shown when the user presses Cancel
 * in the wizard footer. Choosing "Discard" propagates to the parent via
 * `onDiscard`; "Keep editing" / Escape / backdrop-click calls `onKeepEditing`.
 */

import React, { useEffect } from 'react';

// ---------------------------------------------------------------------------
// Design tokens (local)
// ---------------------------------------------------------------------------

const SURFACE_ELEVATED = '#1E1E2E';
const BORDER = '#252535';
const TEXT_PRIMARY = '#F0F0FA';
const TEXT_SECONDARY = '#8A8AA0';
const ERROR = '#EF4444';

// Typography — label token (design-guide §3)
const LABEL_FONT_SIZE = '12px';
const LABEL_FONT_WEIGHT = 500;
const LABEL_LINE_HEIGHT = '16px';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CancelConfirmDialogProps {
  onKeepEditing: () => void;
  onDiscard: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CancelConfirmDialog({ onKeepEditing, onDiscard }: CancelConfirmDialogProps): React.ReactElement {
  // Trap Escape to close without discarding.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        onKeepEditing();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onKeepEditing]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-dialog-title"
      style={styles.backdrop}
      onClick={(e) => {
        // Backdrop click closes without deleting.
        if (e.target === e.currentTarget) onKeepEditing();
      }}
    >
      <div style={styles.panel}>
        <h2 id="cancel-dialog-title" style={styles.title}>
          Discard draft?
        </h2>
        <p style={styles.body}>Your progress will be lost.</p>
        <div style={styles.actions}>
          <button
            type="button"
            onClick={onKeepEditing}
            style={styles.keepButton}
          >
            Keep editing
          </button>
          <button
            type="button"
            onClick={onDiscard}
            style={styles.discardButton}
          >
            Discard
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
  backdrop: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  } as React.CSSProperties,

  panel: {
    background: SURFACE_ELEVATED,
    border: `1px solid ${BORDER}`,
    borderRadius: '8px',
    padding: '24px',
    width: '400px',
    maxWidth: 'calc(100vw - 32px)',
    minHeight: '200px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
    fontFamily: 'Inter, sans-serif',
  } as React.CSSProperties,

  title: {
    margin: 0,
    fontSize: '20px',
    fontWeight: 600,
    lineHeight: '28px',
    color: TEXT_PRIMARY,
  } as React.CSSProperties,

  body: {
    margin: 0,
    flex: 1,
    fontSize: '14px',
    fontWeight: 400,
    lineHeight: '20px',
    color: TEXT_SECONDARY,
  } as React.CSSProperties,

  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
  } as React.CSSProperties,

  keepButton: {
    background: 'transparent',
    border: 'none',
    padding: '0 12px',
    height: '40px',
    fontSize: LABEL_FONT_SIZE,
    fontWeight: LABEL_FONT_WEIGHT,
    lineHeight: LABEL_LINE_HEIGHT,
    color: TEXT_SECONDARY,
    cursor: 'pointer',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
  } as React.CSSProperties,

  discardButton: {
    background: ERROR,
    border: 'none',
    padding: '0 16px',
    height: '40px',
    fontSize: LABEL_FONT_SIZE,
    fontWeight: LABEL_FONT_WEIGHT,
    lineHeight: LABEL_LINE_HEIGHT,
    color: '#FFFFFF',
    cursor: 'pointer',
    borderRadius: '8px',
    fontFamily: 'Inter, sans-serif',
  } as React.CSSProperties,
} as const;
