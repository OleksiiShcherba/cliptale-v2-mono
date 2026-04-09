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
  /** Whether the AI Providers modal is open. */
  isAiProvidersOpen: boolean;
  /** Called when the AI Providers button is clicked. */
  onToggleAiProviders: () => void;
  /** Called when the Sign Out button is clicked. */
  onLogout: () => void;
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
  isAiProvidersOpen,
  onToggleAiProviders,
  onLogout,
}: TopBarProps): React.ReactElement {
  const { saveStatus, lastSavedAt, hasEverEdited } = useAutosave(projectId);

  const exportButtonStyle = !canExport
    ? styles.exportButtonDisabled
    : isExportOpen
      ? styles.exportButtonActive
      : styles.exportButton;

  return (
    <header style={styles.topBar} aria-label="Editor top bar">
      <span style={styles.topBarTitle}>ClipTale Editor</span>
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

        <SaveStatusBadge
          saveStatus={saveStatus}
          lastSavedAt={lastSavedAt}
          hasEverEdited={hasEverEdited}
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
          style={isAiProvidersOpen ? styles.settingsButtonActive : styles.settingsButton}
          onClick={onToggleAiProviders}
          aria-label="Toggle AI providers"
          aria-pressed={isAiProvidersOpen}
        >
          AI
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
