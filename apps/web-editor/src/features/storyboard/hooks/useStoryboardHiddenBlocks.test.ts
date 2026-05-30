import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import type {
  StoryboardIllustrationLifecycleStatus,
  StoryboardPlanGenerationStatus,
} from '@/features/storyboard/types';

import { useStoryboardHiddenBlocks } from './useStoryboardHiddenBlocks';

type Props = { p: StoryboardPlanGenerationStatus; i: StoryboardIllustrationLifecycleStatus };

describe('useStoryboardHiddenBlocks (AC-02)', () => {
  it('hides a single named block and leaves the sibling visible', () => {
    const { result } = renderHook(() =>
      useStoryboardHiddenBlocks({ planStatus: 'completed', illustrationStatus: 'completed' }),
    );

    expect(result.current.isHidden('plan')).toBe(false);
    expect(result.current.isHidden('illustration')).toBe(false);

    act(() => result.current.hide('plan'));

    expect(result.current.isHidden('plan')).toBe(true);
    // Sibling untouched.
    expect(result.current.isHidden('illustration')).toBe(false);
  });

  it('keeps a block hidden while it stays completed (no un-hide affordance, no re-render un-hide)', () => {
    const { result, rerender } = renderHook(
      ({ p, i }) => useStoryboardHiddenBlocks({ planStatus: p, illustrationStatus: i }),
      { initialProps: { p: 'completed', i: 'completed' } as Props },
    );

    act(() => result.current.hide('illustration'));
    expect(result.current.isHidden('illustration')).toBe(true);

    // An unrelated re-render (plan still completed) must not un-hide it.
    rerender({ p: 'completed', i: 'completed' });
    expect(result.current.isHidden('illustration')).toBe(true);
  });

  it('clears the hidden flag when the block re-enters a generation cycle (status leaves completed)', () => {
    const { result, rerender } = renderHook(
      ({ p, i }) => useStoryboardHiddenBlocks({ planStatus: p, illustrationStatus: i }),
      { initialProps: { p: 'completed', i: 'completed' } as Props },
    );

    act(() => result.current.hide('illustration'));
    expect(result.current.isHidden('illustration')).toBe(true);

    // A new illustration cycle begins (e.g. an indirect scene-Regenerate restart).
    rerender({ p: 'completed', i: 'queued' });
    expect(result.current.isHidden('illustration')).toBe(false);

    // It completes again and is shown (re-created), still not hidden.
    rerender({ p: 'completed', i: 'completed' });
    expect(result.current.isHidden('illustration')).toBe(false);
  });

  it('is in-memory only — a fresh mount starts with nothing hidden', () => {
    const first = renderHook(() =>
      useStoryboardHiddenBlocks({ planStatus: 'completed', illustrationStatus: 'completed' }),
    );
    act(() => first.result.current.hide('plan'));
    expect(first.result.current.isHidden('plan')).toBe(true);
    first.unmount();

    const second = renderHook(() =>
      useStoryboardHiddenBlocks({ planStatus: 'completed', illustrationStatus: 'completed' }),
    );
    expect(second.result.current.isHidden('plan')).toBe(false);
  });
});
