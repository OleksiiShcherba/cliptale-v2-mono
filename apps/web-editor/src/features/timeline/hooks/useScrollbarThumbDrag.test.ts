/**
 * useScrollbarThumbDrag — unit tests.
 *
 * Tests cover:
 *   - pointerdown: captures pointer and records drag origin
 *   - pointermove (active drag): updates setScrollOffsetX proportionally
 *   - pointermove (no drag): no-op
 *   - pointerup: clears drag state so subsequent pointermove is a no-op
 *   - offset clamped to minimum 0 on leftward drag
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

import * as ephemeralStore from '@/store/ephemeral-store';

import { useScrollbarThumbDrag } from './useScrollbarThumbDrag';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/store/ephemeral-store', async (importOriginal) => {
  const actual = await importOriginal<typeof ephemeralStore>();
  return {
    ...actual,
    setScrollOffsetX: vi.fn(),
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Creates a minimal React.PointerEvent-like object for testing. */
function makePointerEvent(clientX: number, pointerId = 1): React.PointerEvent<HTMLDivElement> {
  const setPointerCapture = vi.fn();
  return {
    clientX,
    pointerId,
    currentTarget: { setPointerCapture } as unknown as EventTarget & HTMLDivElement,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as React.PointerEvent<HTMLDivElement>;
}

function makeScrollOffsetXRef(value = 0) {
  return { current: value };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useScrollbarThumbDrag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('captures pointer on pointerdown', () => {
    const scrollOffsetXRef = makeScrollOffsetXRef(0);
    const { result } = renderHook(() =>
      useScrollbarThumbDrag(scrollOffsetXRef, 640, 1200),
    );

    const event = makePointerEvent(200);
    result.current.handleThumbPointerDown(event);

    expect(event.currentTarget.setPointerCapture).toHaveBeenCalledWith(1);
  });

  it('calls setScrollOffsetX with correct offset on pointermove after pointerdown', () => {
    const scrollOffsetXRef = makeScrollOffsetXRef(0);
    const { result } = renderHook(() =>
      useScrollbarThumbDrag(scrollOffsetXRef, 640, 1200),
    );

    result.current.handleThumbPointerDown(makePointerEvent(200));
    result.current.handleThumbPointerMove(makePointerEvent(300));

    // ratio = 1200 / 640 = 1.875; dx = 100; newOffset = 0 + 100 * 1.875 = 187.5
    expect(vi.mocked(ephemeralStore.setScrollOffsetX)).toHaveBeenCalledWith(
      expect.closeTo(187.5, 0),
    );
  });

  it('takes the current scrollOffsetX from scrollOffsetXRef at drag start', () => {
    const scrollOffsetXRef = makeScrollOffsetXRef(200);
    const { result } = renderHook(() =>
      useScrollbarThumbDrag(scrollOffsetXRef, 640, 1200),
    );

    result.current.handleThumbPointerDown(makePointerEvent(100));
    result.current.handleThumbPointerMove(makePointerEvent(200));

    // startOffset=200, dx=100, ratio=1.875 → newOffset = 200 + 187.5 = 387.5
    expect(vi.mocked(ephemeralStore.setScrollOffsetX)).toHaveBeenCalledWith(
      expect.closeTo(387.5, 0),
    );
  });

  it('clamps offset to 0 on leftward drag past start', () => {
    const scrollOffsetXRef = makeScrollOffsetXRef(0);
    const { result } = renderHook(() =>
      useScrollbarThumbDrag(scrollOffsetXRef, 640, 1200),
    );

    result.current.handleThumbPointerDown(makePointerEvent(500));
    result.current.handleThumbPointerMove(makePointerEvent(0));

    // dx = -500, ratio = 1.875 → would be 0 + (-500 * 1.875) = -937.5 → clamped to 0
    expect(vi.mocked(ephemeralStore.setScrollOffsetX)).toHaveBeenCalledWith(0);
  });

  it('does not call setScrollOffsetX on pointermove without prior pointerdown', () => {
    const scrollOffsetXRef = makeScrollOffsetXRef(0);
    const { result } = renderHook(() =>
      useScrollbarThumbDrag(scrollOffsetXRef, 640, 1200),
    );

    result.current.handleThumbPointerMove(makePointerEvent(300));

    expect(vi.mocked(ephemeralStore.setScrollOffsetX)).not.toHaveBeenCalled();
  });

  it('stops updating after pointerup', () => {
    const scrollOffsetXRef = makeScrollOffsetXRef(0);
    const { result } = renderHook(() =>
      useScrollbarThumbDrag(scrollOffsetXRef, 640, 1200),
    );

    result.current.handleThumbPointerDown(makePointerEvent(200));
    result.current.handleThumbPointerUp({} as React.PointerEvent<HTMLDivElement>);

    vi.mocked(ephemeralStore.setScrollOffsetX).mockClear();

    result.current.handleThumbPointerMove(makePointerEvent(300));
    expect(vi.mocked(ephemeralStore.setScrollOffsetX)).not.toHaveBeenCalled();
  });

  it('picks up updated laneWidth and totalContentWidth via refs', () => {
    const scrollOffsetXRef = makeScrollOffsetXRef(0);
    let laneWidth = 640;
    let totalContentWidth = 1200;

    const { result, rerender } = renderHook(() =>
      useScrollbarThumbDrag(scrollOffsetXRef, laneWidth, totalContentWidth),
    );

    // Change geometry before drag starts
    laneWidth = 320;
    totalContentWidth = 960;
    rerender();

    result.current.handleThumbPointerDown(makePointerEvent(100));
    result.current.handleThumbPointerMove(makePointerEvent(200));

    // ratio = 960 / 320 = 3; dx = 100; newOffset = 0 + 300 = 300
    expect(vi.mocked(ephemeralStore.setScrollOffsetX)).toHaveBeenCalledWith(
      expect.closeTo(300, 0),
    );
  });
});
