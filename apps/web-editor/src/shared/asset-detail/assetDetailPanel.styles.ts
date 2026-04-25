import type React from 'react';

// ---------------------------------------------------------------------------
// Design-guide tokens
// ---------------------------------------------------------------------------

const SURFACE_ALT = '#16161F';
const SURFACE_ELEVATED = '#1E1E2E';
const TEXT_PRIMARY = '#F0F0FA';
const TEXT_SECONDARY = '#8A8AA0';
const BORDER = '#252535';
const ERROR = '#EF4444';
const PRIMARY = '#7C3AED';

export const STATUS_BG: Record<string, string> = {
  ready: '#10B981',
  processing: '#F59E0B',
  error: '#EF4444',
  pending: '#8A8AA0',
};

// ---------------------------------------------------------------------------
// Style factory
// ---------------------------------------------------------------------------

/**
 * Returns the full style object for `AssetDetailPanel` parameterized by
 * display mode.
 *
 * - `compact = true`  — fixed 280×620 px used inside the editor right sidebar
 *   so the sidebar never shifts when assets are selected / deselected.
 * - `compact = false` — fluid 100 % width capped at 520 px used when the
 *   panel is embedded in the wider generate-wizard right column.
 */
export function getAssetDetailPanelStyles(compact: boolean) {
  /** Width applied to the root container. */
  const rootWidth: React.CSSProperties['width'] = compact ? 280 : '100%';
  /** Width applied to child elements that were previously 248 px fixed. */
  const childWidth: React.CSSProperties['width'] = compact ? 248 : '100%';
  const childMaxWidth: React.CSSProperties['maxWidth'] = compact ? undefined : 480;

  return {
    root: {
      width: rootWidth,
      ...(compact ? { height: 620 } : { minHeight: 620, maxWidth: 520 }),
      backgroundColor: SURFACE_ALT,
      display: 'flex',
      flexDirection: 'column',
      padding: 16,
      boxSizing: 'border-box',
      gap: 16,
      fontFamily: 'Inter, sans-serif',
      flexShrink: 0,
    } as React.CSSProperties,

    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexShrink: 0,
    } as React.CSSProperties,

    headerLabel: {
      fontSize: 12,
      fontWeight: 500,
      lineHeight: '16px',
      color: TEXT_SECONDARY,
      letterSpacing: '0.05em',
      textTransform: 'uppercase',
    } as React.CSSProperties,

    closeButton: {
      background: 'transparent',
      border: 'none',
      color: TEXT_SECONDARY,
      cursor: 'pointer',
      padding: 4,
      lineHeight: 1,
      fontSize: 14,
      borderRadius: 4,
    } as React.CSSProperties,

    previewContainer: {
      width: childWidth,
      maxWidth: childMaxWidth,
      height: 160,
      borderRadius: 8,
      backgroundColor: SURFACE_ELEVATED,
      overflow: 'hidden',
      flexShrink: 0,
      position: 'relative',
    } as React.CSSProperties,

    previewImage: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
    } as React.CSSProperties,

    previewEmpty: {
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: TEXT_SECONDARY,
      fontSize: 12,
      fontWeight: 400,
      lineHeight: '16px',
    } as React.CSSProperties,

    statusBadge: {
      position: 'absolute',
      bottom: 8,
      right: 8,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: 28,
      paddingLeft: 8,
      paddingRight: 8,
      borderRadius: 9999,
      fontSize: 11,
      fontWeight: 400,
      lineHeight: '16px',
      color: TEXT_PRIMARY,
      textTransform: 'capitalize',
      boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
      letterSpacing: '0.04em',
    } as React.CSSProperties,

    metadataRow: {
      width: childWidth,
      maxWidth: childMaxWidth,
      height: 40,
      borderRadius: 8,
      backgroundColor: SURFACE_ELEVATED,
      display: 'flex',
      alignItems: 'center',
      flexWrap: 'wrap',
      padding: '0 8px',
      gap: 8,
      boxSizing: 'border-box',
      flexShrink: 0,
    } as React.CSSProperties,

    metadataItem: {
      fontSize: 12,
      fontWeight: 400,
      lineHeight: '16px',
      color: TEXT_SECONDARY,
    } as React.CSSProperties,

    actionButton: (enabled: boolean): React.CSSProperties => ({
      width: childWidth,
      maxWidth: childMaxWidth,
      height: 36,
      borderRadius: 8,
      border: `1px solid ${BORDER}`,
      backgroundColor: 'transparent',
      color: enabled ? TEXT_PRIMARY : TEXT_SECONDARY,
      fontSize: 14,
      fontWeight: 400,
      lineHeight: '20px',
      cursor: enabled ? 'pointer' : 'not-allowed',
      fontFamily: 'Inter, sans-serif',
      flexShrink: 0,
      opacity: enabled ? 1 : 0.5,
    }),

    primaryActionButton: (enabled: boolean): React.CSSProperties => ({
      width: childWidth,
      maxWidth: childMaxWidth,
      height: 36,
      borderRadius: 8,
      border: 'none',
      backgroundColor: enabled ? PRIMARY : 'transparent',
      color: enabled ? TEXT_PRIMARY : TEXT_SECONDARY,
      fontSize: 14,
      fontWeight: 600,
      lineHeight: '20px',
      cursor: enabled ? 'pointer' : 'not-allowed',
      fontFamily: 'Inter, sans-serif',
      flexShrink: 0,
      opacity: enabled ? 1 : 0.5,
    }),

    deleteButton: (enabled: boolean): React.CSSProperties => ({
      width: childWidth,
      maxWidth: childMaxWidth,
      height: 36,
      borderRadius: 8,
      border: `1px solid ${BORDER}`,
      backgroundColor: 'transparent',
      color: enabled ? ERROR : TEXT_SECONDARY,
      fontSize: 14,
      fontWeight: 400,
      lineHeight: '20px',
      cursor: enabled ? 'pointer' : 'not-allowed',
      fontFamily: 'Inter, sans-serif',
      flexShrink: 0,
      opacity: enabled ? 1 : 0.5,
    }),
  } as const;
}
