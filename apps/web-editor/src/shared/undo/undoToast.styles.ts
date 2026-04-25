import type React from 'react';

// Design-guide tokens (§3 Dark Theme)
const SURFACE_ELEVATED = '#1E1E2E';
const TEXT_PRIMARY = '#F0F0FA';
const TEXT_SECONDARY = '#8A8AA0';
const PRIMARY = '#7C3AED';
const BORDER = '#252535';

/** Styles for the UndoToast component. */
export const undoToastStyles: Record<string, React.CSSProperties> = {
  /**
   * Fixed-position container anchored to the bottom-center of the viewport.
   * z-index 9000 puts it above modals (which typically use 1000-8000).
   */
  container: {
    position: 'fixed',
    bottom: 24,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 9000,
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '12px 16px',
    background: SURFACE_ELEVATED,
    border: `1px solid ${BORDER}`,
    borderRadius: 8,
    boxShadow: '0 4px 24px rgba(0, 0, 0, 0.48)',
    fontFamily: 'Inter, sans-serif',
    minWidth: 280,
    maxWidth: 480,
    pointerEvents: 'all',
  },

  label: {
    flex: 1,
    fontSize: 14,
    fontWeight: 400,
    lineHeight: '20px',
    color: TEXT_PRIMARY,
    margin: 0,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },

  undoButton: {
    flexShrink: 0,
    padding: '4px 12px',
    background: 'transparent',
    color: PRIMARY,
    border: `1px solid ${PRIMARY}`,
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 500,
    lineHeight: '16px',
    fontFamily: 'Inter, sans-serif',
    cursor: 'pointer',
    transition: 'background 0.15s',
  },

  dismissButton: {
    flexShrink: 0,
    padding: '4px 8px',
    background: 'transparent',
    color: TEXT_SECONDARY,
    border: 'none',
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 400,
    fontFamily: 'Inter, sans-serif',
    cursor: 'pointer',
    lineHeight: '16px',
  },
};
