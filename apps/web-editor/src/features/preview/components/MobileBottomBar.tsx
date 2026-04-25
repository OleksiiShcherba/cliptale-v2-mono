import React from 'react';

// Design-guide tokens
const SURFACE_ALT = '#16161F';
const BORDER = '#252535';
const TEXT_PRIMARY = '#F0F0FA';
const TEXT_SECONDARY = '#8A8AA0';
const PRIMARY = '#7C3AED';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Props for {@link MobileBottomBar}. */
export interface MobileBottomBarProps {
  /** Called when the Add Clip button is tapped. */
  onAddClip: () => void;
  /** Called when the AI / Captions button is tapped. */
  onAI: () => void;
  /** Whether export is available (requires a saved version). */
  canExport: boolean;
  /** Called when the Export button is tapped. */
  onExport: () => void;
}

// ---------------------------------------------------------------------------
// MobileBottomBar
// ---------------------------------------------------------------------------

/**
 * Bottom action toolbar for the tablet/mobile editor layout.
 * Matches the "BOTTOM TOOLBAR — Add Clip / AI / Export" region in Figma node 13:134.
 *
 * Renders three action buttons stacked horizontally:
 * - Add Clip — switches the inspector tab to the asset browser
 * - AI Captions — switches to the captions tab
 * - Export — triggers the export modal
 */
export function MobileBottomBar({
  onAddClip,
  onAI,
  canExport,
  onExport,
}: MobileBottomBarProps): React.ReactElement {
  return (
    <nav style={styles.container} aria-label="Mobile editor toolbar">
      <button
        type="button"
        style={styles.actionButton}
        onClick={onAddClip}
        aria-label="Add clip"
      >
        {/* Plus icon */}
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path d="M9 3v12M3 9h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span style={styles.actionLabel}>Add Clip</span>
      </button>

      <div style={styles.divider} aria-hidden="true" />

      <button
        type="button"
        style={styles.actionButton}
        onClick={onAI}
        aria-label="AI Captions"
      >
        {/* Sparkle / AI icon */}
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path
            d="M9 2l1.5 4.5L15 8l-4.5 1.5L9 14l-1.5-4.5L3 8l4.5-1.5L9 2z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
        <span style={styles.actionLabel}>AI Captions</span>
      </button>

      <div style={styles.divider} aria-hidden="true" />

      <button
        type="button"
        style={canExport ? styles.exportButton : styles.exportButtonDisabled}
        onClick={canExport ? onExport : undefined}
        aria-label="Export video"
        aria-disabled={!canExport}
        title={!canExport ? 'Save your project first to export.' : undefined}
      >
        {/* Upload / export icon */}
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path
            d="M9 11V3M6 6l3-3 3 3"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M3 13h12v2H3v-2z"
            fill="currentColor"
            opacity="0.4"
          />
        </svg>
        <span style={styles.actionLabel}>Export</span>
      </button>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
  container: {
    height: '64px',
    flexShrink: 0,
    background: SURFACE_ALT,
    borderTop: `1px solid ${BORDER}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-evenly',
  } as React.CSSProperties,

  actionButton: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    height: '100%',
    background: 'transparent',
    border: 'none',
    color: TEXT_SECONDARY,
    fontFamily: 'Inter, sans-serif',
    cursor: 'pointer',
    padding: '0',
  } as React.CSSProperties,

  exportButton: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    height: '100%',
    background: 'transparent',
    border: 'none',
    color: PRIMARY,
    fontFamily: 'Inter, sans-serif',
    cursor: 'pointer',
    padding: '0',
  } as React.CSSProperties,

  exportButtonDisabled: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    height: '100%',
    background: 'transparent',
    border: 'none',
    color: BORDER,
    fontFamily: 'Inter, sans-serif',
    cursor: 'not-allowed',
    padding: '0',
  } as React.CSSProperties,

  actionLabel: {
    fontSize: '11px',
    fontWeight: 500,
    lineHeight: '14px',
  } as React.CSSProperties,

  divider: {
    width: '1px',
    height: '40px',
    background: BORDER,
    flexShrink: 0,
  } as React.CSSProperties,
} as const;
