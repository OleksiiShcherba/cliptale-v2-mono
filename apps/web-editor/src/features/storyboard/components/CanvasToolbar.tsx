/**
 * CanvasToolbar — floating action toolbar rendered inside the canvas area.
 *
 * Buttons:
 * - "Add Block" — appends a new SCENE block to the canvas.
 * - "Add Music" — appends a storyboard music block when scenes exist.
 * - "Auto-Arrange" — disabled, tooltip "Coming soon".
 */

import React from 'react';

import { storyboardPageStyles as s } from './storyboardPageStyles';

// ── Props ──────────────────────────────────────────────────────────────────────

interface CanvasToolbarProps {
  onAddBlock: () => void;
  onAddMusicBlock: () => void;
  canAddMusicBlock: boolean;
  /** Optional — opens the cast extraction modal (storyboard-reference-flows AC-01). */
  onStartReferenceGeneration?: () => void;
}

// ── Component ──────────────────────────────────────────────────────────────────

/**
 * Floating canvas toolbar positioned at the bottom-right of the canvas area.
 * Contains "Add Block" (active) and "Auto-Arrange" (disabled placeholder).
 */
export function CanvasToolbar({
  onAddBlock,
  onAddMusicBlock,
  canAddMusicBlock,
  onStartReferenceGeneration,
}: CanvasToolbarProps): React.ReactElement {
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

      <button
        type="button"
        style={canAddMusicBlock ? s.canvasToolbarButton : s.canvasToolbarButtonDisabled}
        onClick={canAddMusicBlock ? onAddMusicBlock : undefined}
        disabled={!canAddMusicBlock}
        aria-label="Add music block"
        aria-disabled={canAddMusicBlock ? 'false' : 'true'}
        title={canAddMusicBlock ? 'Add music block' : 'Add a scene before adding music'}
        data-testid="add-music-block-button"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M5 3v7.25A1.75 1.75 0 1 1 3.25 8.5H5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M5 3h5v2H5V3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
        Add Music
      </button>

      {/* Start reference generation — shows cast extraction modal (AC-01) */}
      {onStartReferenceGeneration !== undefined && (
        <button
          type="button"
          style={s.canvasToolbarButton}
          onClick={onStartReferenceGeneration}
          aria-label="Start reference generation"
          data-testid="start-reference-generation-button"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            aria-hidden="true"
            focusable="false"
          >
            <circle cx="7" cy="5" r="3" stroke="currentColor" strokeWidth="1.5" />
            <path d="M2 13c0-2.761 2.239-5 5-5s5 2.239 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          Start reference generation
        </button>
      )}

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
