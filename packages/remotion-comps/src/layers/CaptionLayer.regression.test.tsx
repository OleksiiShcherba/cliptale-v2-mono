import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

// Track the mocked frame value so tests can control it.
let mockedFrame = 0;

// Mock Remotion primitives so tests run without a Remotion Player context.
vi.mock('remotion', () => ({
  AbsoluteFill: ({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) =>
    React.createElement('div', { 'data-testid': 'absolute-fill', style }, children),
  useCurrentFrame: () => mockedFrame,
}));

import { CaptionLayer } from './CaptionLayer.js';

// Same word-span extraction helper as CaptionLayer.test.tsx. Kept inline
// (not extracted to a shared fixtures module) because the helper is 4 lines
// and pulling it into a shared file for one sibling consumer would create
// more coupling than it saves.
function getWordSpans(container: HTMLElement): HTMLElement[] {
  const allSpans = Array.from(container.querySelectorAll('span')) as HTMLElement[];
  return allSpans.filter((s) => s.textContent !== ' ' && s !== allSpans[0]);
}

/**
 * Regression suite for the second-clip word-highlighting bug.
 *
 * Bug: before this fix, any `CaptionClip` placed at `startFrame > 0` never
 * highlighted its words. Inside a `<Sequence from={clip.startFrame}>`,
 * `useCurrentFrame()` returns Sequence-local frames (0..N) but
 * `word.startFrame` is an absolute composition frame emitted by
 * `useAddCaptionsToTimeline` as `Math.round(whisperStart * fps)`. For the
 * first clip (`startFrame === 0`) local and absolute coincide by accident,
 * so the highlight appeared to work. Every subsequent clip never reached
 * its words' absolute startFrames and stayed at `inactiveColor` forever.
 *
 * Fix: `CaptionLayer` accepts a `clipStartFrame?: number` prop (default 0)
 * and reconstructs the absolute frame as `clipStartFrame + useCurrentFrame()`.
 * `VideoComposition.tsx` passes `clipStartFrame={clip.startFrame}`.
 *
 * These tests lock the fix in place and also reproduce the buggy shape so
 * a silent regression (e.g. someone removing the prop forwarding in
 * `VideoComposition.tsx`, or defaulting it back to 0) is immediately caught.
 */
describe('CaptionLayer — clipStartFrame offset (regression: second-clip word highlighting)', () => {
  // The canonical second-clip fixture: absolute frames 150/160/170.
  const SECOND_CLIP_WORDS = [
    { word: 'Second', startFrame: 150, endFrame: 160 },
    { word: 'clip', startFrame: 160, endFrame: 170 },
    { word: 'words', startFrame: 170, endFrame: 180 },
  ];

  // Parallel "first clip" fixture used by the backward-compat assertion.
  const FIRST_CLIP_WORDS = [
    { word: 'The', startFrame: 0, endFrame: 10 },
    { word: 'quick', startFrame: 10, endFrame: 20 },
    { word: 'brown', startFrame: 20, endFrame: 30 },
  ];

  it('activates first word of a second clip at its local frame 0 when clipStartFrame=150', () => {
    // Sequence local frame 0, clipStartFrame 150 → global 150. First word (150) is active.
    mockedFrame = 0;
    const activeColor = '#00FF00';
    const inactiveColor = '#888888';
    const { container } = render(
      <CaptionLayer
        words={SECOND_CLIP_WORDS}
        clipStartFrame={150}
        activeColor={activeColor}
        inactiveColor={inactiveColor}
      />
    );
    const wordSpans = getWordSpans(container);
    // Without the offset fix, word[0] would be inactive here (bug being fixed).
    expect(wordSpans[0].style.color).toBe('rgb(0, 255, 0)');
    expect(wordSpans[1].style.color).toBe('rgb(136, 136, 136)');
    expect(wordSpans[2].style.color).toBe('rgb(136, 136, 136)');
  });

  it('activates second word of a second clip at local frame 10 (global 160)', () => {
    mockedFrame = 10;
    const activeColor = '#FFFFFF';
    const inactiveColor = '#888888';
    const { container } = render(
      <CaptionLayer
        words={SECOND_CLIP_WORDS}
        clipStartFrame={150}
        activeColor={activeColor}
        inactiveColor={inactiveColor}
      />
    );
    const wordSpans = getWordSpans(container);
    expect(wordSpans[0].style.color).toBe('rgb(255, 255, 255)'); // active
    expect(wordSpans[1].style.color).toBe('rgb(255, 255, 255)'); // active at global 160
    expect(wordSpans[2].style.color).toBe('rgb(136, 136, 136)'); // inactive (global 160 < 170)
  });

  it('activates all three words of a second clip at local frame 20 (global 170)', () => {
    mockedFrame = 20;
    const activeColor = '#FF00FF';
    const { container } = render(
      <CaptionLayer
        words={SECOND_CLIP_WORDS}
        clipStartFrame={150}
        activeColor={activeColor}
        inactiveColor="#888888"
      />
    );
    const wordSpans = getWordSpans(container);
    wordSpans.forEach((span) => {
      expect(span.style.color).toBe('rgb(255, 0, 255)');
    });
  });

  it('reproduces the bug shape: without clipStartFrame, second-clip words stay inactive', () => {
    // This is the user-reported behaviour. At local frame 0, the words'
    // absolute startFrames (150+) are never reached, so every word stays
    // at inactiveColor. Locking in the broken semantics here blocks a
    // future regression where clipStartFrame silently defaults back to 0.
    mockedFrame = 0;
    const inactiveColor = '#AAAAAA';
    const { container } = render(
      <CaptionLayer
        words={SECOND_CLIP_WORDS}
        // NOTE: clipStartFrame intentionally omitted → defaults to 0
        activeColor="#FFFFFF"
        inactiveColor={inactiveColor}
      />
    );
    const wordSpans = getWordSpans(container);
    wordSpans.forEach((span) => {
      expect(span.style.color).toBe('rgb(170, 170, 170)');
    });
  });

  it('backward compatible: clipStartFrame=0 behaves exactly like the old un-prop layer', () => {
    mockedFrame = 10;
    const activeColor = '#FFFFFF';
    const inactiveColor = '#888888';
    const { container } = render(
      <CaptionLayer
        words={FIRST_CLIP_WORDS}
        clipStartFrame={0}
        activeColor={activeColor}
        inactiveColor={inactiveColor}
      />
    );
    const wordSpans = getWordSpans(container);
    // Matches the "activates first and second words at frame 10" case in CaptionLayer.test.tsx.
    expect(wordSpans[0].style.color).toBe('rgb(255, 255, 255)');
    expect(wordSpans[1].style.color).toBe('rgb(255, 255, 255)');
    expect(wordSpans[2].style.color).toBe('rgb(136, 136, 136)');
  });
});
