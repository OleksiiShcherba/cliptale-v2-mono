/**
 * RED tests for T19 — StepCorners component.
 *
 * DoD: "The corner controls trigger any phase via triggerPhase and surface the
 * server's plain-language out-of-order / scenes-required messages (reusing
 * ReferenceGateMessage); component tests assert the trigger and the two guard
 * messages."
 *
 * AC tested here:
 *   1. trigger — clicking a corner control calls triggerPhase(draftId, phase)
 *      once; on success no error/alert is shown.
 *   2. out-of-order guard — triggerPhase rejects with GateError carrying code
 *      'pipeline.phase_out_of_order'; the server-authoritative message is shown
 *      verbatim in a role="alert" region.
 *   3. scenes-required guard — triggerPhase rejects with GateError carrying code
 *      'pipeline.scenes_required'; the server-authoritative message is shown
 *      verbatim in a role="alert" region.
 *
 * Implementer notes:
 *   - The component must render at least one button with
 *     data-testid="step-corner-trigger-<phase>" (e.g. "step-corner-trigger-scene").
 *   - On GateError the component must render a role="alert" block that surfaces
 *     error.message verbatim (reuses ReferenceGateMessage presentation).
 *   - The alert must be cleared (or absent) on a successful trigger.
 *   - This test file uses vi.hoisted + vi.mock to replace
 *     @/features/storyboard/api so no real HTTP calls are made.
 */

