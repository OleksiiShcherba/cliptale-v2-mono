/**
 * pipeline.e2e.test.tsx — E2E-through-UI coverage for the storyboard generation
 * pipeline (T20, storyboard-generation-pipeline).
 *
 * Render surface choice:
 *   A lightweight harness component (`PipelineHarness`) that renders the REAL
 *   `usePipelineState` hook directly wired to the REAL `BlockingLoader`,
 *   `ReviewCastProposalModal`, `SceneImageOfferModal`, and `StepCorners`
 *   components — exactly as `StoryboardPage` wires them. A full `StoryboardPage`
 *   mount was avoided because it drags in `@xyflow/react`, `useStoryboardCanvas`,
 *   `useStoryboardHistorySeed`, `useStoryboardMusic` etc. whose mocking overhead
 *   would hide harness bugs and make the test brittle. The harness faithfully
 *   replicates only the pipeline slice:
 *
 *     usePipelineState(draftId) → state
 *     <BlockingLoader state onCancel={cancelPhase} />
 *     <ReviewCastProposalModal state onConfirm={confirmPipelineCast} onSkip={skipPhase('reference_data')} />
 *     <SceneImageOfferModal state onAccept={triggerPhase('scene_image')} onSkip={skipPhase('scene_image')} />
 *     <StepCorners draftId state />
 *
 * Scenarios:
 *   1. Happy path AC-01→04 — scene running → cast modal → confirm → ref-image
 *      running → scene-image offer → accept → running → all-idle.
 *   2. Resume from backend state (AC-05) — two fresh mounts with mid-phase
 *      getPipelineState responses; each reconstructs the correct UI from the
 *      backend read alone.
 *   3. Observer convergence (AC-05) — newer event applied, stale event ignored
 *      (version-guard exercised through the rendered surface).
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

type PhaseStatus =
  | 'idle'
  | 'queued'
  | 'running'
  | 'awaiting_review'
  | 'completed'
  | 'skipped'
  | 'failed';

type PhaseName = 'scene' | 'reference_data' | 'reference_image' | 'scene_image';

interface PipelineState {
  draft_id: string;
  active_phase: PhaseName;
  active_run_phase: PhaseName | null;
  phases: Record<PhaseName, { status: PhaseStatus }>;
  payload: unknown | null;
  version: number;
  cost_estimate: string | null;
  error_message: string | null;
  updated_at: string | null;
}

// Subscription handler capture — exposed to tests via module-scope ref so emit()
// can fire events into the hook without importing the subscription module.
type SubscriptionHandlers = {
  onEvent: (event: {
    type: 'storyboard.status.updated';
    draftId: string;
    userId: string;
    payload: PipelineState;
  }) => void;
  onReconnect?: () => void;
};

const mocks = vi.hoisted(() => ({
  getPipelineState: vi.fn<[string], Promise<PipelineState>>(),
  confirmPipelineCast: vi.fn<[string], Promise<PipelineState>>(),
  triggerPhase: vi.fn<[string, PhaseName], Promise<PipelineState>>(),
  cancelPhase: vi.fn<[string, PhaseName], Promise<PipelineState>>(),
  skipPhase: vi.fn<[string, PhaseName], Promise<PipelineState>>(),
  subscriptionHandlers: [] as SubscriptionHandlers[],
}));

vi.mock('@/features/storyboard/api', () => ({
  getPipelineState: mocks.getPipelineState,
  confirmPipelineCast: mocks.confirmPipelineCast,
  triggerPhase: mocks.triggerPhase,
  cancelPhase: mocks.cancelPhase,
  skipPhase: mocks.skipPhase,
  // GateError — needed by StepCorners
  GateError: class GateError extends Error {
    code: string;
    details: Record<string, unknown>;
    constructor(message: string, code: string, details: Record<string, unknown>) {
      super(message);
      this.name = 'GateError';
      this.code = code;
      this.details = details;
    }
  },
}));

vi.mock('@/shared/hooks/useRealtimeSubscription', () => ({
  useDraftStoryboardStatusSubscription: vi.fn(
    (
      _draftId: string | null,
      handlers: SubscriptionHandlers,
    ) => {
      mocks.subscriptionHandlers.push(handlers);
    },
  ),
}));

// ── Real components and hook (imported AFTER mocks) ───────────────────────────

import { usePipelineState } from '../hooks/usePipelineState';
import { BlockingLoader } from '../components/BlockingLoader';
import { ReviewCastProposalModal } from '../components/ReviewCastProposalModal';
import { SceneImageOfferModal } from '../components/SceneImageOfferModal';
import { StepCorners } from '../components/StepCorners';

// ── Harness component ─────────────────────────────────────────────────────────

/**
 * PipelineHarness — the minimal host that wires usePipelineState to the four
 * pipeline UI components exactly as StoryboardPage does. No canvas, no routing,
 * no extraneous providers needed.
 */
