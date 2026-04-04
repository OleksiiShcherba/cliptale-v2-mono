import React from 'react';

import { useAutosave } from '@/features/version-history/hooks/useAutosave';
import { SaveStatusBadge } from './SaveStatusBadge';

// Design-guide tokens used by this component.
const SURFACE_ALT = '#16161F';
const BORDER = '#252535';
const TEXT_PRIMARY = '#F0F0FA';
const TEXT_SECONDARY = '#8A8AA0';
const PRIMARY = '#7C3AED';
const PRIMARY_LIGHT = '#4C1D95';
const TEXT_DISABLED = '#4A4A5A';
const SURFACE_DISABLED = '#252535';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TopBarProps {
  isHistoryOpen: boolean;
  onToggleHistory: () => void;
  isExportOpen: boolean;
  onToggleExport: () => void;
  /** When false, the Export button is greyed out and non-interactive. */
  canExport: boolean;
}

// ---------------------------------------------------------------------------
// TopBar
// ---------------------------------------------------------------------------

/**
 * Editor top bar: project title, save status badge, and version history toggle.
 */
export function TopBar({
  isHistoryOpen,
  onToggleHistory,
  isExportOpen,
  onToggleExport,
  canExport,
}: TopBarProps): React.ReactElement {
  const { saveStatus, lastSavedAt, hasEverEdited } = useAutosave();

  const exportButtonStyle = !canExport
    ? styles.exportButtonDisabled
    : isExportOpen
      ? styles.exportButtonActive
      : styles.exportButton;

  return (
    <header style={styles.topBar} aria-label="Editor top bar">
      <span style={styles.topBarTitle}>ClipTale Editor</span>
      <div style={styles.topBarRight}>
        <SaveStatusBadge
          saveStatus={saveStatus}
          lastSavedAt={lastSavedAt}
          hasEverEdited={hasEverEdited}
        />
        <button
          type="button"
          style={isHistoryOpen ? styles.historyButtonActive : styles.historyButton}
          onClick={onToggleHistory}
          aria-label="Toggle version history"
          aria-pressed={isHistoryOpen}
        >
          History
        </button>
        <button
          type="button"
          style={exportButtonStyle}
          onClick={canExport ? onToggleExport : undefined}
          aria-label="Export video"
          aria-pressed={canExport ? isExportOpen : undefined}
          aria-disabled={!canExport}
          title={!canExport ? 'Save your project first to export.' : undefined}
        >
          Export
        </button>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
  topBar: {
    height: '48px',
    flexShrink: 0,
    background: SURFACE_ALT,
    borderBottom: `1px solid ${BORDER}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: '16px',
    paddingRight: '16px',
  } as React.CSSProperties,

  topBarTitle: {
    fontSize: '14px',
    fontWeight: 500,
    color: TEXT_PRIMARY,
  } as React.CSSProperties,

  topBarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  } as React.CSSProperties,

  historyButton: {
    background: 'transparent',
    border: `1px solid ${BORDER}`,
    borderRadius: '6px',
    color: TEXT_SECONDARY,
    fontSize: '12px',
    fontWeight: 500,
    fontFamily: 'Inter, sans-serif',
    padding: '4px 10px',
    cursor: 'pointer',
    lineHeight: '16px',
  } as React.CSSProperties,

  historyButtonActive: {
    background: PRIMARY_LIGHT,
    border: `1px solid ${PRIMARY}`,
    borderRadius: '6px',
    color: TEXT_PRIMARY,
    fontSize: '12px',
    fontWeight: 500,
    fontFamily: 'Inter, sans-serif',
    padding: '4px 10px',
    cursor: 'pointer',
    lineHeight: '16px',
  } as React.CSSProperties,

  exportButton: {
    background: PRIMARY,
    border: 'none',
    borderRadius: '6px',
    color: TEXT_PRIMARY,
    fontSize: '12px',
    fontWeight: 600,
    fontFamily: 'Inter, sans-serif',
    padding: '4px 12px',
    cursor: 'pointer',
    lineHeight: '16px',
  } as React.CSSProperties,

  exportButtonActive: {
    background: PRIMARY_LIGHT,
    border: `1px solid ${PRIMARY}`,
    borderRadius: '6px',
    color: TEXT_PRIMARY,
    fontSize: '12px',
    fontWeight: 600,
    fontFamily: 'Inter, sans-serif',
    padding: '4px 12px',
    cursor: 'pointer',
    lineHeight: '16px',
  } as React.CSSProperties,

  exportButtonDisabled: {
    background: SURFACE_DISABLED,
    border: `1px solid ${BORDER}`,
    borderRadius: '6px',
    color: TEXT_DISABLED,
    fontSize: '12px',
    fontWeight: 600,
    fontFamily: 'Inter, sans-serif',
    padding: '4px 12px',
    cursor: 'not-allowed',
    lineHeight: '16px',
  } as React.CSSProperties,
};
