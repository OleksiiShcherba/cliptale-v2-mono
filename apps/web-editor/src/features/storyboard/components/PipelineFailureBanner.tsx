/**
 * PipelineFailureBanner — review r3 F2 (AC-12).
 *
 * AC-12 requires that a whole-phase failure tells the Creator WHAT failed and
 * offers a retry — for every phase. The scene and scene_image phases already
 * surface this through their status-block controls (StoryboardPlanControls /
 * StoryboardIllustrationControls). The reference_data and reference_image phases
 * have no such controls, so when one of them fails the BlockingLoader simply
 * unmounts (active_run_phase → null) and nothing explains the failure. This
 * banner closes that gap: it renders an alert with the server's error_message
 * and a Retry that re-triggers the failed phase via the pipeline API.
 */

import React, { useState } from 'react';

import { triggerPhase } from '@/features/storyboard/api';
import type { PipelineState, PhaseName } from '@/features/storyboard/api';

import { referenceGateMessageStyles } from './ReferenceGateMessage.styles';

export interface PipelineFailureBannerProps {
  draftId: string;
  state: PipelineState | null;
}

/** Reference phases lack their own failure surface — this banner covers them. */
const REFERENCE_PHASES: readonly PhaseName[] = ['reference_data', 'reference_image'];

const PHASE_LABELS: Record<string, string> = {
  reference_data: 'Reference data',
  reference_image: 'Reference image',
};

export function PipelineFailureBanner({
  draftId,
  state,
}: PipelineFailureBannerProps): React.ReactElement | null {
  const [retrying, setRetrying] = useState(false);

  if (state === null) return null;

  const failedPhase = REFERENCE_PHASES.find(
    (phase) => state.phases[phase]?.status === 'failed',
  );
  if (failedPhase === undefined) return null;

  function handleRetry(phase: PhaseName) {
    setRetrying(true);
    triggerPhase(draftId, phase)
      .catch((err: unknown) => {
        console.error('[PipelineFailureBanner] retry triggerPhase failed:', err);
      })
      .finally(() => {
        setRetrying(false);
      });
  }

  const detail = state.error_message ? `: ${state.error_message}` : '.';

  return (
    <div
      role="alert"
      data-testid="pipeline-failure-banner"
      style={{ ...referenceGateMessageStyles.root, display: 'flex', alignItems: 'center', gap: 12 }}
    >
      <span style={{ flex: 1 }}>
        {PHASE_LABELS[failedPhase]} generation failed{detail}
      </span>
      <button
        type="button"
        data-testid="pipeline-failure-retry"
        disabled={retrying}
        onClick={() => handleRetry(failedPhase)}
        style={{
          fontSize: 13,
          padding: '4px 12px',
          cursor: retrying ? 'default' : 'pointer',
          borderRadius: 4,
          border: '1px solid #991B1B',
          background: 'transparent',
          color: '#991B1B',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        {retrying ? 'Retrying…' : 'Retry'}
      </button>
    </div>
  );
}
