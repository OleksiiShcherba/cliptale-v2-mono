import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

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
      reference={{
        status: 'ready',
        jobId: 'ref-1',
        outputFileId: 'file-1',
        sourceReferenceFileIds: [],
        approvalStatus: 'approved',
        errorMessage: null,
      }}
      error={null}
      isBlocking={false}
      onStart={vi.fn()}
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

  it('keeps the reference preview while illustrations are still generating (non-goal: in-progress unchanged)', () => {
    renderIllustration('running', 'scene');
    expect(screen.getByTestId('storyboard-reference-preview')).toBeTruthy();
  });

  it('keeps the reference preview on the failed reference state (non-goal: failed unchanged)', () => {
    renderIllustration('failed', 'reference');
    expect(screen.getByTestId('storyboard-reference-preview')).toBeTruthy();
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
