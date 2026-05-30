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
  onRetry: () => void;
}

export const STORYBOARD_PLAN_STATUS_COPY: Record<StoryboardPlanGenerationStatus, { title: string; meta: string }> = {
  idle: {
    title: 'Scene planning',
    meta: 'Ordered storyboard scenes start automatically for new drafts.',
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

export function StoryboardPlanControls({
  status,
  error,
  isBlocking,
  onRetry,
}: StoryboardPlanControlsProps): React.ReactElement {
  const copy = STORYBOARD_PLAN_STATUS_COPY[status];
  const isDisabled = isBlocking;
  const showRetry = status === 'failed';

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
        {showRetry && (
          <button
            type="button"
            style={isDisabled ? s.buttonDisabled : s.button}
            disabled={isDisabled}
            aria-disabled={isDisabled}
            onClick={onRetry}
            data-testid="storyboard-plan-retry-button"
          >
            Retry
          </button>
        )}
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
    title: 'Illustration status',
    meta: 'Scene images start automatically after the principal image is approved.',
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
  isSceneGenerationActive,
}: {
  reference: StoryboardIllustrationReferenceStatus | null;
  isSceneGenerationActive: boolean;
}): React.ReactElement {
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    setFailed(false);
  }, [reference?.outputFileId]);

  const showImage = reference?.status === 'ready' && reference.outputFileId && !failed;
  const isWaiting = reference !== null &&
    reference.jobId !== null &&
    (reference.status === 'queued' || reference.status === 'running');
  const label = reference?.status === 'ready'
    ? 'Canonical visual style reference'
    : 'Canonical visual style reference status';
  const showSceneLoader = isSceneGenerationActive && !showImage && !(reference?.status === 'ready' && failed);
  const previewLabel = showSceneLoader ? 'Scene illustration generation in progress' : label;

  return (
    <div
      style={s.referencePreview}
      aria-label={showSceneLoader ? undefined : previewLabel}
      title={previewLabel}
      data-testid="storyboard-reference-preview"
    >
      {isWaiting || showSceneLoader ? (
        <style>
          {'@keyframes storyboard-reference-spin { to { transform: rotate(360deg); } }'}
        </style>
      ) : null}
      {showSceneLoader ? (
        <span
          style={s.referencePreviewFallback}
          data-testid="storyboard-reference-preview-fallback"
          role="status"
          aria-label="Scene illustration generation in progress"
        >
          <span style={s.referencePreviewSpinner} aria-hidden="true" data-testid="storyboard-reference-loader" />
        </span>
      ) : showImage ? (
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
          {isWaiting ? (
            <>
              <span style={s.referencePreviewSpinner} aria-hidden="true" data-testid="storyboard-reference-loader" />
            </>
          ) : null}
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
  const isSceneGenerationActive = phase === 'scene' && (status === 'queued' || status === 'running');
  const isDisabled = isBlocking || isSceneFailure;

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
      {/* AC-04: the completed "Illustrations ready" block drops the "Ref" box for
          every viewer so it reads as its sibling. In-progress / failed states
          keep the preview (spec non-goal: those states are unchanged). */}
      {status !== 'completed' && (
        <StoryboardReferencePreview reference={reference} isSceneGenerationActive={isSceneGenerationActive} />
      )}
      {status === 'completed' && (
        <span aria-label="Illustrations complete" style={{ color: SUCCESS, fontSize: '12px', fontWeight: 600 }}>
          Done
        </span>
      )}
      {isReferenceFailure && (
        <button
          type="button"
          style={isDisabled ? s.buttonDisabled : s.button}
          disabled={isDisabled}
          aria-disabled={isDisabled}
          onClick={onStart}
          data-testid="storyboard-illustration-retry-button"
        >
          Retry
        </button>
      )}
    </div>
  );
}
