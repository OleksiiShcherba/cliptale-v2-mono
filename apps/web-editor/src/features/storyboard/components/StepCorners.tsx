/**
 * StepCorners — T19
 *
 * Corner affordances that let the Creator manually (re)trigger any pipeline
 * phase. On click calls triggerPhase(draftId, phase) from the storyboard api.
 * On GateError, surfaces the server's plain-language message verbatim in a
 * role="alert" block, reusing referenceGateMessageStyles for presentation.
 * A subsequent successful trigger clears the alert.
 */

import React, { useState } from 'react';

import { GateError, triggerPhase } from '@/features/storyboard/api';
import type { PipelineState } from '@/features/storyboard/api';

import { referenceGateMessageStyles } from './ReferenceGateMessage.styles';

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

export function StepCorners({ draftId, state }: StepCornersProps): React.ReactElement {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // F7: while a phase is actively running the server would reject any new trigger
  // (single-active-run, AC-14); disable the corners so the Creator isn't invited to
  // click a control that can only fail.
  const isPhaseRunning = state?.active_run_phase != null;

  function handleTrigger(phase: Phase) {
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
      <div style={{ display: 'flex', gap: 4 }}>
        {PHASES.map((phase) => (
          <button
            key={phase}
            data-testid={`step-corner-trigger-${phase}`}
            disabled={isPhaseRunning}
            onClick={() => handleTrigger(phase)}
            style={{
              fontSize: 11,
              padding: '2px 8px',
              cursor: isPhaseRunning ? 'default' : 'pointer',
              borderRadius: 4,
              border: '1px solid #555',
              background: 'transparent',
              color: isPhaseRunning ? '#666' : '#ccc',
              fontFamily: 'Inter, sans-serif',
            }}
          >
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
