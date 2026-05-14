/**
 * StoryboardPlanControls — compact Step 2 controls and blocking progress UI
 * for generating storyboard scenes from the AI plan.
 */

import React from 'react';

import type { StoryboardPlanGenerationStatus } from '@/features/storyboard/types';

import { storyboardPlanControlStyles as s } from './StoryboardPlanControls.styles';
import { SUCCESS } from './storyboardPageStyles';

interface StoryboardPlanControlsProps {
  status: StoryboardPlanGenerationStatus;
  error: string | null;
  isBlocking: boolean;
  onStart: () => void;
  onRetry: () => void;
}

export const STORYBOARD_PLAN_STATUS_COPY: Record<StoryboardPlanGenerationStatus, { title: string; meta: string }> = {
  idle: {
    title: 'Generate scenes',
    meta: 'Create ordered storyboard scenes from the AI plan.',
  },
  queued: {
    title: 'Generation queued',
    meta: 'Waiting for the planning worker to start.',
  },
  running: {
    title: 'Generating scenes',
    meta: 'Building scene order, prompts, timing, and media references.',
  },
  applying: {
    title: 'Applying scenes',
    meta: 'Replacing the canvas with the generated storyboard.',
  },
  completed: {
    title: 'Generated scenes applied',
    meta: 'The canvas now reflects the latest AI plan.',
  },
  failed: {
    title: 'Generation failed',
    meta: 'The draft is unchanged. Retry when you are ready.',
  },
};

function getActionLabel(status: StoryboardPlanGenerationStatus): string {
  if (status === 'failed') return 'Retry';
  if (status === 'completed') return 'Regenerate';
  return 'Generate';
}

export function StoryboardPlanControls({
  status,
  error,
  isBlocking,
  onStart,
  onRetry,
}: StoryboardPlanControlsProps): React.ReactElement {
  const copy = STORYBOARD_PLAN_STATUS_COPY[status];
  const isDisabled = isBlocking;
  const actionLabel = getActionLabel(status);
  const handleClick = status === 'failed' ? onRetry : onStart;

  return (
    <>
      <div style={s.control} data-testid="storyboard-plan-controls">
        <div style={s.controlText}>
          <span style={s.controlTitle}>{copy.title}</span>
          <span
            style={status === 'failed' ? s.controlError : s.controlMeta}
            role={status === 'failed' ? 'alert' : undefined}
          >
            {status === 'failed' ? (error ?? copy.meta) : copy.meta}
          </span>
        </div>
        {status === 'completed' && (
          <span aria-label="Generation complete" style={{ color: SUCCESS, fontSize: '12px', fontWeight: 600 }}>
            Done
          </span>
        )}
        <button
          type="button"
          style={isDisabled ? s.buttonDisabled : s.button}
          disabled={isDisabled}
          aria-disabled={isDisabled}
          onClick={handleClick}
          data-testid="storyboard-plan-generate-button"
        >
          {actionLabel}
        </button>
      </div>
    </>
  );
}

interface StoryboardPlanBlockingOverlayProps {
  status: StoryboardPlanGenerationStatus;
}

export function StoryboardPlanBlockingOverlay({
  status,
}: StoryboardPlanBlockingOverlayProps): React.ReactElement {
  const copy = STORYBOARD_PLAN_STATUS_COPY[status];

  return (
    <div
      style={s.overlay}
      role="status"
      aria-live="polite"
      aria-label={copy.title}
      data-testid="storyboard-plan-overlay"
    >
      <div style={s.overlayPanel}>
        <div style={s.spinner} aria-hidden="true" />
        <span style={s.overlayTitle}>{copy.title}</span>
        <span style={s.overlayText}>{copy.meta}</span>
      </div>
    </div>
  );
}
