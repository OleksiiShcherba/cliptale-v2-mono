/**
 * SceneImageOfferModal — component tests (T18).
 *
 * AC (T18 DoD): The modal shows the scene-image cost estimate, accepts via
 * triggerPhase(scene_image) and skips via skipPhase; component tests cover
 * accept and skip.
 *
 * State shape (verified against the backend, spec §5 / data-model):
 *   state.phases.scene_image.status === 'awaiting_review'
 *   state.payload = { scene_image_offer: { scene_count: number } }
 *   state.cost_estimate = "2.4000"   (DECIMAL as string)
 *
 * Expected data-testids (implementer contract):
 *   scene-image-offer-modal  — modal root
 *   cost-estimate            — the cost estimate value
 *   scene-count              — the number of scenes that will be processed
 *   accept-button            — the accept / "Generate" button (calls onAccept)
 *   skip-button              — the skip / "Skip" button (calls onSkip)
 *
 * Level: component (per test-plan.md T18 row).
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import type { PipelineState } from '@/features/storyboard/api';
import { SceneImageOfferModal } from './SceneImageOfferModal';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Payload shape for the scene_image phase offer. */
type SceneImageOfferPayload = {
  scene_image_offer: { scene_count: number };
};

function makeState(
  overrides: Partial<PipelineState> & { payload?: SceneImageOfferPayload } = {},
): PipelineState {
  return {
    draft_id: 'draft-1',
    active_phase: 'scene_image',
    active_run_phase: null,
    phases: {
      scene: { status: 'completed' },
      reference_data: { status: 'completed' },
      reference_image: { status: 'completed' },
      scene_image: { status: 'awaiting_review' },
    },
    payload: overrides.payload ?? null,
    version: 1,
    cost_estimate: '2.4000',
    error_message: null,
    updated_at: '2026-06-15T00:00:00Z',
    ...overrides,
  };
}

const OFFER_PAYLOAD: SceneImageOfferPayload = {
  scene_image_offer: { scene_count: 6 },
};

const AWAITING_STATE = makeState({ payload: OFFER_PAYLOAD });

const NON_AWAITING_STATE = makeState({
  payload: OFFER_PAYLOAD,
  phases: {
    scene: { status: 'completed' },
    reference_data: { status: 'completed' },
    reference_image: { status: 'completed' },
    scene_image: { status: 'running' },
  },
});

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderModal(
  state: PipelineState | null,
  onAccept = vi.fn(),
  onSkip = vi.fn(),
) {
  return render(
    <SceneImageOfferModal state={state} onAccept={onAccept} onSkip={onSkip} />,
  );
}

// ---------------------------------------------------------------------------
// T18-render: modal renders only when scene_image is awaiting_review;
//             shows cost estimate and scene count; both controls present.
// ---------------------------------------------------------------------------

