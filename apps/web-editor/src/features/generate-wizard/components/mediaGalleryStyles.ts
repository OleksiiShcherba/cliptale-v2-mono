/**
 * Shared style maps for the MediaGalleryPanel family of components.
 *
 * Follows the "inline token constants → inline styles" convention used throughout
 * the generate-wizard feature (see GenerateWizardPage.tsx, PromptEditor.tsx).
 * All values come from design-guide.md §3.
 */

import React from 'react';

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------

export const SURFACE_ALT = '#16161F';
export const SURFACE_ELEVATED = '#1E1E2E';
export const BORDER = '#252535';
export const PRIMARY = '#7C3AED';
export const TEXT_PRIMARY = '#F0F0FA';
export const TEXT_SECONDARY = '#8A8AA0';
export const SUCCESS = '#10B981';
export const INFO = '#0EA5E9';
export const WARNING = '#F59E0B';

// ---------------------------------------------------------------------------
// Panel-level styles
// ---------------------------------------------------------------------------

export const panelStyles = {
  panel: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '580px',
    background: SURFACE_ALT,
    overflow: 'hidden',
    fontFamily: 'Inter, sans-serif',
  } as React.CSSProperties,

  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '16px 16px 12px',
    flexShrink: 0,
  } as React.CSSProperties,

  headerIcon: {
    color: TEXT_PRIMARY,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
  } as React.CSSProperties,

  headerTitle: {
    fontSize: '20px',
    fontWeight: 600,
    lineHeight: '28px',
    color: TEXT_PRIMARY,
    margin: 0,
  } as React.CSSProperties,

  tabList: {
    display: 'flex',
    borderBottom: `1px solid ${BORDER}`,
    flexShrink: 0,
    padding: '0 16px',
    gap: '0',
  } as React.CSSProperties,

  tabButton: (isActive: boolean): React.CSSProperties => ({
    background: 'none',
    border: 'none',
    borderBottom: isActive ? `2px solid ${PRIMARY}` : '2px solid transparent',
    padding: '8px 12px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: isActive ? 600 : 400,
    lineHeight: '20px',
    color: isActive ? TEXT_PRIMARY : TEXT_SECONDARY,
    marginBottom: '-1px',
    fontFamily: 'Inter, sans-serif',
    transition: 'color 0.15s',
  }),

  body: {
    flex: 1,
    overflow: 'auto' as const,
    padding: '12px 16px',
  } as React.CSSProperties,

  footer: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderTop: `1px solid ${BORDER}`,
    background: SURFACE_ALT,
  } as React.CSSProperties,

  footerText: {
    fontSize: '12px',
    fontWeight: 400,
    lineHeight: '16px',
    color: TEXT_SECONDARY,
  } as React.CSSProperties,
} as const;

// ---------------------------------------------------------------------------
// Group/section styles
// ---------------------------------------------------------------------------

export const groupStyles = {
  section: {
    marginBottom: '16px',
  } as React.CSSProperties,

  sectionLabel: {
    fontSize: '12px',
    fontWeight: 500,
    lineHeight: '16px',
    color: TEXT_SECONDARY,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    marginBottom: '8px',
  } as React.CSSProperties,

  thumbGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
    gap: '8px',
  } as React.CSSProperties,

  audioList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  } as React.CSSProperties,
} as const;

// ---------------------------------------------------------------------------
// AssetThumbCard styles
// ---------------------------------------------------------------------------

export const thumbCardStyles = {
  card: {
    position: 'relative' as const,
    background: SURFACE_ELEVATED,
    border: `1px solid ${BORDER}`,
    borderRadius: '4px',
    overflow: 'hidden',
    cursor: 'pointer',
    padding: 0,
    display: 'block',
    width: '100%',
    textAlign: 'left' as const,
    fontFamily: 'Inter, sans-serif',
  } as React.CSSProperties,

  thumbWrapper: {
    position: 'relative' as const,
    width: '100%',
    paddingTop: '56.25%', // 16:9 aspect ratio
    overflow: 'hidden',
    background: '#0D0D14',
  } as React.CSSProperties,

  thumb: {
    position: 'absolute' as const,
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
  } as React.CSSProperties,

  durationBadge: {
    position: 'absolute' as const,
    bottom: '4px',
    right: '4px',
    background: 'rgba(0,0,0,0.7)',
    color: TEXT_PRIMARY,
    fontSize: '11px',
    fontWeight: 400,
    lineHeight: '16px',
    padding: '2px 4px',
    borderRadius: '4px',
    pointerEvents: 'none' as const,
  } as React.CSSProperties,

  overlay: {
    position: 'absolute' as const,
    inset: 0,
    background: `rgba(124, 58, 237, 0.6)`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0,
    transition: 'opacity 0.15s',
    pointerEvents: 'none' as const,
  } as React.CSSProperties,

  overlayVisible: {
    opacity: 1,
  } as React.CSSProperties,

  overlayPlus: {
    color: '#FFFFFF',
    fontSize: '24px',
    fontWeight: 300,
    lineHeight: 1,
  } as React.CSSProperties,

  label: {
    padding: '4px 8px',
    fontSize: '11px',
    fontWeight: 400,
    lineHeight: '16px',
    color: TEXT_PRIMARY,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,
} as const;

// ---------------------------------------------------------------------------
// AudioRowCard styles
// ---------------------------------------------------------------------------

export const audioCardStyles = {
  card: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    background: SURFACE_ELEVATED,
    border: `1px solid ${BORDER}`,
    borderRadius: '4px',
    cursor: 'pointer',
    width: '100%',
    textAlign: 'left' as const,
    fontFamily: 'Inter, sans-serif',
    position: 'relative' as const,
    overflow: 'hidden',
  } as React.CSSProperties,

  icon: {
    flexShrink: 0,
    color: SUCCESS,
    display: 'flex',
    alignItems: 'center',
  } as React.CSSProperties,

  label: {
    flex: 1,
    fontSize: '12px',
    fontWeight: 400,
    lineHeight: '16px',
    color: TEXT_PRIMARY,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,

  duration: {
    flexShrink: 0,
    fontSize: '11px',
    fontWeight: 400,
    lineHeight: '16px',
    color: TEXT_SECONDARY,
  } as React.CSSProperties,

  plusOverlay: {
    position: 'absolute' as const,
    inset: 0,
    background: `rgba(124, 58, 237, 0.45)`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0,
    transition: 'opacity 0.15s',
    color: '#FFFFFF',
    fontSize: '20px',
    fontWeight: 300,
    pointerEvents: 'none' as const,
  } as React.CSSProperties,

  plusOverlayVisible: {
    opacity: 1,
  } as React.CSSProperties,
} as const;

// State-view styles (skeleton / error / empty / folders) live in
// `mediaGalleryStateStyles.ts` to keep this file within the §9.7 300-line cap.
export { stateStyles } from './mediaGalleryStateStyles';
