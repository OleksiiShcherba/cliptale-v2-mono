/**
 * BlockingLoader — full-screen blocking overlay rendered while a pipeline
 * run phase is active (`state.active_run_phase !== null`).
 *
 * Renders nothing when state is null or active_run_phase is null.
 *
 * Testids:
 *   data-testid="blocking-loader"         root overlay
 *   data-testid="blocking-loader-label"   phase label text
 *   data-testid="blocking-loader-cancel"  cancel button
 */

import React from 'react';

import type { PipelineState, PhaseName } from '@/features/storyboard/api';

import { blockingLoaderStyles as s } from './BlockingLoader.styles';

export interface BlockingLoaderProps {
  /** Current pipeline state from usePipelineState. Null = not yet loaded. */
  state: PipelineState | null;
  /**
   * Called when the user clicks the cancel control.
   * Receives the currently active run phase name.
   * Bound to cancelPhase by the parent.
   */
  onCancel: (phase: PhaseName) => void;
}

const PHASE_FALLBACK_LABELS: Record<PhaseName, string> = {
  scene: 'Generating scenes',
  reference_data: 'Analyzing cast',
  reference_image: 'Generating reference images',
  scene_image: 'Generating scene images',
};

function getLabel(phase: PhaseName, payload: unknown): string {
  if (
    payload !== null &&
    typeof payload === 'object' &&
    'loader_label' in payload &&
    typeof (payload as Record<string, unknown>).loader_label === 'string' &&
    ((payload as Record<string, unknown>).loader_label as string).length > 0
  ) {
    return (payload as Record<string, unknown>).loader_label as string;
  }
  return PHASE_FALLBACK_LABELS[phase];
}

export function BlockingLoader({ state, onCancel }: BlockingLoaderProps): React.ReactElement | null {
  if (state === null || state.active_run_phase === null) {
    return null;
  }

  const phase = state.active_run_phase;
  const label = getLabel(phase, state.payload);

  return (
    <div
      data-testid="blocking-loader"
      role="status"
      aria-live="polite"
      style={s.overlay}
    >
      <span data-testid="blocking-loader-label" style={s.label}>
        {label}
      </span>
      <button
        data-testid="blocking-loader-cancel"
        style={s.cancelButton}
        onClick={() => { onCancel(phase); }}
        type="button"
      >
        Cancel
      </button>
    </div>
  );
}
