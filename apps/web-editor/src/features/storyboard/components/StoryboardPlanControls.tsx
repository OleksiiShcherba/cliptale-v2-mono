/**
 * StoryboardPlanControls — compact Step 2 controls and blocking progress UI
 * for generating storyboard scenes from the AI plan.
 */

import React from 'react';

import type {
  StoryboardIllustrationLifecyclePhase,
  StoryboardIllustrationLifecycleStatus,
  StoryboardPlanGenerationStatus,
} from '@/features/storyboard/types';
import { storyboardPlanControlStyles as s } from './StoryboardPlanControls.styles';
import { StoryboardStatusMenu } from './StoryboardStatusMenu';
import { SUCCESS } from './storyboardPageStyles';

/**
 * Owner-gated status-menu wiring shared by both completed status blocks.
 * The menu only mounts on the completed state (AC-06) and only renders for the
 * draft owner (AC-09, enforced inside StoryboardStatusMenu). Defaults keep the
 * props optional so callers that do not (yet) wire the menu still type-check.
 */
interface StoryboardStatusMenuWiring {
  isOwner?: boolean;
  onRegenerate?: () => void;
  onHide?: () => void;
}

interface StoryboardPlanControlsProps extends StoryboardStatusMenuWiring {
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
  isOwner = false,
  onRegenerate,
  onHide,
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
        {status === 'completed' && (
          <StoryboardStatusMenu
            isOwner={isOwner}
            label={copy.title}
            onRegenerate={() => onRegenerate?.()}
            onHide={() => onHide?.()}
          />
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
    return {
      title: 'Illustration failed',
      meta: 'Retry failed scenes from their block.',
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
    meta: 'Scene images start automatically once references are ready.',
  };
}

interface StoryboardIllustrationControlsProps extends StoryboardStatusMenuWiring {
  status: StoryboardIllustrationLifecycleStatus;
  phase: StoryboardIllustrationLifecyclePhase;
  error: string | null;
  /** When the sibling plan block is hidden, reflow up into its (top) slot (AC-02). */
  reflowToTop?: boolean;
  /**
   * When true, a structured gate error is being shown elsewhere in the page (e.g.
   * ReferenceGateMessage).  Suppresses the inline role="alert" so there is only one
   * alert region in the document (AC-02).
   */
  hasStructuredGateError?: boolean;
}

export function StoryboardIllustrationControls({
  status,
  phase,
  error,
  isOwner = false,
  onRegenerate,
  onHide,
  reflowToTop = false,
  hasStructuredGateError = false,
}: StoryboardIllustrationControlsProps): React.ReactElement {
  const copy = getStoryboardIllustrationCopy({ status, phase });
  // Suppress the inline alert role when a structured gate error message is shown
  // elsewhere in the page — prevents duplicate role="alert" elements (AC-02).
  const suppressInlineAlert = status === 'failed' && hasStructuredGateError;
  // AC-12 (review r4 F1): a co-located Retry on a genuine whole-phase scene-image
  // failure — wired to onRegenerate (→ triggerPhase('scene_image')), mirroring the
  // scene-phase control. NOT shown for a structured gate error (a prerequisite block,
  // AC-08/AC-15), whose dedicated guard message + corner controls drive the retry.
  const showRetry = status === 'failed' && !hasStructuredGateError;

  return (
    <div
      style={reflowToTop ? s.control : { ...s.control, ...s.illustrationControl }}
      data-testid="storyboard-illustration-controls"
    >
      <div style={s.controlText}>
        <span style={s.controlTitle}>{copy.title}</span>
        <span
          style={status === 'failed' ? s.controlError : s.controlMeta}
          role={status === 'failed' && !suppressInlineAlert ? 'alert' : undefined}
        >
          {status === 'failed' ? (error ?? copy.meta) : copy.meta}
        </span>
      </div>
      {status === 'completed' && (
        <span aria-label="Illustrations complete" style={{ color: SUCCESS, fontSize: '12px', fontWeight: 600 }}>
          Done
        </span>
      )}
      {status === 'completed' && (
        <StoryboardStatusMenu
          isOwner={isOwner}
          label={copy.title}
          onRegenerate={() => onRegenerate?.()}
          onHide={() => onHide?.()}
        />
      )}
      {showRetry && (
        <button
          type="button"
          style={s.button}
          onClick={() => onRegenerate?.()}
          data-testid="storyboard-illustration-retry-button"
        >
          Retry
        </button>
      )}
    </div>
  );
}
