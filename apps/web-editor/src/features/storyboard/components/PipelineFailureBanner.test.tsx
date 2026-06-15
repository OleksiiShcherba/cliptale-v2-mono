/**
 * PipelineFailureBanner — component tests (review r3 F2, AC-12).
 *
 * The reference_data / reference_image phases have no status-block controls of
 * their own (only scene + scene_image do), so a whole-phase failure of either
 * would otherwise leave the Creator with the loader gone and nothing explaining
 * what failed or offering a retry. This banner fills that AC-12 gap.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/features/storyboard/api', () => ({
  triggerPhase: vi.fn(() => Promise.resolve()),
}));

import { triggerPhase } from '@/features/storyboard/api';
import type { PipelineState } from '@/features/storyboard/api';
import { PipelineFailureBanner } from './PipelineFailureBanner';

const mockTriggerPhase = vi.mocked(triggerPhase);

const DRAFT_ID = 'draft-failure-banner-1';

function makeState(overrides: Partial<PipelineState> = {}): PipelineState {
  return {
    draft_id: DRAFT_ID,
    active_phase: 'reference_data',
    active_run_phase: null,
    phases: {
      scene: { status: 'completed' },
      reference_data: { status: 'idle' },
      reference_image: { status: 'idle' },
      scene_image: { status: 'idle' },
    },
    payload: null,
    version: 1,
    cost_estimate: null,
    error_message: null,
    updated_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PipelineFailureBanner', () => {
  it('renders nothing when state is null', () => {
    const { container } = render(<PipelineFailureBanner draftId={DRAFT_ID} state={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when no reference phase has failed', () => {
    const { container } = render(
      <PipelineFailureBanner draftId={DRAFT_ID} state={makeState()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('does NOT render for a failed scene phase (covered by its own controls)', () => {
    const { container } = render(
      <PipelineFailureBanner
        draftId={DRAFT_ID}
        state={makeState({ phases: {
          scene: { status: 'failed' },
          reference_data: { status: 'idle' },
          reference_image: { status: 'idle' },
          scene_image: { status: 'idle' },
        } })}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows an alert with the error message when reference_data failed', () => {
    render(
      <PipelineFailureBanner
        draftId={DRAFT_ID}
        state={makeState({
          error_message: 'cast extraction crashed',
          phases: {
            scene: { status: 'completed' },
            reference_data: { status: 'failed' },
            reference_image: { status: 'idle' },
            scene_image: { status: 'idle' },
          },
        })}
      />,
    );
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('cast extraction crashed');
  });

  it('retry button re-triggers the failed reference_image phase', async () => {
    render(
      <PipelineFailureBanner
        draftId={DRAFT_ID}
        state={makeState({
          active_phase: 'reference_image',
          phases: {
            scene: { status: 'completed' },
            reference_data: { status: 'completed' },
            reference_image: { status: 'failed' },
            scene_image: { status: 'idle' },
          },
        })}
      />,
    );

    fireEvent.click(screen.getByTestId('pipeline-failure-retry'));

    await waitFor(() => {
      expect(mockTriggerPhase).toHaveBeenCalledWith(DRAFT_ID, 'reference_image');
    });
  });
});
