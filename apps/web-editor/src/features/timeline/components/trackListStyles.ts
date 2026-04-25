import type React from 'react';

import { TRACK_HEADER_WIDTH } from './TrackHeader';

// Design tokens
const BORDER = '#252535';
const PRIMARY = '#7C3AED';

export const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
    overflow: 'hidden',
  },
  headerColumn: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: TRACK_HEADER_WIDTH,
    zIndex: 1,
    pointerEvents: 'none',
  },
  headerLabel: {
    height: 0,
    overflow: 'hidden',
  },
  emptyState: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0D0D14',
    borderTop: `1px solid ${BORDER}`,
    borderBottom: 'none',
    borderLeft: 'none',
    borderRight: 'none',
  },
  emptyStateDropActive: {
    background: `${PRIMARY}14`,
    borderTop: `1px dashed ${PRIMARY}`,
    borderBottom: `1px dashed ${PRIMARY}`,
    borderLeft: `1px dashed ${PRIMARY}`,
    borderRight: `1px dashed ${PRIMARY}`,
  },
  emptyText: {
    color: '#8A8AA0',
    fontSize: 12,
    fontFamily: 'Inter, sans-serif',
    fontWeight: 400,
  },
};
