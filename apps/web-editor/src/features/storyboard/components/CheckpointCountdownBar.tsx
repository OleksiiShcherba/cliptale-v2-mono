/**
 * CheckpointCountdownBar — the top-right checkpoint indicator
 * (storyboard-autosave-checkpoints T11).
 *
 * States:
 * - counting (AC-03 / AC-06): shows the m:ss time to the next automatic
 *   checkpoint; the Save button is active.
 * - idle (AC-05): "All saved" — nothing newer than the last checkpoint, the
 *   Save button is inactive (neither an automatic nor a manual checkpoint can
 *   duplicate an unchanged state).
 * - in flight (AC-07b): the Save button is disabled while a checkpoint runs.
 *
 * The Save button (AC-07) triggers the scheduler's manual checkpoint —
 * immediate, never deferred by canvas interaction.
 */

import React from 'react';

import {
  barStyle,
  countdownTextStyle,
  idleTextStyle,
  saveButtonStyle,
  saveButtonDisabledStyle,
} from './CheckpointCountdownBar.styles';

export interface CheckpointCountdownBarProps {
  /** True when there is nothing to checkpoint (AC-05 "all saved"). */
  idle: boolean;
  /** Ms until the next automatic checkpoint; null when not counting. */
  remainingMs: number | null;
  /** True when a manual save would be accepted right now. */
  canSaveNow: boolean;
  /** True while a checkpoint push is running (AC-07b guard). */
  inFlight: boolean;
  /** Manual checkpoint trigger (AC-07). */
  onSaveNow: () => void;
}

/** Formats milliseconds as m:ss (e.g. 83 000 → "1:23"). */
function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function CheckpointCountdownBar({
  idle,
  remainingMs,
  canSaveNow,
  inFlight,
  onSaveNow,
}: CheckpointCountdownBarProps): React.ReactElement {
  const saveDisabled = !canSaveNow || inFlight;

  return (
    <div style={barStyle} data-testid="checkpoint-countdown-bar">
      {idle ? (
        <span style={idleTextStyle}>All saved</span>
      ) : inFlight ? (
        <span>Saving checkpoint…</span>
      ) : (
        <span>
          Next checkpoint in{' '}
          <span style={countdownTextStyle}>
            {formatCountdown(remainingMs ?? 0)}
          </span>
        </span>
      )}
      <button
        type="button"
        style={saveDisabled ? saveButtonDisabledStyle : saveButtonStyle}
        disabled={saveDisabled}
        onClick={onSaveNow}
        aria-label="Save checkpoint now"
      >
        Save
      </button>
    </div>
  );
}
