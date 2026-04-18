import React from 'react';

import { useAutosave } from '@/features/version-history/hooks/useAutosave';
import { SaveStatusBadge } from './SaveStatusBadge';
import { styles } from './topBar.styles';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TopBarProps {
  projectId: string;
  isHistoryOpen: boolean;
  onToggleHistory: () => void;
  isExportOpen: boolean;
  onToggleExport: () => void;
  /** Whether the renders queue modal is open. */
  isRendersOpen: boolean;
  /** Called when the Renders button is clicked. */
  onToggleRenders: () => void;
  /**
   * Number of render jobs currently queued or processing.
   * When > 0, a badge is shown on the Renders button.
   */
  activeRenderCount: number;
  /** When false, the Export button is greyed out and non-interactive. */
  canExport: boolean;
  /** Whether undo is available. When false the Undo button is disabled. */
  canUndo: boolean;
  /** Whether redo is available. When false the Redo button is disabled. */
  canRedo: boolean;
  /** Called when the Undo button is clicked. */
  onUndo: () => void;
  /** Called when the Redo button is clicked. */
  onRedo: () => void;
  /** Whether the project settings modal is open. */
  isSettingsOpen: boolean;
  /** Called when the Settings button is clicked. */
  onToggleSettings: () => void;
  /** Called when the Sign Out button is clicked. */
  onLogout: () => void;
  /** Called when the Home button is clicked — navigates back to the Home hub. */
  onNavigateHome: () => void;
}

// ---------------------------------------------------------------------------
// TopBar
// ---------------------------------------------------------------------------

/**
 * Editor top bar: project title, undo/redo, save status badge, version history
 * toggle, renders queue toggle, and export button.
 */
export function TopBar({
  projectId,
  isHistoryOpen,
  onToggleHistory,
  isExportOpen,
  onToggleExport,
  isRendersOpen,
  onToggleRenders,
  activeRenderCount,
  canExport,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  isSettingsOpen,
  onToggleSettings,
  onLogout,
  onNavigateHome,
}: TopBarProps): React.ReactElement {
  const { saveStatus, lastSavedAt, hasEverEdited, save, resolveConflictByOverwrite } = useAutosave(projectId);

  const isSaving = saveStatus === 'saving';

  const exportButtonStyle = !canExport
    ? styles.exportButtonDisabled
    : isExportOpen
      ? styles.exportButtonActive
      : styles.exportButton;

  return (
    <header style={styles.topBar} aria-label="Editor top bar">
      <div style={styles.topBarLeft}>
        <button
          type="button"
          style={styles.homeButton}
          onClick={onNavigateHome}
          aria-label="Go to home"
        >
          {/* House icon */}
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path
              d="M1 5.5L6 1L11 5.5V11H7.5V8H4.5V11H1V5.5Z"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
          </svg>
          Home
        </button>
        <span style={styles.topBarTitle}>ClipTale Editor</span>
      </div>
      <div style={styles.topBarRight}>
        {/* Undo / Redo */}
        <div style={styles.undoRedoGroup}>
          <button
            type="button"
            style={canUndo ? styles.iconButton : styles.iconButtonDisabled}
            onClick={canUndo ? onUndo : undefined}
            aria-label="Undo"
            aria-disabled={!canUndo}
            title="Undo (Ctrl+Z)"
          >
            {/* Left-pointing curved arrow */}
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path
                d="M2 5H8.5C10.433 5 12 6.567 12 8.5S10.433 12 8.5 12H5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M4.5 2.5L2 5l2.5 2.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            type="button"
            style={canRedo ? styles.iconButton : styles.iconButtonDisabled}
            onClick={canRedo ? onRedo : undefined}
            aria-label="Redo"
            aria-disabled={!canRedo}
            title="Redo (Ctrl+Y)"
          >
            {/* Right-pointing curved arrow (mirror of undo) */}
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path
                d="M12 5H5.5C3.567 5 2 6.567 2 8.5S3.567 12 5.5 12H9"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M9.5 2.5L12 5l-2.5 2.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        <button
          type="button"
          style={isSaving ? styles.saveButtonDisabled : styles.saveButton}
          onClick={isSaving ? undefined : () => { void save(); }}
          aria-label="Save project"
          aria-disabled={isSaving}
          disabled={isSaving}
        >
          {isSaving ? 'Saving\u2026' : 'Save'}
        </button>
        <SaveStatusBadge
          saveStatus={saveStatus}
          lastSavedAt={lastSavedAt}
          hasEverEdited={hasEverEdited}
          onOverwrite={resolveConflictByOverwrite}
        />
        <button
          type="button"
          style={isSettingsOpen ? styles.settingsButtonActive : styles.settingsButton}
          onClick={onToggleSettings}
          aria-label="Toggle project settings"
          aria-pressed={isSettingsOpen}
        >
          Settings
        </button>
        <button
          type="button"
          style={isHistoryOpen ? styles.historyButtonActive : styles.historyButton}
          onClick={onToggleHistory}
          aria-label="Toggle version history"
          aria-pressed={isHistoryOpen}
        >
          History
        </button>
        <div style={styles.rendersButtonWrapper}>
          <button
            type="button"
            style={isRendersOpen ? styles.rendersButtonActive : styles.rendersButton}
            onClick={onToggleRenders}
            aria-label="View renders queue"
            aria-pressed={isRendersOpen}
          >
            Renders
          </button>
          {activeRenderCount > 0 && (
            <span
              style={styles.rendersBadge}
              aria-label={`${activeRenderCount} active render${activeRenderCount === 1 ? '' : 's'}`}
            >
              {activeRenderCount}
            </span>
          )}
        </div>
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
        <button
          type="button"
          style={styles.signOutButton}
          onClick={onLogout}
          aria-label="Sign out"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