describe('SceneImageOfferModal — render', () => {
  it('renders the modal root when scene_image is awaiting_review', () => {
    renderModal(AWAITING_STATE);

    expect(screen.getByTestId('scene-image-offer-modal')).toBeTruthy();
  });

  it('shows the cost estimate from state.cost_estimate', () => {
    renderModal(AWAITING_STATE);

    const estimate = screen.getByTestId('cost-estimate');
    expect(estimate.textContent).toMatch(/2\.4/);
  });

  it('shows the scene count from the payload (scene_count: 6)', () => {
    renderModal(AWAITING_STATE);

    const sceneCount = screen.getByTestId('scene-count');
    expect(sceneCount.textContent).toMatch(/6/);
  });

  it('renders both an accept button and a skip button', () => {
    renderModal(AWAITING_STATE);

    expect(screen.getByTestId('accept-button')).toBeTruthy();
    expect(screen.getByTestId('skip-button')).toBeTruthy();
  });

  it('renders nothing when scene_image status is NOT awaiting_review (e.g. running)', () => {
    const { container } = renderModal(NON_AWAITING_STATE);

    expect(screen.queryByTestId('scene-image-offer-modal')).toBeNull();
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when state is null', () => {
    const { container } = renderModal(null);

    expect(screen.queryByTestId('scene-image-offer-modal')).toBeNull();
    expect(container.firstChild).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T18-accept: clicking accept calls onAccept exactly once, not onSkip.
// ---------------------------------------------------------------------------

describe('SceneImageOfferModal — accept', () => {
  it('calls onAccept once when the accept button is clicked', async () => {
    const onAccept = vi.fn().mockResolvedValue(undefined);
    renderModal(AWAITING_STATE, onAccept);

    fireEvent.click(screen.getByTestId('accept-button'));

    await waitFor(() => {
      expect(onAccept).toHaveBeenCalledTimes(1);
    });
  });

  it('does NOT call onSkip when the accept button is clicked', async () => {
    const onAccept = vi.fn().mockResolvedValue(undefined);
    const onSkip = vi.fn();
    renderModal(AWAITING_STATE, onAccept, onSkip);

    fireEvent.click(screen.getByTestId('accept-button'));

    await waitFor(() => expect(onAccept).toHaveBeenCalledTimes(1));
    expect(onSkip).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// T18-skip: clicking skip calls onSkip exactly once, not onAccept.
// ---------------------------------------------------------------------------

describe('SceneImageOfferModal — skip', () => {
  it('calls onSkip once when the skip button is clicked', async () => {
    const onSkip = vi.fn().mockResolvedValue(undefined);
    renderModal(AWAITING_STATE, vi.fn(), onSkip);

    fireEvent.click(screen.getByTestId('skip-button'));

    await waitFor(() => {
      expect(onSkip).toHaveBeenCalledTimes(1);
    });
  });

  it('does NOT call onAccept when the skip button is clicked', async () => {
    const onAccept = vi.fn();
    const onSkip = vi.fn().mockResolvedValue(undefined);
    renderModal(AWAITING_STATE, onAccept, onSkip);

    fireEvent.click(screen.getByTestId('skip-button'));

    await waitFor(() => expect(onSkip).toHaveBeenCalledTimes(1));
    expect(onAccept).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// T18-guard: modal renders nothing for any non-awaiting_review phase status
//            and when state is null — guard against accidental rendering.
// ---------------------------------------------------------------------------

describe('SceneImageOfferModal — guard (non-awaiting_review and null)', () => {
  const GUARD_CASES: Array<{ label: string; state: PipelineState | null }> = [
    {
      label: 'scene_image running',
      state: makeState({
        payload: OFFER_PAYLOAD,
        phases: {
          scene: { status: 'completed' },
          reference_data: { status: 'completed' },
          reference_image: { status: 'completed' },
          scene_image: { status: 'running' },
        },
      }),
    },
    {
      label: 'scene_image idle',
      state: makeState({
        payload: OFFER_PAYLOAD,
        phases: {
          scene: { status: 'completed' },
          reference_data: { status: 'completed' },
          reference_image: { status: 'completed' },
          scene_image: { status: 'idle' },
        },
      }),
    },
    {
      label: 'scene_image completed',
      state: makeState({
        payload: OFFER_PAYLOAD,
        phases: {
          scene: { status: 'completed' },
          reference_data: { status: 'completed' },
          reference_image: { status: 'completed' },
          scene_image: { status: 'completed' },
        },
      }),
    },
    {
      label: 'scene_image skipped',
      state: makeState({
        payload: OFFER_PAYLOAD,
        phases: {
          scene: { status: 'completed' },
          reference_data: { status: 'completed' },
          reference_image: { status: 'completed' },
          scene_image: { status: 'skipped' },
        },
      }),
    },
    {
      label: 'phases object is empty (sibling test pattern)',
      state: {
        draft_id: 'draft-1',
        active_phase: 'scene_image',
        active_run_phase: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        phases: {} as any,
        payload: OFFER_PAYLOAD,
        version: 1,
        cost_estimate: '2.4000',
        error_message: null,
        updated_at: null,
      },
    },
    { label: 'state is null', state: null },
  ];

  it.each(GUARD_CASES)(
    'renders nothing when $label',
    ({ state }) => {
      const { container } = renderModal(state);

      expect(screen.queryByTestId('scene-image-offer-modal')).toBeNull();
      expect(container.firstChild).toBeNull();
    },
  );
});
