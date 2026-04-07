import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { TimelineResizeHandle } from './TimelineResizeHandle';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeHandlers() {
  return {
    onPointerDown: vi.fn(),
    onPointerMove: vi.fn(),
    onPointerUp: vi.fn(),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TimelineResizeHandle', () => {
  let handlers: ReturnType<typeof makeHandlers>;

  beforeEach(() => {
    handlers = makeHandlers();
  });

  it('renders a separator with correct aria attributes', () => {
    render(<TimelineResizeHandle {...handlers} />);
    const el = screen.getByRole('separator');
    expect(el).toBeDefined();
    expect(el.getAttribute('aria-orientation')).toBe('horizontal');
    expect(el.getAttribute('aria-label')).toBe('Drag to resize timeline');
  });

  it('calls onPointerDown when pointer is pressed', () => {
    render(<TimelineResizeHandle {...handlers} />);
    fireEvent.pointerDown(screen.getByRole('separator'));
    expect(handlers.onPointerDown).toHaveBeenCalledOnce();
  });

  it('calls onPointerMove when pointer moves', () => {
    render(<TimelineResizeHandle {...handlers} />);
    fireEvent.pointerMove(screen.getByRole('separator'));
    expect(handlers.onPointerMove).toHaveBeenCalledOnce();
  });

  it('calls onPointerUp when pointer is released', () => {
    render(<TimelineResizeHandle {...handlers} />);
    fireEvent.pointerUp(screen.getByRole('separator'));
    expect(handlers.onPointerUp).toHaveBeenCalledOnce();
  });

  it('has cursor: ns-resize style', () => {
    render(<TimelineResizeHandle {...handlers} />);
    const el = screen.getByRole('separator') as HTMLDivElement;
    expect(el.style.cursor).toBe('ns-resize');
  });

  it('has a fixed height of 4px', () => {
    render(<TimelineResizeHandle {...handlers} />);
    const el = screen.getByRole('separator') as HTMLDivElement;
    expect(el.style.height).toBe('4px');
  });

  it('background lightens while dragging and restores on pointerup', () => {
    render(<TimelineResizeHandle {...handlers} />);
    const el = screen.getByRole('separator') as HTMLDivElement;

    const idleBackground = el.style.background;

    fireEvent.pointerDown(el);
    const activeBackground = el.style.background;
    expect(activeBackground).not.toBe(idleBackground);

    fireEvent.pointerUp(el);
    expect(el.style.background).toBe(idleBackground);
  });
});
