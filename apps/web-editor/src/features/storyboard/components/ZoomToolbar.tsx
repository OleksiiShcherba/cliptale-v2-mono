/**
 * ZoomToolbar — floating zoom control rendered at the bottom-left of the canvas.
 *
 * Contains:
 * - "−" button — decrements zoom by 10%, clamped to MIN_ZOOM_PCT.
 * - Zoom percentage label — e.g. "100%"; updates in real-time on scroll.
 * - "+" button — increments zoom by 10%, clamped to MAX_ZOOM_PCT.
 *
 * `currentZoom` is a 0–1 React Flow viewport zoom value (1 = 100%),
 * mapped to a 25–200 integer percentage for display and clamping.
 */

import React from 'react';

import { zoomToolbarStyles as s } from './zoomToolbarStyles';

// ── Constants ──────────────────────────────────────────────────────────────────

/** Minimum zoom as a percentage integer. Matches React Flow minZoom={0.25}. */
export const MIN_ZOOM_PCT = 25;

/** Maximum zoom as a percentage integer. Matches React Flow maxZoom={2.0}. */
export const MAX_ZOOM_PCT = 200;

/** Step size for + / − buttons in percentage points. */
const ZOOM_STEP_PCT = 10;

// ── Props ──────────────────────────────────────────────────────────────────────

interface ZoomToolbarProps {
  /**
   * Current zoom from React Flow's viewport (e.g. 1.0 = 100%, 0.5 = 50%).
   * The toolbar converts it to a percentage integer for display.
   */
  currentZoom: number;
  /**
   * Called when the user clicks "+" or "−" with the new zoom fraction (0.25–2.0).
   */
  onZoomChange: (newZoom: number) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Convert a React Flow zoom fraction to a rounded integer percentage. */
function zoomToPercent(zoom: number): number {
  return Math.round(zoom * 100);
}

/** Clamp a percentage value within [MIN_ZOOM_PCT, MAX_ZOOM_PCT]. */
function clampPct(pct: number): number {
  return Math.max(MIN_ZOOM_PCT, Math.min(MAX_ZOOM_PCT, pct));
}

// ── Component ──────────────────────────────────────────────────────────────────

/**
 * Zoom toolbar for the storyboard canvas.
 * Positioned at the bottom-left of the canvas area via absolute positioning.
 */
export function ZoomToolbar({ currentZoom, onZoomChange }: ZoomToolbarProps): React.ReactElement {
  const currentPct = zoomToPercent(currentZoom);

  function handleDecrement(): void {
    const newPct = clampPct(currentPct - ZOOM_STEP_PCT);
    onZoomChange(newPct / 100);
  }

  function handleIncrement(): void {
    const newPct = clampPct(currentPct + ZOOM_STEP_PCT);
    onZoomChange(newPct / 100);
  }

  const canDecrement = currentPct > MIN_ZOOM_PCT;
  const canIncrement = currentPct < MAX_ZOOM_PCT;

  return (
    <div style={s.toolbar} data-testid="zoom-toolbar" role="group" aria-label="Zoom controls">
      {/* Zoom out */}
      <button
        type="button"
        style={s.button}
        onClick={handleDecrement}
        disabled={!canDecrement}
        aria-label="Zoom out"
        data-testid="zoom-out-button"
      >
        −
      </button>

      <div style={s.divider} aria-hidden="true" />

      {/* Zoom percentage label */}
      <span
        style={s.label}
        aria-live="polite"
        aria-label={`Current zoom: ${currentPct}%`}
        data-testid="zoom-label"
      >
        {currentPct}%
      </span>

      <div style={s.divider} aria-hidden="true" />

      {/* Zoom in */}
      <button
        type="button"
        style={s.button}
        onClick={handleIncrement}
        disabled={!canIncrement}
        aria-label="Zoom in"
        data-testid="zoom-in-button"
      >
        +
      </button>
    </div>
  );
}
