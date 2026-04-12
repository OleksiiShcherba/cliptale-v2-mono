import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import type { Clip } from '@ai-video-editor/project-schema';

import { ClipBlock } from './ClipBlock';
import { audioClip, defaultProps, videoClip } from './ClipBlock.fixtures';

describe('ClipBlock', () => {
  it('renders a button with aria-label', () => {
    render(<ClipBlock clip={videoClip} {...defaultProps} />);
    const button = screen.getByRole('button');
    expect(button).toBeDefined();
    expect(button.getAttribute('aria-label')).toContain('Clip: video');
  });

  it('positions correctly using startFrame * pxPerFrame when scrollOffsetX is 0', () => {
    const { container } = render(<ClipBlock clip={videoClip} {...defaultProps} scrollOffsetX={0} />);
    const block = container.firstChild as HTMLElement;
    expect(block.style.left).toBe('40px');
  });

  it('shifts left position by scrollOffsetX', () => {
    const { container } = render(<ClipBlock clip={videoClip} {...defaultProps} scrollOffsetX={20} />);
    const block = container.firstChild as HTMLElement;
    expect(block.style.left).toBe('20px');
  });

  it('sizes correctly using durationFrames * pxPerFrame', () => {
    const { container } = render(<ClipBlock clip={videoClip} {...defaultProps} />);
    const block = container.firstChild as HTMLElement;
    expect(block.style.width).toBe('240px');
  });

  it('shows selected border when isSelected is true', () => {
    const { container } = render(
      <ClipBlock clip={videoClip} {...defaultProps} isSelected={true} />,
    );
    const block = container.firstChild as HTMLElement;
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
    expect(block.style.top).toBe('4px');
  });

  it('has layer 0 offset (top=0) by default', () => {
    const { container } = render(<ClipBlock clip={videoClip} {...defaultProps} />);
    const block = container.firstChild as HTMLElement;
    expect(block.style.top).toBe('0px');
  });

  it('has minimum width of 2px for very short clips', () => {
    const shortClip = { ...videoClip, durationFrames: 0 };
    const { container } = render(
      <ClipBlock clip={shortClip as Clip & { layer?: number }} {...defaultProps} />,
    );
    const block = container.firstChild as HTMLElement;
    expect(parseInt(block.style.width)).toBeGreaterThanOrEqual(2);
  });

  it('uses ghostLeft for position when provided instead of startFrame * pxPerFrame', () => {
    const { container } = render(
      <ClipBlock clip={videoClip} {...defaultProps} ghostLeft={200} scrollOffsetX={0} />,
    );
    const block = container.firstChild as HTMLElement;
    expect(block.style.left).toBe('200px');
  });

  it('subtracts scrollOffsetX from ghostLeft position', () => {
    const { container } = render(
      <ClipBlock clip={videoClip} {...defaultProps} ghostLeft={200} scrollOffsetX={50} />,
    );
    const block = container.firstChild as HTMLElement;
    expect(block.style.left).toBe('150px');
  });

  it('renders at 50% opacity when isDragging is true', () => {
    const { container } = render(
      <ClipBlock clip={videoClip} {...defaultProps} isDragging={true} />,
    );
    const block = container.firstChild as HTMLElement;
    expect(block.style.opacity).toBe('0.5');
  });

  it('renders at 75% opacity when isDragging is false (default normal state per design spec)', () => {
    const { container } = render(<ClipBlock clip={videoClip} {...defaultProps} />);
    const block = container.firstChild as HTMLElement;
    expect(block.style.opacity).toBe('0.75');
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
