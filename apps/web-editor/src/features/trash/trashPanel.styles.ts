import type React from 'react';

// Design-guide tokens (§3 Dark Theme)
const SURFACE = '#0D0D14';
const SURFACE_ALT = '#16161F';
const SURFACE_ELEVATED = '#1E1E2E';
const TEXT_PRIMARY = '#F0F0FA';
const TEXT_SECONDARY = '#8A8AA0';
const BORDER = '#252535';
const PRIMARY = '#7C3AED';
const SUCCESS = '#10B981';
const ERROR = '#EF4444';

/** Styles for the TrashPanel component. */
export const trashPanelStyles: Record<string, React.CSSProperties> = {
  page: {
    width: '100vw',
    height: '100vh',
    background: SURFACE,
    fontFamily: 'Inter, sans-serif',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },

  topBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '0 24px',
    height: 56,
    borderBottom: `1px solid ${BORDER}`,
    background: SURFACE_ALT,
    flexShrink: 0,
  },

  backButton: {
    background: 'transparent',
    border: 'none',
    color: PRIMARY,
    fontSize: 14,
    fontWeight: 500,
    fontFamily: 'Inter, sans-serif',
    cursor: 'pointer',
    padding: '4px 0',
    lineHeight: '20px',
  },

  pageTitle: {
    fontSize: 20,
    fontWeight: 600,
    color: TEXT_PRIMARY,
    margin: 0,
    lineHeight: '28px',
  },

  content: {
    flex: 1,
    overflowY: 'auto',
    padding: 24,
  },

  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    maxWidth: 720,
    margin: '0 auto',
  },

  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '12px 16px',
    background: SURFACE_ELEVATED,
    border: `1px solid ${BORDER}`,
    borderRadius: 8,
  },

  kindBadge: {
    flexShrink: 0,
    fontSize: 11,
    fontWeight: 500,
    fontFamily: 'Inter, sans-serif',
    lineHeight: '16px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
    padding: '4px 8px',
    borderRadius: 4,
    background: '#252535',
    color: TEXT_SECONDARY,
  },

  itemName: {
    flex: 1,
    fontSize: 14,
    fontWeight: 400,
    color: TEXT_PRIMARY,
    lineHeight: '20px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    margin: 0,
  },

  deletedAt: {
    flexShrink: 0,
    fontSize: 12,
    fontWeight: 400,
    color: TEXT_SECONDARY,
    lineHeight: '16px',
    margin: 0,
  },

  restoreButton: {
    flexShrink: 0,
    padding: '4px 12px',
    background: 'transparent',
    color: SUCCESS,
    border: `1px solid ${SUCCESS}`,
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 500,
    fontFamily: 'Inter, sans-serif',
    cursor: 'pointer',
    lineHeight: '16px',
    transition: 'background 0.15s',
  },

  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    gap: 8,
    paddingTop: 80,
    textAlign: 'center' as const,
  },

  emptyTitle: {
    fontSize: 20,
    fontWeight: 600,
    color: TEXT_PRIMARY,
    margin: 0,
  },

  emptySubtitle: {
    fontSize: 14,
    fontWeight: 400,
    color: TEXT_SECONDARY,
    margin: 0,
  },

  errorText: {
    color: ERROR,
    fontSize: 14,
    textAlign: 'center' as const,
    padding: '24px 0',
    margin: 0,
  },

  loadingText: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    textAlign: 'center' as const,
    padding: '24px 0',
    margin: 0,
  },

  restoreSuccessText: {
    color: SUCCESS,
    fontSize: 12,
    margin: 0,
  },
};
