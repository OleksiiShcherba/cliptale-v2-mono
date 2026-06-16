/**
 * StepCorners — T19
 *
 * Buttons that let the Creator manually (re)trigger any pipeline phase.
 * Rendered inside the canvas bottom-left toolbar, to the right of ZoomToolbar.
 * Styled identically to Add Block / Add Music (canvasToolbarButton).
 */

import React, { useState } from 'react';

import { GateError, triggerPhase } from '@/features/storyboard/api';
import type { PipelineState } from '@/features/storyboard/api';

import { referenceGateMessageStyles } from './ReferenceGateMessage.styles';
import { storyboardPageStyles as s } from './storyboardPageStyles';

export interface StepCornersProps {
  draftId: string;
  state: PipelineState | null;
}

const PHASES = ['scene', 'reference_data', 'reference_image', 'scene_image'] as const;
type Phase = (typeof PHASES)[number];

const PHASE_LABELS: Record<Phase, string> = {
  scene: 'Scenes',
  reference_data: 'References',
  reference_image: 'Ref Images',
  scene_image: 'Scene Images',
};

/** SVG refresh icon matching the Add-Block style (16×16). */
function RefreshIcon(): React.ReactElement {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path
        d="M2.5 7A4.5 4.5 0 0 1 7 2.5a4.5 4.5 0 0 1 3.6 1.8L9.5 5.5H13V2l-1.3 1.3A6 6 0 0 0 7 1a6 6 0 0 0-6 6h1.5ZM11.5 7A4.5 4.5 0 0 1 7 11.5a4.5 4.5 0 0 1-3.6-1.8L4.5 8.5H1V12l1.3-1.3A6 6 0 0 0 7 13a6 6 0 0 0 6-6h-1.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function StepCorners({ draftId, state }: StepCornersProps): React.ReactElement {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isPhaseRunning = state?.active_run_phase != null;

  function handleTrigger(phase: Phase): void {
    triggerPhase(draftId, phase)
      .then(() => {
        setErrorMessage(null);
      })
      .catch((err: unknown) => {
        if (err instanceof GateError) {
          setErrorMessage(err.message);
        } else {
          console.error('triggerPhase failed', err);
        }
      });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        {PHASES.map((phase) => (
          <button
            key={phase}
            type="button"
            data-testid={`step-corner-trigger-${phase}`}
            disabled={isPhaseRunning}
            onClick={() => handleTrigger(phase)}
            style={isPhaseRunning ? s.canvasToolbarButtonDisabled : s.canvasToolbarButton}
          >
            <RefreshIcon />
            {PHASE_LABELS[phase]}
          </button>
        ))}
      </div>
      {errorMessage !== null && (
        <div role="alert" style={referenceGateMessageStyles.root}>
          {errorMessage}
        </div>
      )}
    </div>
  );
}
