/**
 * CheckpointCaptureOverlay — the full-screen loader shown during the
 * checkpoint capture moment (storyboard-autosave-checkpoints T11, AC-03).
 *
 * Rendered ONLY while a capture is running; unmounts (renders nothing) the
 * rest of the time so the canvas stays fully interactive.
 */

import React from 'react';

import { overlayStyle, spinnerStyle, spinnerKeyframes } from './CheckpointCaptureOverlay.styles';

export interface CheckpointCaptureOverlayProps {
  /** True while the checkpoint capture + push is running. */
  visible: boolean;
}

export function CheckpointCaptureOverlay({
  visible,
}: CheckpointCaptureOverlayProps): React.ReactElement | null {
  if (!visible) return null;

  return (
    <div role="status" aria-live="polite" style={overlayStyle} data-testid="checkpoint-capture-overlay">
      <style>{spinnerKeyframes}</style>
      <div style={spinnerStyle} aria-hidden="true" />
      <span>Saving checkpoint…</span>
    </div>
  );
}
