import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import type { CaptionClip } from '@ai-video-editor/project-schema';

import { ClipBlock } from './ClipBlock';
import { captionClip, defaultProps } from './ClipBlock.fixtures';

describe('ClipBlock — caption clip', () => {
  it('renders caption clip with a background color set', () => {
    const { container } = render(<ClipBlock clip={captionClip} {...defaultProps} />);
    const block = container.firstChild as HTMLElement;
    expect(block.style.background).toBeTruthy();
  });

  it('renders caption clip label showing word preview', () => {
    const { container } = render(<ClipBlock clip={captionClip} {...defaultProps} />);
    const label = container.querySelector('span');
    expect(label?.textContent).toBe('Hello world');
  });

  it('truncates caption label to 40 chars with ellipsis when words are long', () => {
    const longCaptionClip: CaptionClip = {
      ...captionClip,
      words: Array.from({ length: 20 }, (_, i) => ({
        word: `word${i}`,
        startFrame: i * 3,
        endFrame: i * 3 + 2,
      })),
    };
    const { container } = render(<ClipBlock clip={longCaptionClip} {...defaultProps} />);
    const label = container.querySelector('span');
    expect(label?.textContent?.length).toBeLessThanOrEqual(41);
    expect(label?.textContent).toContain('…');
  });

  it('renders "caption" fallback label when caption clip has no words', () => {
    const emptyCaptionClip: CaptionClip = { ...captionClip, words: [] };
    const { container } = render(<ClipBlock clip={emptyCaptionClip} {...defaultProps} />);
    const label = container.querySelector('span');
    expect(label?.textContent).toBe('caption');
  });

  it('renders caption clip with correct aria-label', () => {
    render(<ClipBlock clip={captionClip} {...defaultProps} />);
    const button = screen.getByRole('button');
    expect(button.getAttribute('aria-label')).toContain('Clip: caption');
  });
});
