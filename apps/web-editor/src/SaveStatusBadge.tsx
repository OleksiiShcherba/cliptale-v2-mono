import React from 'react';

import type { SaveStatus } from '@/features/version-history/hooks/useAutosave';
import { formatRelativeDate } from '@/shared/utils/formatRelativeDate';

// Design-guide tokens used by this component.
const TEXT_SECONDARY = '#8A8AA0';
const SUCCESS = '#10B981';
const WARNING = '#F59E0B';
const SURFACE_ALT = '#16161F';
const BORDER = '#252535';
const TEXT_PRIMARY = '#F0F0FA';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SaveStatusBadgeProps {
  saveStatus: SaveStatus;
  lastSavedAt: Date | null;
  hasEverEdited: boolean;
  /**
   * Called when the user clicks "Overwrite" to resolve a conflict by accepting
   * their local changes over the server's latest version.
   */
  onOverwrite?: () => void;
}

// ---------------------------------------------------------------------------
// SaveStatusBadge
// ---------------------------------------------------------------------------

/**
 * Small inline badge rendered in the top bar (right side).
 *
 * States:
 * - `idle`     → "Not yet saved" on first load; "Unsaved changes" after the first edit
 * - `saving`   → "Saving…" with a spinning indicator
 * - `saved`    → "Saved [time ago]" with a check mark
 * - `conflict` → "Conflict" warning with an "Overwrite" action button
 */
export function SaveStatusBadge({
  saveStatus,
  lastSavedAt,
  hasEverEdited,
  onOverwrite,
}: SaveStatusBadgeProps): React.ReactElement {
  const label = getSaveStatusLabel(saveStatus, lastSavedAt, hasEverEdited);
  const color = getSaveStatusColor(saveStatus);

  return (
    <span
      style={{ ...styles.saveBadge, color }}
      aria-live="polite"
      aria-label={`Save status: ${label}`}
      title={lastSavedAt ? `Last saved at ${lastSavedAt.toISOString()}` : undefined}
    >
      <span style={styles.saveBadgeIcon} aria-hidden="true">
        {getSaveStatusIcon(saveStatus)}
      </span>
      {label}
      {saveStatus === 'conflict' && onOverwrite !== undefined && (
        <button
          type="button"
          style={styles.overwriteButton}
          onClick={onOverwrite}
          aria-label="Overwrite server version with local changes"
        >
          Overwrite
        </button>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns the human-readable label for the current save status. */
export function getSaveStatusLabel(
  status: SaveStatus,
  lastSavedAt: Date | null,
  hasEverEdited: boolean,
): string {
  switch (status) {
    case 'idle':
      return hasEverEdited ? 'Unsaved changes' : 'Not yet saved';
    case 'saving':
      return 'Saving\u2026';
    case 'saved':
      return lastSavedAt ? `Saved ${formatRelativeDate(lastSavedAt)}` : 'Saved';
    case 'conflict':
      return 'Conflict';
  }
}

function getSaveStatusColor(status: SaveStatus): string {
  switch (status) {
    case 'idle':
      return TEXT_SECONDARY;
    case 'saving':
      return TEXT_SECONDARY;
    case 'saved':
      return SUCCESS;
    case 'conflict':
      return WARNING;
  }
}

function getSaveStatusIcon(status: SaveStatus): string {
  switch (status) {
    case 'idle':
      return '\u25CF'; // filled circle dot
    case 'saving':
      return '\u29D7'; // hourglass / spinner placeholder
    case 'saved':
      return '\u2713'; // check mark
    case 'conflict':
      return '\u26A0'; // warning triangle
  }
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
  saveBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '12px',
    fontWeight: 400,
  } as React.CSSProperties,

  saveBadgeIcon: {
    fontSize: '10px',
  } as React.CSSProperties,

  overwriteButton: {
    background: SURFACE_ALT,
    border: `1px solid ${BORDER}`,
    borderRadius: '4px',
    color: TEXT_PRIMARY,
    fontSize: '12px',
    fontWeight: 500,
    fontFamily: 'Inter, sans-serif',
    padding: '4px 8px',
    cursor: 'pointer',
    lineHeight: '16px',
    marginLeft: '4px',
  } as React.CSSProperties,
};
