import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/lib/api-client', () => ({
  buildAuthenticatedUrl: (url: string) => url,
}));
vi.mock('@/lib/config', () => ({
  config: { apiBaseUrl: 'https://api.test' },
}));

import {
  StoryboardIllustrationControls,
  StoryboardPlanControls,
} from './StoryboardPlanControls';
import type {
  StoryboardIllustrationLifecyclePhase,
  StoryboardIllustrationLifecycleStatus,
} from '@/features/storyboard/types';

function renderIllustration(
  status: StoryboardIllustrationLifecycleStatus,
  phase: StoryboardIllustrationLifecyclePhase,
) {
  return render(
    <StoryboardIllustrationControls
      status={status}
      phase={phase}
      error={null}
    />,
  );
}

describe('StoryboardPlanControls / StoryboardIllustrationControls — visual consistency (AC-04)', () => {
  it('drops the Ref thumbnail box on the completed illustration block', () => {
    renderIllustration('completed', 'scene');
    // AC-04: no "Ref" preview box once illustrations are done — for every viewer.
    expect(screen.queryByTestId('storyboard-reference-preview')).toBeNull();
    // The completed block keeps its title + Done badge, matching the scene block.
    expect(screen.getByText('Illustrations ready')).toBeTruthy();
    expect(screen.getByLabelText('Illustrations complete')).toBeTruthy();
  });

  // AC-08 (T9): the canonical reference preview ("Ref" box) has been removed from
  // StoryboardIllustrationControls — the principal-image approval step no longer exists.
  // The following tests were asserting the preview was present in non-completed states;
  // they are now replaced by the absence assertion to confirm the removal.

  it('does not render a reference preview while illustrations are generating (AC-08)', () => {
    renderIllustration('running', 'scene');
    expect(screen.queryByTestId('storyboard-reference-preview')).toBeNull();
  });

  it('does not render a reference preview on the failed state (AC-08)', () => {
    renderIllustration('failed', 'scene');
    expect(screen.queryByTestId('storyboard-reference-preview')).toBeNull();
  });

  it('idle copy uses the reference-done framing, not the retired principal step (AC-08, review F5)', () => {
    renderIllustration('idle', 'idle');
    expect(screen.getByText('Scene images start automatically once references are ready.')).toBeTruthy();
    expect(screen.queryByText(/principal image/i)).toBeNull();
  });

  it('completed scene block and completed illustration block share the same shape (title + Done, no preview)', () => {
    const { unmount } = render(
      <StoryboardPlanControls status="completed" error={null} isBlocking={false} onRetry={vi.fn()} />,
    );
    expect(screen.getByText('Generated scenes applied')).toBeTruthy();
    expect(screen.getByLabelText('Generation complete')).toBeTruthy();
    expect(screen.queryByTestId('storyboard-reference-preview')).toBeNull();
    unmount();

    renderIllustration('completed', 'scene');
    expect(screen.getByText('Illustrations ready')).toBeTruthy();
    expect(screen.getByLabelText('Illustrations complete')).toBeTruthy();
    expect(screen.queryByTestId('storyboard-reference-preview')).toBeNull();
  });
});

