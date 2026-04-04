import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { ClipBlock } from './ClipBlock';
import type { Clip } from '@ai-video-editor/project-schema';

const videoClip: Clip & { layer?: number } = {
  id: 'clip-001',
  type: 'video',
  assetId: 'asset-001',
  trackId: 'track-001',
  startFrame: 10,
  durationFrames: 60,
  trimInFrame: 0,
  volume: 1,
  opacity: 1,
};

const audioClip: Clip & { layer?: number } = {
  id: 'clip-002',
  type: 'audio',
  assetId: 'asset-002',
  trackId: 'track-001',
  startFrame: 0,
  durationFrames: 90,
  trimInFrame: 0,
  volume: 1,
};

const defaultProps = {
  pxPerFrame: 4,
  isSelected: false,
  isLocked: false,
  laneHeight: 48,
  onClick: vi.fn(),
};

describe('ClipBlock', () => {
  it('renders a button with aria-label', () => {
    render(<ClipBlock clip={videoClip} {...defaultProps} />);
    const button = screen.getByRole('button');
    expect(button).toBeDefined();
    expect(button.getAttribute('aria-label')).toContain('Clip: video');
  });

  it('positions correctly using startFrame * pxPerFrame', () => {
    const { container } = render(<ClipBlock clip={videoClip} {...defaultProps} />);
    const block = container.firstChild as HTMLElement;
    // left = 10 * 4 = 40px
    expect(block.style.left).toBe('40px');
  });

  it('sizes correctly using durationFrames * pxPerFrame', () => {
    const { container } = render(<ClipBlock clip={videoClip} {...defaultProps} />);
    const block = container.firstChild as HTMLElement;
    // width = 60 * 4 = 240px
    expect(block.style.width).toBe('240px');
  });

  it('shows selected border when isSelected is true', () => {
    const { container } = render(
      <ClipBlock clip={videoClip} {...defaultProps} isSelected={true} />,
    );
    const block = container.firstChild as HTMLElement;
    // jsdom converts hex to rgb; check that a non-transparent border is set
    expect(block.style.border).not.toContain('transparent');
    expect(block.style.border).toContain('solid');
  });

  it('shows transparent border when isSelected is false', () => {
    const { container } = render(
      <ClipBlock clip={videoClip} {...defaultProps} isSelected={false} />,
    );
    const block = container.firstChild as HTMLElement;
    expect(block.style.border).toContain('transparent');
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<ClipBlock clip={videoClip} {...defaultProps} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledWith('clip-001', false);
  });

  it('calls onClick with shiftKey=true on shift+click', () => {
    const onClick = vi.fn();
    render(<ClipBlock clip={videoClip} {...defaultProps} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'), { shiftKey: true });
    expect(onClick).toHaveBeenCalledWith('clip-001', true);
  });

  it('does not call onClick when track is locked', () => {
    const onClick = vi.fn();
    render(<ClipBlock clip={videoClip} {...defaultProps} isLocked={true} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('shows not-allowed cursor when locked', () => {
    const { container } = render(
      <ClipBlock clip={videoClip} {...defaultProps} isLocked={true} />,
    );
    const block = container.firstChild as HTMLElement;
    expect(block.style.cursor).toBe('not-allowed');
  });

  it('renders thumbnail img when video clip has thumbnailUrl', () => {
    render(
      <ClipBlock
        clip={videoClip}
        {...defaultProps}
        assetData={{ thumbnailUrl: 'https://example.com/thumb.jpg', waveformPeaks: null }}
      />,
    );
    const img = document.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.src).toContain('thumb.jpg');
  });

  it('does not render img when no assetData', () => {
    render(<ClipBlock clip={videoClip} {...defaultProps} />);
    const img = document.querySelector('img');
    expect(img).toBeNull();
  });

  it('renders waveform SVG for audio clip with peaks', () => {
    const { container } = render(
      <ClipBlock
        clip={audioClip}
        {...defaultProps}
        assetData={{ thumbnailUrl: null, waveformPeaks: [0.5, 0.8, 0.3, 1.0] }}
      />,
    );
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
  });

  it('does not render waveform SVG for audio clip without peaks', () => {
    const { container } = render(
      <ClipBlock
        clip={audioClip}
        {...defaultProps}
        assetData={{ thumbnailUrl: null, waveformPeaks: null }}
      />,
    );
    const svg = container.querySelector('svg');
    expect(svg).toBeNull();
  });

  it('applies vertical offset for clip with layer > 0', () => {
    const layeredClip = { ...videoClip, layer: 1 };
    const { container } = render(<ClipBlock clip={layeredClip} {...defaultProps} />);
    const block = container.firstChild as HTMLElement;
    // layer 1 → top = 4px
    expect(block.style.top).toBe('4px');
  });

  it('has layer 0 offset (top=0) by default', () => {
    const { container } = render(<ClipBlock clip={videoClip} {...defaultProps} />);
    const block = container.firstChild as HTMLElement;
    expect(block.style.top).toBe('0px');
  });

  it('has minimum width of 2px for very short clips', () => {
    const shortClip = { ...videoClip, durationFrames: 0 };
    // durationFrames: 0 → Math.max(2, 0 * 4) = 2
    const { container } = render(
      <ClipBlock clip={shortClip as Clip & { layer?: number }} {...defaultProps} />,
    );
    const block = container.firstChild as HTMLElement;
    expect(parseInt(block.style.width)).toBeGreaterThanOrEqual(2);
  });

  // ---------------------------------------------------------------------------
  // Drag-related tests
  // ---------------------------------------------------------------------------

  it('uses ghostLeft for position when provided instead of startFrame * pxPerFrame', () => {
    const { container } = render(
      <ClipBlock clip={videoClip} {...defaultProps} ghostLeft={200} />,
    );
    const block = container.firstChild as HTMLElement;
    // ghostLeft = 200 overrides startFrame (10) * pxPerFrame (4) = 40
    expect(block.style.left).toBe('200px');
  });

  it('renders at 50% opacity when isDragging is true', () => {
    const { container } = render(
      <ClipBlock clip={videoClip} {...defaultProps} isDragging={true} />,
    );
    const block = container.firstChild as HTMLElement;
    expect(block.style.opacity).toBe('0.5');
  });

  it('renders at full opacity when isDragging is false (default)', () => {
    const { container } = render(<ClipBlock clip={videoClip} {...defaultProps} />);
    const block = container.firstChild as HTMLElement;
    expect(block.style.opacity).toBe('1');
  });

  it('calls onPointerDown when pointerdown fires and onPointerDown is provided', () => {
    const onPointerDown = vi.fn();
    render(
      <ClipBlock clip={videoClip} {...defaultProps} onPointerDown={onPointerDown} />,
    );
    fireEvent.pointerDown(screen.getByRole('button'), { button: 0 });
    expect(onPointerDown).toHaveBeenCalledOnce();
    const [event, clipId, isLocked] = onPointerDown.mock.calls[0]!;
    expect(clipId).toBe('clip-001');
    expect(isLocked).toBe(false);
    expect(event).toBeDefined();
  });

  it('does not bind pointerDown handler when onPointerDown is not provided', () => {
    // Should render without errors and not throw
    const { container } = render(<ClipBlock clip={videoClip} {...defaultProps} />);
    const block = container.firstChild as HTMLElement;
    expect(block).toBeDefined();
  });

  it('shows grab cursor by default when not locked', () => {
    const { container } = render(<ClipBlock clip={videoClip} {...defaultProps} />);
    const block = container.firstChild as HTMLElement;
    expect(block.style.cursor).toBe('grab');
  });

  it('calls onContextMenu with clipId and event when right-clicked', () => {
    const onContextMenu = vi.fn();
    render(<ClipBlock clip={videoClip} {...defaultProps} onContextMenu={onContextMenu} />);
    fireEvent.contextMenu(screen.getByRole('button'));
    expect(onContextMenu).toHaveBeenCalledOnce();
    const [event, clipId] = onContextMenu.mock.calls[0]!;
    expect(clipId).toBe('clip-001');
    expect(event).toBeDefined();
  });

  it('does not throw when right-clicked without onContextMenu', () => {
    expect(() => {
      render(<ClipBlock clip={videoClip} {...defaultProps} />);
      fireEvent.contextMenu(screen.getByRole('button'));
    }).not.toThrow();
  });
});
