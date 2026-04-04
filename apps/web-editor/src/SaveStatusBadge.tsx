import React from 'react';

import type { SaveStatus } from '@/features/version-history/hooks/useAutosave';
import { formatRelativeDate } from '@/shared/utils/formatRelativeDate';

// Design-guide tokens used by this component.
const TEXT_SECONDARY = '#8A8AA0';
const SUCCESS = '#10B981';
const WARNING = '#F59E0B';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SaveStatusBadgeProps {
  saveStatus: SaveStatus;
  lastSavedAt: Date | null;
  hasEverEdited: boolean;
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
 * - `conflict` → "Conflict — reload to get latest" with a warning
 */
export function SaveStatusBadge({
  saveStatus,
  lastSavedAt,
  hasEverEdited,
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
      return 'Conflict \u2014 reload to get latest';
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
    gap: '6px',
    fontSize: '12px',
    fontWeight: 400,
  } as React.CSSProperties,

  saveBadgeIcon: {
    fontSize: '10px',
  } as React.CSSProperties,
};
