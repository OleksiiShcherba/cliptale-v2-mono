import type React from 'react';

// Design tokens
const SURFACE_ALT = '#16161F';
const BORDER = '#252535';
const TEXT_PRIMARY = '#F0F0FA';
const TEXT_SECONDARY = '#8A8AA0';
const PRIMARY = '#7C3AED';
const WARNING = '#F59E0B';
const SURFACE_ELEVATED = '#1E1E2E';

/**
 * Height of each track row in pixels.
 * Shared by ClipLane, TrackList (FixedSizeList itemSize), and ClipLaneGhosts.
 * Reducing this value makes more tracks visible in the timeline without scrolling.
 */
export const TRACK_ROW_HEIGHT = 36;

export const styles: Record<string, React.CSSProperties> = {
  header: {
    width: 160,
    height: TRACK_ROW_HEIGHT,
    flexShrink: 0,
    background: SURFACE_ALT,
    borderRight: `1px solid ${BORDER}`,
    borderBottom: `1px solid ${BORDER}`,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '0 4px 0 8px',
    overflow: 'hidden',
    transition: 'background 0.1s ease, border-top 0.1s ease',
  },
  headerDragging: {
    opacity: 0.5,
  },
  headerDropTarget: {
    borderTop: `2px solid ${PRIMARY}`,
    background: `${PRIMARY}18`,
  },
  dragHandle: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: 16,
    height: '100%',
    cursor: 'grab',
    color: TEXT_SECONDARY,
    userSelect: 'none',
  },
  nameArea: {
    flex: 1,
    overflow: 'hidden',
    minWidth: 0,
  },
  nameButton: {
    background: 'none',
    border: 'none',
    color: TEXT_PRIMARY,
    fontSize: 12,
    fontWeight: 400,
    fontFamily: 'Inter, sans-serif',
    cursor: 'pointer',
    padding: 0,
    textAlign: 'left',
    width: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  nameInput: {
    background: SURFACE_ELEVATED,
    border: `1px solid ${PRIMARY}`,
    borderRadius: 4,
    color: TEXT_PRIMARY,
    fontSize: 12,
    fontFamily: 'Inter, sans-serif',
    padding: '1px 4px',
    width: '100%',
    outline: 'none',
  },
  controls: {
    display: 'flex',
    gap: 2,
    flexShrink: 0,
  },
  controlButton: {
    width: 20,
    height: 20,
    background: 'transparent',
    border: `1px solid ${BORDER}`,
    borderRadius: 4,
    color: TEXT_SECONDARY,
    fontSize: 9,
    fontFamily: 'Inter, sans-serif',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    padding: 0,
  },
  controlButtonActive: {
    background: WARNING,
    borderColor: WARNING,
    color: '#000',
  },
  controlButtonLocked: {
    background: PRIMARY,
    borderColor: PRIMARY,
    color: '#fff',
  },
  controlButtonDelete: {
    width: 20,
    height: 20,
    background: 'transparent',
    border: `1px solid ${BORDER}`,
    borderRadius: 4,
    color: TEXT_SECONDARY,
    fontSize: 9,
    fontFamily: 'Inter, sans-serif',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    padding: 0,
  },
  controlButtonDeleteHover: {
    background: '#EF4444',
    borderColor: '#EF4444',
    color: '#fff',
  },
};
