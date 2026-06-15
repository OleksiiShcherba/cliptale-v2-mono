/**
 * ReviewCastProposalModal — component tests (T17).
 *
 * AC (T17 DoD): The modal reuses CastConfirmModal primitives, lists each
 * proposed reference with its AI-selected scenes and the reference-image cost
 * estimate, confirms via onConfirm and skips via onSkip; component tests cover
 * render, confirm and skip.
 *
 * State shape (verified against the backend, spec §5):
 *   state.phases.reference_data.status === 'awaiting_review'
 *   state.payload = { cast_proposal: { references: Array<{ name, kind, scene_ids }> } }
 *   state.cost_estimate = "1.2000"   (DECIMAL as string)
 *
 * Expected data-testids (implementer contract):
 *   review-cast-proposal-modal   — modal root (role=dialog)
 *   reference-row-<index>        — each reference list row
 *   reference-name-<index>       — reference name text inside that row
 *   reference-scenes-<index>     — scene representation (count or ids) inside that row
 *   cost-estimate                — the cost estimate value
 *   confirm-button               — the confirm / "Generate" button
 *   skip-button                  — the skip / "Skip" button
 *
 * Level: component (per test-plan.md T17 row).
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import type { PipelineState } from '@/features/storyboard/api';
import { ReviewCastProposalModal } from './ReviewCastProposalModal';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Cast proposal payload shape carried inside PipelineState.payload. */
type CastProposalPayload = {
  cast_proposal: {
    references: Array<{ name: string; kind: 'character' | 'environment'; scene_ids: string[] }>;
  };
};

function makeState(
  overrides: Partial<PipelineState> & { payload?: CastProposalPayload } = {},
): PipelineState {
  return {
    draft_id: 'draft-1',
    active_phase: 'reference_data',
    active_run_phase: null,
    phases: {
      scene: { status: 'completed' },
      reference_data: { status: 'awaiting_review' },
      reference_image: { status: 'idle' },
      scene_image: { status: 'idle' },
    },
    payload: overrides.payload ?? null,
    version: 1,
    cost_estimate: '1.2000',
    error_message: null,
    updated_at: '2026-06-15T00:00:00Z',
    ...overrides,
  };
}

const TWO_REFERENCES: CastProposalPayload = {
  cast_proposal: {
    references: [
      { name: 'Hero', kind: 'character', scene_ids: ['s1', 's2', 's3'] },
      { name: 'Forest', kind: 'environment', scene_ids: ['s4', 's5'] },
    ],
  },
};

const AWAITING_STATE = makeState({ payload: TWO_REFERENCES });

const NON_AWAITING_STATE = makeState({
  payload: TWO_REFERENCES,
  phases: {
    scene: { status: 'completed' },
    reference_data: { status: 'running' },
    reference_image: { status: 'idle' },
    scene_image: { status: 'idle' },
  },
});

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderModal(
  state: PipelineState | null,
  onConfirm = vi.fn(),
  onSkip = vi.fn(),
) {
  return render(
    <ReviewCastProposalModal state={state} onConfirm={onConfirm} onSkip={onSkip} />,
  );
}

// ---------------------------------------------------------------------------
// T17-render: modal renders only when reference_data is awaiting_review
// ---------------------------------------------------------------------------

describe('ReviewCastProposalModal — render', () => {
  it('renders both reference names when reference_data is awaiting_review', () => {
    renderModal(AWAITING_STATE);

    expect(screen.getByTestId('review-cast-proposal-modal')).toBeTruthy();
    expect(screen.getByTestId('reference-name-0').textContent).toMatch(/Hero/);
    expect(screen.getByTestId('reference-name-1').textContent).toMatch(/Forest/);
  });

  it('shows a scene representation for each reference (count or ids)', () => {
    renderModal(AWAITING_STATE);

    // Hero has 3 scene_ids; we assert something non-empty is shown.
    const heroScenes = screen.getByTestId('reference-scenes-0');
    expect(heroScenes.textContent?.trim().length).toBeGreaterThan(0);

    // Forest has 2 scene_ids.
    const forestScenes = screen.getByTestId('reference-scenes-1');
    expect(forestScenes.textContent?.trim().length).toBeGreaterThan(0);
  });

  it('shows the cost estimate from state.cost_estimate', () => {
    renderModal(AWAITING_STATE);

    const estimate = screen.getByTestId('cost-estimate');
    expect(estimate.textContent).toMatch(/1\.2/);
  });

  it('renders nothing when reference_data status is NOT awaiting_review', () => {
    const { container } = renderModal(NON_AWAITING_STATE);

    expect(screen.queryByTestId('review-cast-proposal-modal')).toBeNull();
    // The container must be empty (no modal shown).
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when state is null', () => {
    const { container } = renderModal(null);

    expect(screen.queryByTestId('review-cast-proposal-modal')).toBeNull();
    expect(container.firstChild).toBeNull();
  });

  it('renders both a confirm button and a skip button', () => {
    renderModal(AWAITING_STATE);

    expect(screen.getByTestId('confirm-button')).toBeTruthy();
    expect(screen.getByTestId('skip-button')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// T17-confirm: clicking confirm calls onConfirm exactly once
// ---------------------------------------------------------------------------

describe('ReviewCastProposalModal — confirm', () => {
  it('calls onConfirm once when the confirm button is clicked', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    renderModal(AWAITING_STATE, onConfirm);

    fireEvent.click(screen.getByTestId('confirm-button'));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });
  });

  it('does NOT call onSkip when the confirm button is clicked', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onSkip = vi.fn();
    renderModal(AWAITING_STATE, onConfirm, onSkip);

    fireEvent.click(screen.getByTestId('confirm-button'));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onSkip).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// T17-skip: clicking skip calls onSkip exactly once
// ---------------------------------------------------------------------------

describe('ReviewCastProposalModal — skip', () => {
  it('calls onSkip once when the skip button is clicked', async () => {
    const onSkip = vi.fn().mockResolvedValue(undefined);
    renderModal(AWAITING_STATE, vi.fn(), onSkip);

    fireEvent.click(screen.getByTestId('skip-button'));

    await waitFor(() => {
      expect(onSkip).toHaveBeenCalledTimes(1);
    });
  });

  it('does NOT call onConfirm when the skip button is clicked', async () => {
    const onConfirm = vi.fn();
    const onSkip = vi.fn().mockResolvedValue(undefined);
    renderModal(AWAITING_STATE, onConfirm, onSkip);

    fireEvent.click(screen.getByTestId('skip-button'));

    await waitFor(() => expect(onSkip).toHaveBeenCalledTimes(1));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
