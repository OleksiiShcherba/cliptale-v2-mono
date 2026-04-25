import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';

import { TimelineRuler } from './TimelineRuler';
import * as ephemeralStore from '@/store/ephemeral-store';

// Canvas is not fully supported in jsdom — mock getContext so it doesn't crash.
beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    font: '',
    textBaseline: '',
    textAlign: '',
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
    scale: vi.fn(),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const defaultProps = {
  durationFrames: 300,
  pxPerFrame: 4,
  fps: 30,
  scrollOffsetX: 0,
  width: 800,
};

describe('TimelineRuler', () => {
  it('renders a canvas element', () => {
    const { container } = render(<TimelineRuler {...defaultProps} />);
    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
  });

  it('has an aria-label for accessibility', () => {
    const { container } = render(<TimelineRuler {...defaultProps} />);
    const canvas = container.querySelector('canvas');
    expect(canvas?.getAttribute('aria-label')).toContain('Timeline ruler');
  });

  it('has role="slider" for accessibility', () => {
    const { container } = render(<TimelineRuler {...defaultProps} />);
    const canvas = container.querySelector('canvas');
    expect(canvas?.getAttribute('role')).toBe('slider');
  });

  it('calls setPlayheadFrame when clicked', () => {
    const spy = vi.spyOn(ephemeralStore, 'setPlayheadFrame');
    const { container } = render(<TimelineRuler {...defaultProps} />);
    const canvas = container.querySelector('canvas')!;

    // Simulate click at x=80 (frame = round((80 + 0) / 4) = 20)
    fireEvent.click(canvas, {
      clientX: 80,
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
    });

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('calls setPxPerFrame on wheel event', () => {
    const spy = vi.spyOn(ephemeralStore, 'setPxPerFrame');
    const { container } = render(<TimelineRuler {...defaultProps} />);
    const canvas = container.querySelector('canvas')!;

    fireEvent.wheel(canvas, { deltaY: -10 });

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('clamps playhead frame to durationFrames - 1 on click', () => {
    const spy = vi.spyOn(ephemeralStore, 'setPlayheadFrame');

    // Mock getBoundingClientRect to return left=0
    const { container } = render(
      <TimelineRuler {...defaultProps} durationFrames={10} pxPerFrame={1} />,
    );
    const canvas = container.querySelector('canvas')!;
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, right: 800, bottom: 28, width: 800, height: 28 }),
    });

    // Click far to the right (x=9999) should clamp to frame 9 (durationFrames - 1)
    fireEvent.click(canvas, { clientX: 9999 });

    expect(spy).toHaveBeenCalledWith(9);
    spy.mockRestore();
  });

  it('renders at min zoom (1 px/frame) without errors', () => {
    expect(() =>
      render(<TimelineRuler {...defaultProps} pxPerFrame={1} />),
    ).not.toThrow();
  });

  it('renders at max zoom (100 px/frame) without errors', () => {
    expect(() =>
      render(<TimelineRuler {...defaultProps} pxPerFrame={100} />),
    ).not.toThrow();
  });
});
