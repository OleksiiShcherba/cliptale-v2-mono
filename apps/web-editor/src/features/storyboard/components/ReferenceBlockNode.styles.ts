import type React from 'react';

import {
  BORDER,
  ERROR,
  PRIMARY,
  PRIMARY_LIGHT,
  SURFACE,
  SURFACE_ELEVATED,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  WARNING,
  SUCCESS,
} from './nodeStyles';

export const referenceBlockNodeStyles = {
  root: {
    width: '220px',
    background: SURFACE_ELEVATED,
    border: `1.5px solid ${BORDER}`,
    borderRadius: '8px',
    color: TEXT_PRIMARY,
    fontFamily: 'Inter, sans-serif',
    position: 'relative',
    userSelect: 'none',
    overflow: 'hidden',
    cursor: 'pointer',
  } as React.CSSProperties,

  rootNoFlow: {
    borderColor: WARNING,
    opacity: 0.75,
  } as React.CSSProperties,

  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    borderBottom: `1px solid ${BORDER}`,
  } as React.CSSProperties,

  glyph: {
    width: '24px',
    height: '24px',
    borderRadius: '4px',
    background: PRIMARY_LIGHT,
    color: PRIMARY,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  } as React.CSSProperties,

  title: {
    minWidth: 0,
    flex: 1,
    fontSize: '11px',
    lineHeight: '16px',
    fontWeight: 600,
    textTransform: 'uppercase',
    color: TEXT_PRIMARY,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  } as React.CSSProperties,

  typeBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    height: '20px',
    borderRadius: '4px',
    border: `1px solid ${BORDER}`,
    background: SURFACE,
    padding: '0 6px',
    color: TEXT_SECONDARY,
    fontSize: '9px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    flexShrink: 0,
  } as React.CSSProperties,

  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '8px 12px 12px',
  } as React.CSSProperties,

  preview: {
    width: '100%',
    height: '80px',
    borderRadius: '4px',
    objectFit: 'cover',
    display: 'block',
  } as React.CSSProperties,

  previewPlaceholder: {
    width: '100%',
    height: '80px',
    borderRadius: '4px',
    background: SURFACE,
    border: `1px dashed ${BORDER}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: TEXT_SECONDARY,
    fontSize: '10px',
    fontWeight: 500,
  } as React.CSSProperties,

  statusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexWrap: 'wrap',
  } as React.CSSProperties,

  statusBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    height: '22px',
    borderRadius: '4px',
    border: `1px solid ${BORDER}`,
    background: SURFACE,
    padding: '0 8px',
    color: TEXT_SECONDARY,
    fontSize: '10px',
    lineHeight: '14px',
    fontWeight: 600,
  } as React.CSSProperties,

  errorMessage: {
    margin: 0,
    fontSize: '11px',
    lineHeight: '15px',
    color: ERROR,
    overflow: 'hidden',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
  } as React.CSSProperties,

  retryButton: {
    flexShrink: 0,
    border: `1px solid ${ERROR}`,
    borderRadius: '4px',
    background: SURFACE,
    color: ERROR,
    cursor: 'pointer',
    fontSize: '10px',
    fontWeight: 600,
    lineHeight: '14px',
    padding: '4px 8px',
  } as React.CSSProperties,

  noFlowBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    height: '22px',
    borderRadius: '4px',
    border: `1px solid ${WARNING}`,
    background: SURFACE,
    padding: '0 8px',
    color: WARNING,
    fontSize: '10px',
    lineHeight: '14px',
    fontWeight: 600,
  } as React.CSSProperties,
} as const;

/** Colour for each window_status value. */
export const STATUS_COLOR: Record<string, string> = {
  pending: WARNING,
  running: PRIMARY,
  done: SUCCESS,
  failed: ERROR,
};
