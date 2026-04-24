/**
 * Inline style objects for React Flow custom node components.
 *
 * Uses design-guide tokens only — no CSS files.
 * The @xyflow/react stylesheet is imported once in StoryboardPage.tsx.
 */
import type React from 'react';

// ── Design-guide tokens ────────────────────────────────────────────────────────

export const PRIMARY = '#7C3AED';
export const PRIMARY_LIGHT = '#4C1D95';
export const SURFACE = '#0D0D14';
export const SURFACE_ELEVATED = '#1E1E2E';
export const BORDER = '#252535';
export const TEXT_PRIMARY = '#F0F0FA';
export const TEXT_SECONDARY = '#8A8AA0';
export const ERROR = '#EF4444';

// ── StartNode / EndNode styles ─────────────────────────────────────────────────

export const sentinelNodeStyles = {
  root: {
    background: SURFACE_ELEVATED,
    border: `1.5px solid ${BORDER}`,
    borderRadius: '8px',
    padding: '10px 20px',
    color: TEXT_PRIMARY,
    fontFamily: 'Inter, sans-serif',
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    minWidth: '80px',
    textAlign: 'center',
    userSelect: 'none',
    position: 'relative',
  } as React.CSSProperties,

  startRoot: {
    background: SURFACE_ELEVATED,
    border: `1.5px solid ${PRIMARY}`,
    borderRadius: '8px',
    padding: '10px 20px',
    color: PRIMARY,
    fontFamily: 'Inter, sans-serif',
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    minWidth: '80px',
    textAlign: 'center',
    userSelect: 'none',
    position: 'relative',
  } as React.CSSProperties,

  endRoot: {
    background: SURFACE_ELEVATED,
    border: `1.5px solid ${BORDER}`,
    borderRadius: '8px',
    padding: '10px 20px',
    color: TEXT_SECONDARY,
    fontFamily: 'Inter, sans-serif',
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    minWidth: '80px',
    textAlign: 'center',
    userSelect: 'none',
    position: 'relative',
  } as React.CSSProperties,
} as const;

// ── SceneBlockNode styles ──────────────────────────────────────────────────────

export const sceneBlockNodeStyles = {
  root: {
    background: SURFACE_ELEVATED,
    border: `1.5px solid ${BORDER}`,
    borderRadius: '8px',
    width: '220px',
    fontFamily: 'Inter, sans-serif',
    color: TEXT_PRIMARY,
    position: 'relative',
    overflow: 'visible',
    userSelect: 'none',
  } as React.CSSProperties,

  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px 8px',
    borderBottom: `1px solid ${BORDER}`,
  } as React.CSSProperties,

  sceneName: {
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: TEXT_PRIMARY,
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  } as React.CSSProperties,

  removeButton: {
    background: 'transparent',
    border: 'none',
    padding: '4px',
    borderRadius: '4px',
    cursor: 'pointer',
    color: ERROR,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginLeft: '4px',
    lineHeight: 1,
  } as React.CSSProperties,

  body: {
    padding: '8px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  } as React.CSSProperties,

  promptText: {
    fontSize: '12px',
    fontWeight: 400,
    color: TEXT_SECONDARY,
    lineHeight: '16px',
    overflow: 'hidden',
    display: '-webkit-box',
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical',
  } as React.CSSProperties,

  durationBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    background: SURFACE,
    border: `1px solid ${BORDER}`,
    borderRadius: '4px',
    padding: '4px 8px',
    fontSize: '10px',
    fontWeight: 500,
    color: TEXT_SECONDARY,
    letterSpacing: '0.04em',
    alignSelf: 'flex-start',
  } as React.CSSProperties,

  thumbnailRow: {
    display: 'flex',
    gap: '4px',
    alignItems: 'flex-start',
  } as React.CSSProperties,

  thumbnailItem: {
    width: '60px',
    height: '40px',
    borderRadius: '4px',
    background: SURFACE,
    border: `1px solid ${BORDER}`,
    overflow: 'hidden',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  } as React.CSSProperties,

  thumbnailPlaceholder: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  } as React.CSSProperties,

  mediaTypeBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    background: SURFACE,
    border: `1px solid ${BORDER}`,
    borderRadius: '4px',
    padding: '4px 8px',
    fontSize: '9px',
    fontWeight: 500,
    color: TEXT_SECONDARY,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    position: 'absolute',
    bottom: '4px',
    left: '4px',
  } as React.CSSProperties,

  mediaTypeRow: {
    display: 'flex',
    gap: '4px',
    flexWrap: 'wrap',
  } as React.CSSProperties,
} as const;
