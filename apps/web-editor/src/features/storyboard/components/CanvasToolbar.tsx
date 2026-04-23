/**
 * CanvasToolbar — floating action toolbar rendered inside the canvas area.
 *
 * Buttons:
 * - "Add Block" — appends a new SCENE block to the canvas.
 * - "Auto-Arrange" — disabled, tooltip "Coming soon".
 */

import React from 'react';

import { storyboardPageStyles as s } from './storyboardPageStyles';

// ── Props ──────────────────────────────────────────────────────────────────────

interface CanvasToolbarProps {
  onAddBlock: () => void;
}

// ── Component ──────────────────────────────────────────────────────────────────

/**
 * Floating canvas toolbar positioned at the bottom-right of the canvas area.
 * Contains "Add Block" (active) and "Auto-Arrange" (disabled placeholder).
 */
export function CanvasToolbar({ onAddBlock }: CanvasToolbarProps): React.ReactElement {
  return (
    <div style={s.canvasToolbar} data-testid="canvas-toolbar">
      {/* Add Block */}
      <button
        type="button"
        style={s.canvasToolbarButton}
        onClick={onAddBlock}
        aria-label="Add scene block"
        data-testid="add-block-button"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M7 2v10M2 7h10"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
        Add Block
      </button>

      {/* Auto-Arrange — disabled placeholder */}
      <button
        type="button"
        style={s.canvasToolbarButtonDisabled}
        disabled
        aria-label="Auto-arrange (coming soon)"
        aria-disabled="true"
        title="Coming soon"
        data-testid="auto-arrange-button"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          aria-hidden="true"
          focusable="false"
        >
          <rect x="1" y="1" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" />
          <rect x="9" y="1" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" />
          <rect x="1" y="9" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" />
          <rect x="9" y="9" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        Auto-Arrange
      </button>
    </div>
  );
}
