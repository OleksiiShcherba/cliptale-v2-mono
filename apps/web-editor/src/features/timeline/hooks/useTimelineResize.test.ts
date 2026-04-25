import type React from 'react';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { TIMELINE_PANEL_HEIGHT } from '@/features/timeline/components/timelinePanelStyles';

import { MIN_TIMELINE_HEIGHT, MAX_TIMELINE_HEIGHT, useTimelineResize } from './useTimelineResize';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Builds a minimal PointerEvent-like object for use with the hook handlers. */
function makePointerEvent(clientY: number): React.PointerEvent<HTMLDivElement> {
  return {
    clientY,
    pointerId: 1,
    currentTarget: {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
    },
  } as unknown as React.PointerEvent<HTMLDivElement>;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useTimelineResize', () => {
  it('initialises timelineHeight to TIMELINE_PANEL_HEIGHT', () => {
    const { result } = renderHook(() => useTimelineResize());
    expect(result.current.timelineHeight).toBe(TIMELINE_PANEL_HEIGHT);
  });

  it('increases height when dragged upward (negative deltaY)', () => {
    const { result } = renderHook(() => useTimelineResize());

    act(() => { result.current.onResizePointerDown(makePointerEvent(500)); });
    act(() => { result.current.onResizePointerMove(makePointerEvent(400)); });

    expect(result.current.timelineHeight).toBe(TIMELINE_PANEL_HEIGHT + 100);
  });

  it('decreases height when dragged downward (positive deltaY)', () => {
    const { result } = renderHook(() => useTimelineResize());

    act(() => { result.current.onResizePointerDown(makePointerEvent(300)); });
    act(() => { result.current.onResizePointerMove(makePointerEvent(350)); });

    expect(result.current.timelineHeight).toBe(TIMELINE_PANEL_HEIGHT - 50);
  });

  it('clamps height to MIN_TIMELINE_HEIGHT when dragged far down', () => {
    const { result } = renderHook(() => useTimelineResize());

    act(() => { result.current.onResizePointerDown(makePointerEvent(100)); });
    act(() => { result.current.onResizePointerMove(makePointerEvent(1000)); });

    expect(result.current.timelineHeight).toBe(MIN_TIMELINE_HEIGHT);
  });

  it('clamps height to MAX_TIMELINE_HEIGHT when dragged far up', () => {
    const { result } = renderHook(() => useTimelineResize());

    act(() => { result.current.onResizePointerDown(makePointerEvent(900)); });
    act(() => { result.current.onResizePointerMove(makePointerEvent(0)); });

    expect(result.current.timelineHeight).toBe(MAX_TIMELINE_HEIGHT);
  });

  it('does not change height when pointermove fires without a preceding pointerdown', () => {
    const { result } = renderHook(() => useTimelineResize());

    act(() => { result.current.onResizePointerMove(makePointerEvent(100)); });

    expect(result.current.timelineHeight).toBe(TIMELINE_PANEL_HEIGHT);
  });

  it('stops tracking after pointerup — subsequent pointermove has no effect', () => {
    const { result } = renderHook(() => useTimelineResize());

    act(() => { result.current.onResizePointerDown(makePointerEvent(500)); });
    act(() => { result.current.onResizePointerUp(makePointerEvent(500)); });

    const heightAfterUp = result.current.timelineHeight;

    act(() => { result.current.onResizePointerMove(makePointerEvent(300)); });

    expect(result.current.timelineHeight).toBe(heightAfterUp);
  });

  it('MIN_TIMELINE_HEIGHT < TIMELINE_PANEL_HEIGHT < MAX_TIMELINE_HEIGHT', () => {
    expect(MIN_TIMELINE_HEIGHT).toBeLessThan(TIMELINE_PANEL_HEIGHT);
    expect(MAX_TIMELINE_HEIGHT).toBeGreaterThan(TIMELINE_PANEL_HEIGHT);
  });

  it('calls setPointerCapture on pointerdown with the correct pointerId', () => {
    const { result } = renderHook(() => useTimelineResize());
    const evt = makePointerEvent(400);

    act(() => { result.current.onResizePointerDown(evt); });

    expect((evt.currentTarget as { setPointerCapture: ReturnType<typeof vi.fn> }).setPointerCapture)
      .toHaveBeenCalledWith(evt.pointerId);
  });

  it('calls releasePointerCapture on pointerup with the correct pointerId', () => {
    const { result } = renderHook(() => useTimelineResize());
    const downEvt = makePointerEvent(400);
    const upEvt = makePointerEvent(400);

    act(() => { result.current.onResizePointerDown(downEvt); });
    act(() => { result.current.onResizePointerUp(upEvt); });

    expect((upEvt.currentTarget as { releasePointerCapture: ReturnType<typeof vi.fn> }).releasePointerCapture)
      .toHaveBeenCalledWith(upEvt.pointerId);
  });
});
