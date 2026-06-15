/**
 * ReviewCastProposalModal — T17.
 *
 * Read-only review modal for the pipeline's cast proposal (reference_data phase
 * awaiting_review). Lists each proposed reference with its AI-selected scene ids
 * and the cost estimate, then lets the creator confirm or skip.
 *
 * Reuses CastConfirmModal shell primitives (castConfirmModalStyles) so the visual
 * chrome matches the rest of the cast flow.
 */

import React from 'react';

import type { PipelineState } from '@/features/storyboard/api';
import { castConfirmModalStyles } from './CastConfirmModal.styles';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReviewCastProposalModalProps = {
  state: PipelineState | null;
  onConfirm: () => void | Promise<void>;
  onSkip: () => void | Promise<void>;
};

/** Shape of a single reference entry inside the pipeline cast_proposal payload. */
type CastReference = {
  name: string;
  kind: 'character' | 'environment';
  scene_ids: string[];
};

/** Shape of the cast_proposal payload (unknown → narrowed below). */
type CastProposalPayload = {
  cast_proposal: {
    references: CastReference[];
  };
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Narrow state.payload (typed unknown) to CastProposalPayload or null. */
function extractReferences(payload: unknown): CastReference[] | null {
  if (payload === null || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  if (!('cast_proposal' in p) || typeof p['cast_proposal'] !== 'object') return null;
  const cp = p['cast_proposal'] as Record<string, unknown>;
  if (!Array.isArray(cp['references'])) return null;
  return cp['references'] as CastReference[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReviewCastProposalModal({
  state,
  onConfirm,
  onSkip,
}: ReviewCastProposalModalProps): React.ReactElement | null {
  if (state?.phases?.reference_data?.status !== 'awaiting_review') return null;

  const references = extractReferences(state.payload) ?? [];

  return (
    <div
      data-testid="review-cast-proposal-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Review cast proposal"
      style={castConfirmModalStyles.backdrop}
    >
      <section style={castConfirmModalStyles.panel}>
        {/* Header */}
        <header style={castConfirmModalStyles.header}>
          <div style={castConfirmModalStyles.titleGroup}>
            <h2 style={castConfirmModalStyles.title}>Review cast proposal</h2>
            <span style={castConfirmModalStyles.subtitle}>
              Review AI-selected references before generating reference images.
            </span>
          </div>
        </header>

        {/* Body — reference list */}
        <div style={castConfirmModalStyles.body}>
          <div style={castConfirmModalStyles.section}>
            {references.map((ref, index) => (
              <div
                key={index}
                data-testid={`reference-row-${index}`}
                style={castConfirmModalStyles.entryEditor}
              >
                <span
                  data-testid={`reference-name-${index}`}
                  style={{ fontWeight: 600 }}
                >
                  {ref.name}
                </span>
                <span
                  data-testid={`reference-scenes-${index}`}
                  style={castConfirmModalStyles.message}
                >
                  {ref.scene_ids.length === 1
                    ? '1 scene'
                    : `${ref.scene_ids.length} scenes`}
                </span>
              </div>
            ))}
          </div>

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
            data-testid="confirm-button"
            onClick={() => { void Promise.resolve(onConfirm()); }}
            style={castConfirmModalStyles.primaryButton}
          >
            Generate
          </button>
        </div>
      </section>
    </div>
  );
}
