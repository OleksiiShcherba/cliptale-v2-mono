/**
 * SceneImageOfferModal — T18.
 *
 * Offer modal for the scene_image phase: shows the cost estimate and scene
 * count, then lets the creator accept (triggerPhase) or skip (skipPhase).
 *
 * Visibility rule: render ONLY when
 *   state?.phases?.scene_image?.status === 'awaiting_review'
 * Full optional chaining is used; some callers pass phases: {}.
 *
 * Expected data-testids:
 *   scene-image-offer-modal  — modal root
 *   cost-estimate            — the cost estimate value
 *   scene-count              — the number of scenes that will be processed
 *   accept-button            — calls onAccept
 *   skip-button              — calls onSkip
 */

import React from 'react';

import type { PipelineState } from '@/features/storyboard/api';
import { castConfirmModalStyles } from './CastConfirmModal.styles';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SceneImageOfferModalProps = {
  state: PipelineState | null;
  onAccept: () => void | Promise<void>;
  onSkip: () => void | Promise<void>;
};

/** Shape of the scene_image_offer payload (state.payload narrowed below). */
type SceneImageOfferPayload = {
  scene_image_offer: { scene_count: number };
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Narrow state.payload (typed unknown) to SceneImageOfferPayload or null. */
function extractSceneCount(payload: unknown): number | null {
  if (payload === null || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  if (!('scene_image_offer' in p) || typeof p['scene_image_offer'] !== 'object') return null;
  const offer = p['scene_image_offer'] as Record<string, unknown>;
  if (typeof offer['scene_count'] !== 'number') return null;
  return offer['scene_count'];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SceneImageOfferModal({
  state,
  onAccept,
  onSkip,
}: SceneImageOfferModalProps): React.ReactElement | null {
  if (state?.phases?.scene_image?.status !== 'awaiting_review') return null;

  const sceneCount = extractSceneCount(state.payload);

  return (
    <div
      data-testid="scene-image-offer-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Generate scene images"
      style={castConfirmModalStyles.backdrop}
    >
      <section style={castConfirmModalStyles.panel}>
        {/* Header */}
        <header style={castConfirmModalStyles.header}>
          <div style={castConfirmModalStyles.titleGroup}>
            <h2 style={castConfirmModalStyles.title}>Generate scene images</h2>
            <span style={castConfirmModalStyles.subtitle}>
              AI will generate images for your scenes using the approved references.
            </span>
          </div>
        </header>

        {/* Body */}
        <div style={castConfirmModalStyles.body}>
          {sceneCount !== null && (
            <div style={castConfirmModalStyles.message}>
              Scenes to process:{' '}
              <span data-testid="scene-count" style={{ fontWeight: 600 }}>
                {sceneCount}
              </span>
            </div>
          )}

          {/* Cost estimate */}
          <div data-testid="cost-estimate" style={castConfirmModalStyles.estimate}>
            <span>Estimated cost</span>
            <span style={castConfirmModalStyles.estimateAmount}>
              {state.cost_estimate ?? '—'}
            </span>
          </div>
        </div>

        {/* Footer */}
        <div style={castConfirmModalStyles.footer}>
          <button
            type="button"
            data-testid="skip-button"
            onClick={() => { void Promise.resolve(onSkip()); }}
            style={castConfirmModalStyles.secondaryButton}
          >
            Skip
          </button>
          <button
            type="button"
            data-testid="accept-button"
            onClick={() => { void Promise.resolve(onAccept()); }}
            style={castConfirmModalStyles.primaryButton}
          >
            Generate
          </button>
        </div>
      </section>
    </div>
  );
}
