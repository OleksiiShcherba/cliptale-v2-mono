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

// DOM layout for N words:
//   span[0]  = outer container (textShadow, fontSize, etc. — no color)
//   span[1]  = word 0
//   span[2]  = space between word 0 and 1
//   span[3]  = word 1
//   span[4]  = space between word 1 and 2
//   span[5]  = word 2
//   (no trailing space after last word)
//
// Helper: return only word spans (not the wrapper or space spans).
function getWordSpans(container: HTMLElement): HTMLElement[] {
  const allSpans = Array.from(container.querySelectorAll('span')) as HTMLElement[];
  // word spans have text content that is not a single space
  return allSpans.filter((s) => s.textContent !== ' ' && s !== allSpans[0]);
}

const WORDS = [
  { word: 'The', startFrame: 0, endFrame: 10 },
  { word: 'quick', startFrame: 10, endFrame: 20 },
  { word: 'brown', startFrame: 20, endFrame: 30 },
];

describe('CaptionLayer', () => {
  describe('progressive reveal — frame 0', () => {
    it('renders all three words at frame 0', () => {
      mockedFrame = 0;
      const { container } = render(
        <CaptionLayer words={WORDS} activeColor="#FFFFFF" inactiveColor="rgba(255,255,255,0.35)" />
      );
      const wordSpans = getWordSpans(container);
      expect(wordSpans).toHaveLength(3);
    });

    it('uses activeColor for first word at frame 0 (startFrame === 0)', () => {
      mockedFrame = 0;
      const activeColor = '#FF0000';
      const { container } = render(
        <CaptionLayer words={WORDS} activeColor={activeColor} inactiveColor="#888888" />
      );
      const wordSpans = getWordSpans(container);
      // First word has startFrame 0; currentFrame (0) >= 0, so active.
      expect(wordSpans[0].style.color).toBe('rgb(255, 0, 0)');
    });

    it('uses inactiveColor for words whose startFrame has not been reached', () => {
      mockedFrame = 0;
      const inactiveColor = '#888888';
      const { container } = render(
        <CaptionLayer words={WORDS} activeColor="#FFFFFF" inactiveColor={inactiveColor} />
      );
      const wordSpans = getWordSpans(container);
      // Second word has startFrame 10; currentFrame (0) < 10, so inactive.
      expect(wordSpans[1].style.color).toBe('rgb(136, 136, 136)');
      // Third word has startFrame 20; currentFrame (0) < 20, so inactive.
      expect(wordSpans[2].style.color).toBe('rgb(136, 136, 136)');
    });
  });

  describe('progressive reveal — mid-sequence frame', () => {
    it('activates first and second words at frame 10', () => {
      mockedFrame = 10;
      const activeColor = '#FFFFFF';
      const inactiveColor = '#888888';
      const { container } = render(
        <CaptionLayer words={WORDS} activeColor={activeColor} inactiveColor={inactiveColor} />
      );
      const wordSpans = getWordSpans(container);
      // word-0 (startFrame 0 <= 10 → active)
      expect(wordSpans[0].style.color).toBe('rgb(255, 255, 255)');
      // word-1 (startFrame 10 <= 10 → active)
      expect(wordSpans[1].style.color).toBe('rgb(255, 255, 255)');
      // word-2 (startFrame 20 > 10 → inactive)
      expect(wordSpans[2].style.color).toBe('rgb(136, 136, 136)');
    });

    it('all words are active once currentFrame surpasses all startFrames', () => {
      mockedFrame = 30;
      const activeColor = '#FFFFFF';
      const { container } = render(
        <CaptionLayer words={WORDS} activeColor={activeColor} inactiveColor="#888888" />
      );
      const wordSpans = getWordSpans(container);
      expect(wordSpans[0].style.color).toBe('rgb(255, 255, 255)');
      expect(wordSpans[1].style.color).toBe('rgb(255, 255, 255)');
      expect(wordSpans[2].style.color).toBe('rgb(255, 255, 255)');
    });

    it('a word that has passed its startFrame remains activeColor (progressive reveal persists)', () => {
      mockedFrame = 25;
      const activeColor = '#FFFF00';
      const { container } = render(
        <CaptionLayer words={WORDS} activeColor={activeColor} inactiveColor="#888888" />
      );
      const wordSpans = getWordSpans(container);
      // All three startFrames (0, 10, 20) are <= 25 — all active.
      wordSpans.forEach((span) => {
        expect(span.style.color).toBe('rgb(255, 255, 0)');
      });
    });

    it('activates only first word at frame 5 (between first and second startFrame)', () => {
      mockedFrame = 5;
      const activeColor = '#00FF00';
      const inactiveColor = '#FF0000';
      const { container } = render(
        <CaptionLayer words={WORDS} activeColor={activeColor} inactiveColor={inactiveColor} />
      );
      const wordSpans = getWordSpans(container);
      expect(wordSpans[0].style.color).toBe('rgb(0, 255, 0)');   // active
      expect(wordSpans[1].style.color).toBe('rgb(255, 0, 0)');   // inactive
      expect(wordSpans[2].style.color).toBe('rgb(255, 0, 0)');   // inactive
    });
  });

  describe('defaults', () => {
    it('renders without crashing when words array is empty', () => {
      mockedFrame = 0;
      const { getByTestId } = render(<CaptionLayer words={[]} />);
      expect(getByTestId('absolute-fill')).toBeTruthy();
    });

    it('uses default activeColor (#FFFFFF) when not provided', () => {
      mockedFrame = 0;
      const { container } = render(
        <CaptionLayer words={[{ word: 'Hi', startFrame: 0, endFrame: 10 }]} />
      );
      const wordSpans = getWordSpans(container);
      // startFrame 0 <= frame 0 → active, default activeColor is white.
      expect(wordSpans[0].style.color).toBe('rgb(255, 255, 255)');
    });

    it('uses default position (bottom) styling', () => {
      mockedFrame = 0;
      const { getByTestId } = render(
        <CaptionLayer words={[{ word: 'Hi', startFrame: 0, endFrame: 10 }]} />
      );
      const fill = getByTestId('absolute-fill') as HTMLElement;
      expect(fill.style.justifyContent).toBe('flex-end');
    });

    it('applies top position styling when position=top', () => {
      mockedFrame = 0;
      const { getByTestId } = render(
        <CaptionLayer words={[{ word: 'Hi', startFrame: 0, endFrame: 10 }]} position="top" />
      );
      const fill = getByTestId('absolute-fill') as HTMLElement;
      expect(fill.style.justifyContent).toBe('flex-start');
    });

    it('applies center position styling when position=center', () => {
      mockedFrame = 0;
      const { getByTestId } = render(
        <CaptionLayer words={[{ word: 'Hi', startFrame: 0, endFrame: 10 }]} position="center" />
      );
      const fill = getByTestId('absolute-fill') as HTMLElement;
      expect(fill.style.justifyContent).toBe('center');
    });
  });

  describe('styling', () => {
    it('applies textShadow matching TextOverlayLayer', () => {
      mockedFrame = 0;
      const { container } = render(
        <CaptionLayer words={[{ word: 'Hi', startFrame: 0, endFrame: 10 }]} />
      );
      // The outer word-container span carries textShadow
      const containerSpan = container.querySelector('span') as HTMLElement;
      expect(containerSpan.style.textShadow).toBe('0 2px 4px rgba(0,0,0,0.8)');
    });

    it('applies the specified fontSize', () => {
      mockedFrame = 0;
      const { container } = render(
        <CaptionLayer words={[{ word: 'Hi', startFrame: 0, endFrame: 10 }]} fontSize={36} />
      );
      const containerSpan = container.querySelector('span') as HTMLElement;
      expect(containerSpan.style.fontSize).toBe('36px');
    });
  });
});
