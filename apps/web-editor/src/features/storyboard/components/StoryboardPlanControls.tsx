/**
 * StoryboardPlanControls — compact Step 2 controls and blocking progress UI
 * for generating storyboard scenes from the AI plan.
 */

import React from 'react';

import type {
  StoryboardIllustrationLifecyclePhase,
  StoryboardIllustrationReferenceStatus,
  StoryboardIllustrationLifecycleStatus,
  StoryboardPlanGenerationStatus,
} from '@/features/storyboard/types';
import { buildAuthenticatedUrl } from '@/lib/api-client';
import { config } from '@/lib/config';

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

function getStoryboardIllustrationCopy(params: {
  status: StoryboardIllustrationLifecycleStatus;
  phase: StoryboardIllustrationLifecyclePhase;
}): { title: string; meta: string } {
  if (params.status === 'completed') {
    return {
      title: 'Illustrations ready',
      meta: 'Generated images are attached to the scene blocks.',
    };
  }
  if (params.status === 'failed') {
    return params.phase === 'reference'
      ? {
          title: 'Visual style reference failed',
          meta: 'Retry from this control.',
        }
      : {
          title: 'Illustration failed',
          meta: 'Retry failed scenes from their block.',
        };
  }
  if (params.phase === 'reference') {
    return {
      title: 'Creating visual style reference',
      meta: 'Setting the shared look before scene generation.',
    };
  }
  if (params.phase === 'scene') {
    return {
      title: 'Generating scene illustrations',
      meta: 'Scene images are being created in order.',
    };
  }
  return {
    title: 'Generate illustrations',
    meta: 'Create image drafts for each scene.',
  };
}

interface StoryboardIllustrationControlsProps {
  status: StoryboardIllustrationLifecycleStatus;
  phase: StoryboardIllustrationLifecyclePhase;
  reference: StoryboardIllustrationReferenceStatus | null;
  error: string | null;
  isBlocking: boolean;
  onStart: () => void;
}

function getReferencePreviewFallback(
  reference: StoryboardIllustrationReferenceStatus | null,
): string {
  if (!reference || reference.jobId === null) return 'Ref';
  if (reference.status === 'failed') return 'Failed';
  if (reference.status === 'ready') return 'Ref';
  return 'Wait';
}

function StoryboardReferencePreview({
  reference,
}: {
  reference: StoryboardIllustrationReferenceStatus | null;
}): React.ReactElement {
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    setFailed(false);
  }, [reference?.outputFileId]);

  const showImage = reference?.status === 'ready' && reference.outputFileId && !failed;
  const label = reference?.status === 'ready'
    ? 'Canonical visual style reference'
    : 'Canonical visual style reference status';

  return (
    <div
      style={s.referencePreview}
      aria-label={label}
      title={label}
      data-testid="storyboard-reference-preview"
    >
      {showImage ? (
        <img
          src={buildAuthenticatedUrl(`${config.apiBaseUrl}/assets/${reference.outputFileId}/thumbnail`)}
          alt="Canonical visual style reference"
          style={s.referencePreviewImage}
          loading="lazy"
          data-testid="storyboard-reference-preview-image"
          onError={() => setFailed(true)}
        />
      ) : (
        <span style={s.referencePreviewFallback} data-testid="storyboard-reference-preview-fallback">
          {getReferencePreviewFallback(reference)}
        </span>
      )}
    </div>
  );
}

export function StoryboardIllustrationControls({
  status,
  phase,
  reference,
  error,
  isBlocking,
  onStart,
}: StoryboardIllustrationControlsProps): React.ReactElement {
  const copy = getStoryboardIllustrationCopy({ status, phase });
  const isSceneFailure = status === 'failed' && phase === 'scene';
  const isReferenceFailure = status === 'failed' && phase === 'reference';
  const isDisabled = isBlocking || status === 'completed' || isSceneFailure;
  const buttonLabel = status === 'completed'
    ? 'Ready'
    : isReferenceFailure
      ? 'Retry'
      : 'Generate';

  return (
    <div style={{ ...s.control, ...s.illustrationControl }} data-testid="storyboard-illustration-controls">
      <div style={s.controlText}>
        <span style={s.controlTitle}>{copy.title}</span>
        <span
          style={status === 'failed' ? s.controlError : s.controlMeta}
          role={status === 'failed' ? 'alert' : undefined}
        >
          {status === 'failed' ? (error ?? copy.meta) : copy.meta}
        </span>
      </div>
      <StoryboardReferencePreview reference={reference} />
      {status === 'completed' && (
        <span aria-label="Illustrations complete" style={{ color: SUCCESS, fontSize: '12px', fontWeight: 600 }}>
          Ready
        </span>
      )}
      <button
        type="button"
        style={isDisabled ? s.buttonDisabled : s.button}
        disabled={isDisabled}
        aria-disabled={isDisabled}
        onClick={onStart}
        data-testid="storyboard-illustration-generate-button"
      >
        {buttonLabel}
      </button>
    </div>
  );
}