describe('StoryboardPlanControls — status menu mounting (AC-06, AC-09)', () => {
  const PLAN_NON_COMPLETED: Array<React.ComponentProps<typeof StoryboardPlanControls>['status']> = [
    'idle', 'queued', 'running', 'applying', 'failed',
  ];

  it('renders the status menu on the completed scene block for the owner', () => {
    render(
      <StoryboardPlanControls
        status="completed" error={null} isBlocking={false} onRetry={vi.fn()}
        isOwner onRegenerate={vi.fn()} onHide={vi.fn()}
      />,
    );
    expect(screen.getByTestId('storyboard-status-menu-trigger')).toBeTruthy();
  });

  it('renders the status menu on the completed illustration block for the owner', () => {
    render(
      <StoryboardIllustrationControls
        status="completed" phase="scene" error={null}
        isOwner onRegenerate={vi.fn()} onHide={vi.fn()}
      />,
    );
    expect(screen.getByTestId('storyboard-status-menu-trigger')).toBeTruthy();
  });

  it('does not render the status menu for a non-owner on the completed block (AC-09)', () => {
    render(
      <StoryboardPlanControls
        status="completed" error={null} isBlocking={false} onRetry={vi.fn()}
        isOwner={false} onRegenerate={vi.fn()} onHide={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('storyboard-status-menu-trigger')).toBeNull();
  });

  it('never renders the status menu on non-completed scene states even for an owner (AC-06)', () => {
    for (const status of PLAN_NON_COMPLETED) {
      const { unmount } = render(
        <StoryboardPlanControls
          status={status} error={status === 'failed' ? 'boom' : null} isBlocking={false}
          onRetry={vi.fn()} isOwner onRegenerate={vi.fn()} onHide={vi.fn()}
        />,
      );
      expect(screen.queryByTestId('storyboard-status-menu-trigger')).toBeNull();
      unmount();
    }
  });

  it('never renders the status menu on non-completed illustration states even for an owner (AC-06)', () => {
    for (const status of ['idle', 'queued', 'running', 'failed'] as const) {
      const { unmount } = render(
        <StoryboardIllustrationControls
          status={status} phase="scene" error={status === 'failed' ? 'boom' : null}
          isOwner onRegenerate={vi.fn()} onHide={vi.fn()}
        />,
      );
      expect(screen.queryByTestId('storyboard-status-menu-trigger')).toBeNull();
      unmount();
    }
  });

  it('keeps the completed illustration block below the plan block so the plan menu dropdown stays clickable', () => {
    const { unmount } = render(
      <StoryboardPlanControls status="completed" error={null} isBlocking={false} onRetry={vi.fn()} isOwner />,
    );
    const planZ = Number(screen.getByTestId('storyboard-plan-controls').style.zIndex);
    unmount();

    render(
      <StoryboardIllustrationControls
        status="completed" phase="scene" error={null}
        isOwner
      />,
    );
    const illustrationZ = Number(screen.getByTestId('storyboard-illustration-controls').style.zIndex);
    // The plan block's status-menu dropdown extends down over the illustration
    // block; the illustration block must not paint above it (pointer interception).
    expect(illustrationZ).toBeLessThan(planZ);
  });

  it('wires onRegenerate and onHide through the mounted menu', () => {
    const onRegenerate = vi.fn();
    const onHide = vi.fn();
    render(
      <StoryboardPlanControls
        status="completed" error={null} isBlocking={false} onRetry={vi.fn()}
        isOwner onRegenerate={onRegenerate} onHide={onHide}
      />,
    );
    fireEvent.click(screen.getByTestId('storyboard-status-menu-trigger'));
    fireEvent.click(screen.getByTestId('storyboard-status-menu-regenerate'));
    expect(onRegenerate).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('storyboard-status-menu-trigger'));
    fireEvent.click(screen.getByTestId('storyboard-status-menu-hide'));
    expect(onHide).toHaveBeenCalledTimes(1);
  });
});

describe('StoryboardIllustrationControls — failed-phase retry (AC-12, review r4 F1)', () => {
  it('renders a co-located Retry on a failed scene-image phase wired to onRegenerate (triggerPhase scene_image)', () => {
    const onRegenerate = vi.fn();
    render(
      <StoryboardIllustrationControls
        status="failed" phase="scene" error="Scene image generation failed."
        isOwner onRegenerate={onRegenerate} onHide={vi.fn()}
      />,
    );
    const retry = screen.getByTestId('storyboard-illustration-retry-button');
    expect(retry).toBeTruthy();
    fireEvent.click(retry);
    expect(onRegenerate).toHaveBeenCalledTimes(1);
  });

  it('does NOT render the Retry button when a structured gate error is shown elsewhere (prerequisite block, not a phase failure)', () => {
    render(
      <StoryboardIllustrationControls
        status="failed" phase="scene" error={null}
        hasStructuredGateError
        isOwner onRegenerate={vi.fn()} onHide={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('storyboard-illustration-retry-button')).toBeNull();
  });

  it('does NOT render the Retry button on non-failed illustration states', () => {
    for (const status of ['idle', 'queued', 'running', 'completed'] as const) {
      const { unmount } = render(
        <StoryboardIllustrationControls
          status={status} phase="scene" error={null}
          isOwner onRegenerate={vi.fn()} onHide={vi.fn()}
        />,
      );
      expect(screen.queryByTestId('storyboard-illustration-retry-button')).toBeNull();
      unmount();
    }
  });
});