import React from 'react';
import { describe, beforeEach, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ── Hoisted mocks — must be declared before any imports that touch the module ─

const { mockTriggerPhase } = vi.hoisted(() => ({
  mockTriggerPhase: vi.fn(),
}));

// Mock the entire @/features/storyboard/api module.
// GateError is defined inline in the factory so the component can do
// `instanceof GateError` correctly even after the module is replaced.
vi.mock('@/features/storyboard/api', () => {
  class GateError extends Error {
    code: string;
    details: Record<string, unknown>;

    constructor(message: string, code: string, details: Record<string, unknown>) {
      super(message);
      this.name = 'GateError';
      this.code = code;
      this.details = details;
    }
  }

  return {
    GateError,
    triggerPhase: mockTriggerPhase,
    // Stub out everything else used by the module graph so transitive imports
    // do not blow up during component-level tests.
    getPipelineState: vi.fn(),
    cancelPhase: vi.fn(),
    skipPhase: vi.fn(),
    confirmPipelineCast: vi.fn(),
    fetchStoryboard: vi.fn(),
    saveStoryboard: vi.fn(),
    initializeStoryboard: vi.fn(),
    persistHistorySnapshot: vi.fn(),
    pushCheckpointSnapshot: vi.fn(),
    fetchHistorySnapshots: vi.fn(),
    fetchStoryboardMusic: vi.fn(),
    startCastExtraction: vi.fn(),
    getLatestCastExtraction: vi.fn(),
    updateStoryboardMusicBlock: vi.fn(),
    generateStoryboardMusicBlock: vi.fn(),
    addTemplateToStoryboard: vi.fn(),
  };
});

// ── Import the component under test (does not exist yet — stub resolves) ──────
import { StepCorners } from './StepCorners';

// ── Helpers ───────────────────────────────────────────────────────────────────

const DRAFT_ID = 'test-draft-t19';

/** Minimal PipelineState-shaped object the mock resolves with on success. */
const FAKE_PIPELINE_STATE = {
  draft_id: DRAFT_ID,
  active_phase: 'scene' as const,
  active_run_phase: null,
  phases: {
    scene: { status: 'idle' as const },
    reference_data: { status: 'idle' as const },
    reference_image: { status: 'idle' as const },
    scene_image: { status: 'idle' as const },
  },
  payload: null,
  version: 1,
  cost_estimate: null,
  error_message: null,
  updated_at: null,
};

function renderCorners() {
  return render(<StepCorners draftId={DRAFT_ID} state={null} />);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('StepCorners — T19 AC: trigger and guard messages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clicking a corner control calls triggerPhase once with (draftId, phase) and shows no alert on success', async () => {
    mockTriggerPhase.mockResolvedValue(FAKE_PIPELINE_STATE);
    renderCorners();

    // The component must expose at least one corner trigger button.
    // Convention: data-testid="step-corner-trigger-<phase>"
    // Use a selector that matches any of the four phase buttons.
    const trigger =
      screen.queryByTestId('step-corner-trigger-scene') ??
      screen.queryByTestId('step-corner-trigger-reference_data') ??
      screen.queryByTestId('step-corner-trigger-reference_image') ??
      screen.queryByTestId('step-corner-trigger-scene_image');

    expect(
      trigger,
      'Expected at least one button with data-testid="step-corner-trigger-<phase>"',
    ).toBeTruthy();

    fireEvent.click(trigger!);

    await waitFor(() => expect(mockTriggerPhase).toHaveBeenCalledTimes(1));

    // The first argument must be the draftId; the second must be one of the four phases.
    const [calledDraftId, calledPhase] = mockTriggerPhase.mock.calls[0];
    expect(calledDraftId).toBe(DRAFT_ID);
    expect(['scene', 'reference_data', 'reference_image', 'scene_image']).toContain(calledPhase);

    // No error alert should be visible after a successful call.
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('surfaces the out-of-order server message in a role="alert" region when triggerPhase rejects with phase_out_of_order', async () => {
    const { GateError } = await import('@/features/storyboard/api');

    mockTriggerPhase.mockRejectedValue(
      new (GateError as unknown as new (m: string, c: string, d: object) => Error)(
        "This step can’t start yet — an earlier step has to finish first. The steps run in order.",
        'pipeline.phase_out_of_order',
        {},
      ),
    );

    renderCorners();

    const trigger =
      screen.queryByTestId('step-corner-trigger-scene') ??
      screen.queryByTestId('step-corner-trigger-reference_data') ??
      screen.queryByTestId('step-corner-trigger-reference_image') ??
      screen.queryByTestId('step-corner-trigger-scene_image');

    expect(trigger, 'Expected a corner trigger button').toBeTruthy();
    fireEvent.click(trigger!);

    // The alert must appear and contain the server's plain-language message.
    // Match loosely to avoid brittle smart-quote / em-dash mismatches.
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/can.t start yet/i);
    expect(alert.textContent).toMatch(/earlier step/i);
  });

  it('disables the corner trigger buttons while a phase is actively running (F7)', () => {
    const runningState = {
      ...FAKE_PIPELINE_STATE,
      active_run_phase: 'scene' as const,
      phases: {
        ...FAKE_PIPELINE_STATE.phases,
        scene: { status: 'running' as const },
      },
    };

    render(<StepCorners draftId={DRAFT_ID} state={runningState} />);

    const sceneBtn = screen.getByTestId('step-corner-trigger-scene') as HTMLButtonElement;
    const refDataBtn = screen.getByTestId('step-corner-trigger-reference_data') as HTMLButtonElement;
    expect(sceneBtn.disabled).toBe(true);
    expect(refDataBtn.disabled).toBe(true);

    fireEvent.click(sceneBtn);
    expect(mockTriggerPhase).not.toHaveBeenCalled();
  });

  it('keeps the corner trigger buttons enabled when no phase is running', () => {
    render(<StepCorners draftId={DRAFT_ID} state={FAKE_PIPELINE_STATE} />);
    const sceneBtn = screen.getByTestId('step-corner-trigger-scene') as HTMLButtonElement;
    expect(sceneBtn.disabled).toBe(false);
  });

  it('surfaces the scenes-required server message in a role="alert" region when triggerPhase rejects with scenes_required', async () => {
    const { GateError } = await import('@/features/storyboard/api');

    mockTriggerPhase.mockRejectedValue(
      new (GateError as unknown as new (m: string, c: string, d: object) => Error)(
        'Generate the scenes first — there are no scenes yet to build on.',
        'pipeline.scenes_required',
        {},
      ),
    );

    renderCorners();

    const trigger =
      screen.queryByTestId('step-corner-trigger-scene') ??
      screen.queryByTestId('step-corner-trigger-reference_data') ??
      screen.queryByTestId('step-corner-trigger-reference_image') ??
      screen.queryByTestId('step-corner-trigger-scene_image');

    expect(trigger, 'Expected a corner trigger button').toBeTruthy();
    fireEvent.click(trigger!);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Generate the scenes first/i);
  });
});
