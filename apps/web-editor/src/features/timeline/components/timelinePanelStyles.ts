import React from 'react';

import { SCROLLBAR_HEIGHT } from './ScrollbarStrip';

// Design tokens
export const PLAYHEAD_COLOR = '#EF4444';
const SURFACE_ALT = '#16161F';
const BORDER = '#252535';
const TEXT_SECONDARY = '#8A8AA0';

/** Fixed height of the entire timeline panel in pixels. */
export const TIMELINE_PANEL_HEIGHT = 232;

/** Height of the ruler strip. */
export const RULER_HEIGHT = 28;

/** Height of the toolbar strip above the ruler. */
export const TOOLBAR_HEIGHT = 36;

/** Height available for the scrollable track list. */
export const TRACK_LIST_HEIGHT = TIMELINE_PANEL_HEIGHT - TOOLBAR_HEIGHT - RULER_HEIGHT - SCROLLBAR_HEIGHT;

export const styles: Record<string, React.CSSProperties> = {
  panel: {
    height: TIMELINE_PANEL_HEIGHT,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    background: '#0D0D14',
    borderTop: `1px solid ${BORDER}`,
    overflow: 'hidden',
  },
  toolbar: {
    height: TOOLBAR_HEIGHT,
    background: SURFACE_ALT,
    borderBottom: `1px solid ${BORDER}`,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '0 8px',
    flexShrink: 0,
  },
  toolbarButton: {
    width: 24,
    height: 24,
    background: 'transparent',
    border: `1px solid ${BORDER}`,
    borderRadius: 4,
    color: '#F0F0FA',
    fontSize: 14,
    fontFamily: 'Inter, sans-serif',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    flexShrink: 0,
  },
  zoomLabel: {
    color: TEXT_SECONDARY,
    fontSize: 11,
    fontFamily: 'Inter, sans-serif',
    minWidth: 48,
    textAlign: 'center',
  },
  trackCount: {
    marginLeft: 'auto',
    color: TEXT_SECONDARY,
    fontSize: 11,
    fontFamily: 'Inter, sans-serif',
  },
  rulerRow: {
    display: 'flex',
    flexShrink: 0,
    background: '#0D0D14',
    borderBottom: `1px solid ${BORDER}`,
  },
  rulerWrapper: {
    flex: 1,
    overflow: 'hidden',
  },
  trackListWrapper: {
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
  },
};