function PipelineHarness({ draftId }: { draftId: string }): React.ReactElement {
  const { state } = usePipelineState(draftId);

  return (
    <div data-testid="pipeline-harness">
      <BlockingLoader
        state={state}
        onCancel={(phase) => {
          void mocks.cancelPhase(draftId, phase);
        }}
      />
      <ReviewCastProposalModal
        state={state}
        onConfirm={() => {
          // Confirm as shown — no client body (review r3 F5 / ADR-0006).
          void mocks.confirmPipelineCast(draftId);
        }}
        onSkip={() => {
          void mocks.skipPhase(draftId, 'reference_data');
        }}
      />
      <SceneImageOfferModal
        state={state}
        onAccept={() => {
          void mocks.triggerPhase(draftId, 'scene_image');
        }}
        onSkip={() => {
          void mocks.skipPhase(draftId, 'scene_image');
        }}
      />
      <StepCorners draftId={draftId} state={state} />
    </div>
  );
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const DRAFT_ID = 'draft-pipeline-e2e-001';

function makePipelineState(overrides: Partial<PipelineState> = {}): PipelineState {
  return {
    draft_id: DRAFT_ID,
    active_phase: 'scene',
    active_run_phase: null,
    phases: {
      scene: { status: 'idle' },
      reference_data: { status: 'idle' },
      reference_image: { status: 'idle' },
      scene_image: { status: 'idle' },
    },
    payload: null,
    version: 1,
    cost_estimate: null,
    error_message: null,
    updated_at: '2026-06-15T00:00:00Z',
    ...overrides,
  };
}

/**
 * Emit a pipeline state event to the most-recently-registered subscription
 * handler, wrapped in `act` so React processes all state updates.
 */
function emitPipelineEvent(state: PipelineState): void {
  act(() => {
    mocks.subscriptionHandlers.at(-1)?.onEvent({
      type: 'storyboard.status.updated',
      draftId: DRAFT_ID,
      userId: 'user-tester-1',
      payload: state,
    });
  });
}

// ── Render helper ─────────────────────────────────────────────────────────────

function renderHarness(draftId = DRAFT_ID) {
  return render(<PipelineHarness draftId={draftId} />);
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mocks.subscriptionHandlers.length = 0;

  // Default: pipeline is idle (no active run), scene phase not started.
  mocks.getPipelineState.mockResolvedValue(
    makePipelineState({ version: 1 }),
  );

  // Default no-op returns for action mocks.
  mocks.confirmPipelineCast.mockResolvedValue(makePipelineState({ version: 100 }));
  mocks.triggerPhase.mockResolvedValue(makePipelineState({ version: 100 }));
  mocks.cancelPhase.mockResolvedValue(makePipelineState({ version: 100 }));
  mocks.skipPhase.mockResolvedValue(makePipelineState({ version: 100 }));
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1 — Happy path AC-01→04
// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario 1 — happy path AC-01→04 through the rendered UI', () => {
  it('shows BlockingLoader when scene phase is running (AC-01)', async () => {
    // Initial state: scene phase running
    mocks.getPipelineState.mockResolvedValue(
      makePipelineState({
        version: 10,
        active_phase: 'scene',
        active_run_phase: 'scene',
        phases: {
          scene: { status: 'running' },
          reference_data: { status: 'idle' },
          reference_image: { status: 'idle' },
          scene_image: { status: 'idle' },
        },
      }),
    );

    renderHarness();

    // Wait for the hook to apply the fetched state.
    await waitFor(() => {
      expect(screen.getByTestId('blocking-loader')).toBeTruthy();
    });

    // Neither review modal should be visible.
    expect(screen.queryByTestId('review-cast-proposal-modal')).toBeNull();
    expect(screen.queryByTestId('scene-image-offer-modal')).toBeNull();
  });

  it('hides BlockingLoader and shows ReviewCastProposalModal when reference_data phase becomes awaiting_review (AC-02)', async () => {
    // Start: scene running.
    mocks.getPipelineState.mockResolvedValue(
      makePipelineState({
        version: 10,
        active_phase: 'scene',
        active_run_phase: 'scene',
        phases: {
          scene: { status: 'running' },
          reference_data: { status: 'idle' },
          reference_image: { status: 'idle' },
          scene_image: { status: 'idle' },
        },
      }),
    );

    renderHarness();

    await waitFor(() => {
      expect(screen.getByTestId('blocking-loader')).toBeTruthy();
    });

    // Emit: reference_data awaiting_review with cast proposal.
    emitPipelineEvent(
      makePipelineState({
        version: 11,
        active_phase: 'reference_data',
        active_run_phase: null, // no run active; awaiting human review
        phases: {
          scene: { status: 'completed' },
          reference_data: { status: 'awaiting_review' },
          reference_image: { status: 'idle' },
          scene_image: { status: 'idle' },
        },
        payload: {
          cast_proposal: {
            references: [
              { name: 'Hero', kind: 'character', scene_ids: ['s-1', 's-2'] },
              { name: 'Forest', kind: 'environment', scene_ids: ['s-3'] },
            ],
          },
        },
        cost_estimate: '2.50 credits',
      }),
    );

    // Loader must disappear (active_run_phase is null).
    await waitFor(() => {
      expect(screen.queryByTestId('blocking-loader')).toBeNull();
    });

    // ReviewCastProposalModal must appear.
    expect(screen.getByTestId('review-cast-proposal-modal')).toBeTruthy();

    // Both references should be listed.
    expect(screen.getByTestId('reference-name-0').textContent).toBe('Hero');
    expect(screen.getByTestId('reference-scenes-0').textContent).toBe('2 scenes');
    expect(screen.getByTestId('reference-name-1').textContent).toBe('Forest');
    expect(screen.getByTestId('reference-scenes-1').textContent).toBe('1 scene');

    // Cost estimate must be shown.
    const estimate = screen.getByTestId('cost-estimate');
    expect(estimate.textContent).toContain('2.50 credits');
  });

  it('calls confirmPipelineCast when the Creator clicks confirm in the cast proposal modal (AC-03)', async () => {
    // Mount with reference_data awaiting_review directly.
    mocks.getPipelineState.mockResolvedValue(
      makePipelineState({
        version: 11,
        active_phase: 'reference_data',
        active_run_phase: null,
        phases: {
          scene: { status: 'completed' },
          reference_data: { status: 'awaiting_review' },
          reference_image: { status: 'idle' },
          scene_image: { status: 'idle' },
        },
        payload: {
          cast_proposal: {
            references: [
              { name: 'Hero', kind: 'character', scene_ids: ['s-1'] },
            ],
          },
        },
        cost_estimate: '1.00 credit',
      }),
    );

    renderHarness();

    // Wait for the modal to appear.
    await waitFor(() => {
      expect(screen.getByTestId('review-cast-proposal-modal')).toBeTruthy();
    });

    // Click confirm.
    fireEvent.click(screen.getByTestId('confirm-button'));

    await waitFor(() => {
      expect(mocks.confirmPipelineCast).toHaveBeenCalledTimes(1);
      // F5: the client sends NO cost estimate — confirm as shown, server re-validates.
      expect(mocks.confirmPipelineCast).toHaveBeenCalledWith(DRAFT_ID);
    });
  });

  it('shows BlockingLoader again when reference_image phase runs after confirm (AC-03)', async () => {
    // Start with cast proposal modal open.
    mocks.getPipelineState.mockResolvedValue(
      makePipelineState({
        version: 11,
        active_phase: 'reference_data',
        active_run_phase: null,
        phases: {
          scene: { status: 'completed' },
          reference_data: { status: 'awaiting_review' },
          reference_image: { status: 'idle' },
          scene_image: { status: 'idle' },
        },
        payload: {
          cast_proposal: {
            references: [{ name: 'Hero', kind: 'character', scene_ids: ['s-1'] }],
          },
        },
        cost_estimate: '1.00 credit',
      }),
    );

    renderHarness();

    await waitFor(() => {
      expect(screen.getByTestId('review-cast-proposal-modal')).toBeTruthy();
    });

    // Emit reference_image running (after confirm).
    emitPipelineEvent(
      makePipelineState({
        version: 12,
        active_phase: 'reference_image',
        active_run_phase: 'reference_image',
        phases: {
          scene: { status: 'completed' },
          reference_data: { status: 'completed' },
          reference_image: { status: 'running' },
          scene_image: { status: 'idle' },
        },
        payload: null,
        cost_estimate: null,
      }),
    );

    // Modal gone, loader back.
    await waitFor(() => {
      expect(screen.queryByTestId('review-cast-proposal-modal')).toBeNull();
      expect(screen.getByTestId('blocking-loader')).toBeTruthy();
    });
  });

  it('shows SceneImageOfferModal with cost estimate when scene_image phase awaiting_review (AC-04)', async () => {
    // Start with reference_image running.
    mocks.getPipelineState.mockResolvedValue(
      makePipelineState({
        version: 12,
        active_phase: 'reference_image',
        active_run_phase: 'reference_image',
        phases: {
          scene: { status: 'completed' },
          reference_data: { status: 'completed' },
          reference_image: { status: 'running' },
          scene_image: { status: 'idle' },
        },
        payload: null,
        cost_estimate: null,
      }),
    );

    renderHarness();

    await waitFor(() => {
      expect(screen.getByTestId('blocking-loader')).toBeTruthy();
    });

    // Emit scene_image awaiting_review.
    emitPipelineEvent(
      makePipelineState({
        version: 13,
        active_phase: 'scene_image',
        active_run_phase: null,
        phases: {
          scene: { status: 'completed' },
          reference_data: { status: 'completed' },
          reference_image: { status: 'completed' },
          scene_image: { status: 'awaiting_review' },
        },
        payload: {
          scene_image_offer: { scene_count: 5 },
        },
        cost_estimate: '5.00 credits',
      }),
    );

    // Loader gone, scene-image modal appears.
    await waitFor(() => {
      expect(screen.queryByTestId('blocking-loader')).toBeNull();
      expect(screen.getByTestId('scene-image-offer-modal')).toBeTruthy();
    });

    // Scene count and cost estimate rendered.
    expect(screen.getByTestId('scene-count').textContent).toBe('5');
    const estimate = screen.getByTestId('cost-estimate');
    expect(estimate.textContent).toContain('5.00 credits');
  });

  it('calls triggerPhase(draftId, "scene_image") when the Creator clicks accept (AC-04)', async () => {
    // Start with scene_image awaiting_review.
    mocks.getPipelineState.mockResolvedValue(
      makePipelineState({
        version: 13,
        active_phase: 'scene_image',
        active_run_phase: null,
        phases: {
          scene: { status: 'completed' },
          reference_data: { status: 'completed' },
          reference_image: { status: 'completed' },
          scene_image: { status: 'awaiting_review' },
        },
        payload: { scene_image_offer: { scene_count: 3 } },
        cost_estimate: '3.00 credits',
      }),
    );

    renderHarness();

    await waitFor(() => {
      expect(screen.getByTestId('scene-image-offer-modal')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('accept-button'));

    await waitFor(() => {
      expect(mocks.triggerPhase).toHaveBeenCalledTimes(1);
      expect(mocks.triggerPhase).toHaveBeenCalledWith(DRAFT_ID, 'scene_image');
    });
  });

  it('releases all loader/modal UI when all phases reach terminal state (end of pipeline)', async () => {
    // Start with scene_image running.
    mocks.getPipelineState.mockResolvedValue(
      makePipelineState({
        version: 14,
        active_phase: 'scene_image',
        active_run_phase: 'scene_image',
        phases: {
          scene: { status: 'completed' },
          reference_data: { status: 'completed' },
          reference_image: { status: 'completed' },
          scene_image: { status: 'running' },
        },
        payload: null,
        cost_estimate: null,
      }),
    );

    renderHarness();

    await waitFor(() => {
      expect(screen.getByTestId('blocking-loader')).toBeTruthy();
    });

    // Emit: all completed, no active run.
    emitPipelineEvent(
      makePipelineState({
        version: 15,
        active_phase: 'scene_image',
        active_run_phase: null,
        phases: {
          scene: { status: 'completed' },
          reference_data: { status: 'completed' },
          reference_image: { status: 'completed' },
          scene_image: { status: 'completed' },
        },
        payload: null,
        cost_estimate: null,
      }),
    );

    await waitFor(() => {
      expect(screen.queryByTestId('blocking-loader')).toBeNull();
      expect(screen.queryByTestId('review-cast-proposal-modal')).toBeNull();
      expect(screen.queryByTestId('scene-image-offer-modal')).toBeNull();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2 — Resume story (AC-05)
// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario 2 — resume: correct UI reconstructed from backend state on fresh mount (AC-05)', () => {
  it('reconstructs the ReviewCastProposalModal when mount reads reference_data awaiting_review', async () => {
    // Fresh mount — simulates reload mid-pipeline; no prior client state.
    mocks.getPipelineState.mockResolvedValue(
      makePipelineState({
        version: 20,
        active_phase: 'reference_data',
        active_run_phase: null,
        phases: {
          scene: { status: 'completed' },
          reference_data: { status: 'awaiting_review' },
          reference_image: { status: 'idle' },
          scene_image: { status: 'idle' },
        },
        payload: {
          cast_proposal: {
            references: [
              { name: 'Sidekick', kind: 'character', scene_ids: ['s-5'] },
            ],
          },
        },
        cost_estimate: '0.50 credits',
      }),
    );

    renderHarness();

    // The modal must be reconstructed from the backend GET alone — no prior
    // client memory.
    await waitFor(() => {
      expect(screen.getByTestId('review-cast-proposal-modal')).toBeTruthy();
    });

    expect(screen.getByTestId('reference-name-0').textContent).toBe('Sidekick');
    expect(screen.queryByTestId('blocking-loader')).toBeNull();
  });

  it('reconstructs BlockingLoader when mount reads scene_image running', async () => {
    // Fresh mount — simulates reload while scene_image generation is in flight.
    mocks.getPipelineState.mockResolvedValue(
      makePipelineState({
        version: 21,
        active_phase: 'scene_image',
        active_run_phase: 'scene_image',
        phases: {
          scene: { status: 'completed' },
          reference_data: { status: 'completed' },
          reference_image: { status: 'completed' },
          scene_image: { status: 'running' },
        },
        payload: null,
        cost_estimate: null,
      }),
    );

    renderHarness();

    await waitFor(() => {
      expect(screen.getByTestId('blocking-loader')).toBeTruthy();
    });

    expect(screen.queryByTestId('review-cast-proposal-modal')).toBeNull();
    expect(screen.queryByTestId('scene-image-offer-modal')).toBeNull();
  });

  it('reconstructs SceneImageOfferModal when mount reads scene_image awaiting_review', async () => {
    mocks.getPipelineState.mockResolvedValue(
      makePipelineState({
        version: 22,
        active_phase: 'scene_image',
        active_run_phase: null,
        phases: {
          scene: { status: 'completed' },
          reference_data: { status: 'completed' },
          reference_image: { status: 'completed' },
          scene_image: { status: 'awaiting_review' },
        },
        payload: { scene_image_offer: { scene_count: 7 } },
        cost_estimate: '7.00 credits',
      }),
    );

    renderHarness();

    await waitFor(() => {
      expect(screen.getByTestId('scene-image-offer-modal')).toBeTruthy();
    });

    expect(screen.getByTestId('scene-count').textContent).toBe('7');
    expect(screen.queryByTestId('blocking-loader')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3 — Observer convergence (AC-05)
// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario 3 — observer convergence: newer event applied, stale event ignored (AC-05)', () => {
  it('applies a newer-version realtime event and updates the rendered UI', async () => {
    // Start with scene running.
    mocks.getPipelineState.mockResolvedValue(
      makePipelineState({
        version: 30,
        active_phase: 'scene',
        active_run_phase: 'scene',
        phases: {
          scene: { status: 'running' },
          reference_data: { status: 'idle' },
          reference_image: { status: 'idle' },
          scene_image: { status: 'idle' },
        },
      }),
    );

    renderHarness();

    await waitFor(() => {
      expect(screen.getByTestId('blocking-loader')).toBeTruthy();
    });

    // Emit a newer version — scene completes, reference_data awaiting_review.
    emitPipelineEvent(
      makePipelineState({
        version: 31, // strictly greater than 30
        active_phase: 'reference_data',
        active_run_phase: null,
        phases: {
          scene: { status: 'completed' },
          reference_data: { status: 'awaiting_review' },
          reference_image: { status: 'idle' },
          scene_image: { status: 'idle' },
        },
        payload: {
          cast_proposal: {
            references: [{ name: 'Villain', kind: 'character', scene_ids: ['s-9'] }],
          },
        },
        cost_estimate: '1.50 credits',
      }),
    );

    // UI must converge: loader gone, cast modal visible.
    await waitFor(() => {
      expect(screen.queryByTestId('blocking-loader')).toBeNull();
      expect(screen.getByTestId('review-cast-proposal-modal')).toBeTruthy();
    });
  });

  it('ignores a stale-version realtime event — UI does NOT change (AC-05 version-guard)', async () => {
    // Start with reference_data awaiting_review (version 30).
    mocks.getPipelineState.mockResolvedValue(
      makePipelineState({
        version: 30,
        active_phase: 'reference_data',
        active_run_phase: null,
        phases: {
          scene: { status: 'completed' },
          reference_data: { status: 'awaiting_review' },
          reference_image: { status: 'idle' },
          scene_image: { status: 'idle' },
        },
        payload: {
          cast_proposal: {
            references: [{ name: 'Hero', kind: 'character', scene_ids: ['s-1'] }],
          },
        },
        cost_estimate: '2.00 credits',
      }),
    );

    renderHarness();

    await waitFor(() => {
      expect(screen.getByTestId('review-cast-proposal-modal')).toBeTruthy();
    });

    // Emit a STALE event with a different active_phase and lower version — must
    // be ignored by the hook's version-guard.
    emitPipelineEvent(
      makePipelineState({
        version: 25, // strictly less than 30 — STALE
        active_phase: 'scene',
        active_run_phase: 'scene',
        phases: {
          scene: { status: 'running' },
          reference_data: { status: 'idle' },
          reference_image: { status: 'idle' },
          scene_image: { status: 'idle' },
        },
        payload: null,
        cost_estimate: null,
      }),
    );

    // UI must NOT change — modal still shown, no loader.
    // A brief settle is fine; the test asserts the state after the event.
    await waitFor(() => {
      expect(screen.getByTestId('review-cast-proposal-modal')).toBeTruthy();
    });
    expect(screen.queryByTestId('blocking-loader')).toBeNull();
  });

  it('ignores a same-version (equal) realtime event — UI does NOT change', async () => {
    mocks.getPipelineState.mockResolvedValue(
      makePipelineState({
        version: 30,
        active_phase: 'reference_data',
        active_run_phase: null,
        phases: {
          scene: { status: 'completed' },
          reference_data: { status: 'awaiting_review' },
          reference_image: { status: 'idle' },
          scene_image: { status: 'idle' },
        },
        payload: {
          cast_proposal: {
            references: [{ name: 'Wizard', kind: 'character', scene_ids: ['s-7'] }],
          },
        },
        cost_estimate: '1.00 credit',
      }),
    );

    renderHarness();

    await waitFor(() => {
      expect(screen.getByTestId('review-cast-proposal-modal')).toBeTruthy();
    });

    // Emit an EQUAL version with a completely different phase — must be ignored.
    emitPipelineEvent(
      makePipelineState({
        version: 30, // same as held — must be dropped
        active_phase: 'scene_image',
        active_run_phase: 'scene_image',
        phases: {
          scene: { status: 'completed' },
          reference_data: { status: 'completed' },
          reference_image: { status: 'completed' },
          scene_image: { status: 'running' },
        },
        payload: null,
        cost_estimate: null,
      }),
    );

    await waitFor(() => {
      // Modal must still be shown — the stale equal-version event was silently dropped.
      expect(screen.getByTestId('review-cast-proposal-modal')).toBeTruthy();
    });
    expect(screen.queryByTestId('blocking-loader')).toBeNull();
  });
});
