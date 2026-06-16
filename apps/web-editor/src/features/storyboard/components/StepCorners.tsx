/**
 * StepCorners — T19
 *
 * Buttons that let the Creator manually (re)trigger any pipeline phase.
 * Rendered inside the canvas bottom-left toolbar, to the right of ZoomToolbar.
 * Styled identically to Add Block / Add Music (canvasToolbarButton).
 * Each button opens a confirmation modal before triggering the phase.
 */

import React, { useState } from 'react';

import { GateError, triggerPhase } from '@/features/storyboard/api';
import type { PipelineState } from '@/features/storyboard/api';

import { referenceGateMessageStyles } from './ReferenceGateMessage.styles';
import { storyboardRegenerateConfirmModalStyles as ms } from './StoryboardRegenerateConfirmModal.styles';
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

const PHASE_MODAL_TITLE: Record<Phase, string> = {
  scene: 'Re-run scene generation?',
  reference_data: 'Re-run reference extraction?',
  reference_image: 'Re-run reference images?',
  scene_image: 'Re-run scene images?',
};

const PHASE_MODAL_DESCRIPTION: Record<Phase, string> = {
  scene:
    'This re-generates the scene plan from your script. The existing scenes on the canvas will be replaced with a new set. Any manual edits to scene text or order will be lost.',
  reference_data:
    'This re-extracts characters and locations from your scenes. The existing reference blocks will be replaced. Any custom edits or starred results tied to those blocks will be discarded.',
  reference_image:
    'This re-generates the visual reference images for every reference block. Previously generated images will be overwritten. Starred selections will be reset.',
  scene_image:
    'This re-generates the illustrated images for every scene. Previously generated scene illustrations will be overwritten.',
};

/** SVG refresh icon matching the Add-Block style (14×14). */
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

/** Inline confirmation modal — reuses the same visual layer as StoryboardRegenerateConfirmModal. */
function PhaseConfirmModal({
  phase,
  onConfirm,
  onCancel,
}: {
  phase: Phase;
  onConfirm: () => void;
  onCancel: () => void;
}): React.ReactElement {
  const dialogRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') { e.stopPropagation(); onCancel(); }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (e.target === e.currentTarget) onCancel();
  };

  return (
    <div
      style={ms.backdrop}
      onClick={handleBackdropClick}
      data-testid="step-corner-confirm-backdrop"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="step-corner-confirm-title"
        tabIndex={-1}
        style={ms.dialog}
        onKeyDown={handleKeyDown}
        data-testid="step-corner-confirm-modal"
      >
        <h2 id="step-corner-confirm-title" style={ms.title}>
          {PHASE_MODAL_TITLE[phase]}
        </h2>
        <p style={{ ...ms.body, margin: 0 }}>
          {PHASE_MODAL_DESCRIPTION[phase]}
        </p>
        <div style={ms.footer}>
          <button
            type="button"
            style={ms.cancelButton}
            onClick={onCancel}
            data-testid="step-corner-confirm-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            style={ms.confirmButton}
            onClick={onConfirm}
            data-testid="step-corner-confirm-run"
          >
            Re-run
          </button>
        </div>
      </div>
    </div>
  );
}

export function StepCorners({ draftId, state }: StepCornersProps): React.ReactElement {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingPhase, setPendingPhase] = useState<Phase | null>(null);

  const isPhaseRunning = state?.active_run_phase != null;

  function handleTrigger(phase: Phase): void {
    setPendingPhase(null);
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
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {PHASES.map((phase) => (
            <button
              key={phase}
              type="button"
              data-testid={`step-corner-trigger-${phase}`}
              disabled={isPhaseRunning}
              onClick={() => setPendingPhase(phase)}
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

      {pendingPhase !== null && (
        <PhaseConfirmModal
          phase={pendingPhase}
          onConfirm={() => handleTrigger(pendingPhase)}
          onCancel={() => setPendingPhase(null)}
        />
      )}
    </>
  );
}
