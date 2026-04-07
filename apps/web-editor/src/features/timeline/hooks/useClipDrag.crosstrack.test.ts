/**
 * useClipDrag — cross-track drag is intentionally disabled.
 *
 * These tests verify that clips always stay on their original track
 * regardless of vertical pointer movement during a drag.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useClipDrag } from './useClipDrag';
import * as projectStore from '@/store/project-store';
import * as ephemeralStore from '@/store/ephemeral-store';
import * as timelineApi from '../api';
import {
  makeClip,
  makeProject,
  makeReactPointerEvent,
  dispatchPointerEvent,
} from './useClipDrag.fixtures';

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(ephemeralStore, 'getSnapshot').mockReturnValue({
    playheadFrame: 0,
    selectedClipIds: [],
    zoom: 1,
    pxPerFrame: 4,
    scrollOffsetX: 0,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useClipDrag — cross-track drag disabled', () => {
  it('dragInfo does not contain targetTrackId (field removed)', () => {
    const clip = makeClip('clip-001', 10, 'track-001');
    vi.spyOn(projectStore, 'getSnapshot').mockReturnValue(makeProject([clip]));

    const { result } = renderHook(() => useClipDrag('project-001'));

    act(() => {
      result.current.onClipPointerDown(makeReactPointerEvent(40), 'clip-001', false);
    });

    act(() => {
      // Move pointer vertically to where another track would be
      dispatchPointerEvent('pointermove', 40, 100);
    });

    // targetTrackId field should not exist on dragInfo
    expect('targetTrackId' in (result.current.dragInfo ?? {})).toBe(false);
  });

  it('dragInfo does not contain draggingClipSnapshots (field removed)', () => {
    const clip = makeClip('clip-001', 10, 'track-001');
    vi.spyOn(projectStore, 'getSnapshot').mockReturnValue(makeProject([clip]));

    const { result } = renderHook(() => useClipDrag('project-001'));

    act(() => {
      result.current.onClipPointerDown(makeReactPointerEvent(40), 'clip-001', false);
    });

    expect('draggingClipSnapshots' in (result.current.dragInfo ?? {})).toBe(false);
  });

  it('does NOT patch trackId when clip is dropped — even with vertical pointer movement', async () => {
    const clip = makeClip('clip-001', 10, 'track-001');
    vi.spyOn(projectStore, 'getSnapshot').mockReturnValue(
      makeProject([clip], [{ id: 'track-002', name: 'Track 2' }]),
    );
    vi.spyOn(projectStore, 'setProject');
    const mockPatch = vi.spyOn(timelineApi, 'patchClip').mockResolvedValue(undefined);

    const { result } = renderHook(() => useClipDrag('project-001'));

    act(() => {
      result.current.onClipPointerDown(makeReactPointerEvent(40), 'clip-001', false);
    });

    await act(async () => {
      // Move pointer down (simulating attempt to drag to another track row)
      dispatchPointerEvent('pointermove', 60, 200);
      dispatchPointerEvent('pointerup', 60, 200);
      await Promise.resolve();
    });

    // patchClip should be called with only startFrame — no trackId
    if (mockPatch.mock.calls.length > 0) {
      const payload = mockPatch.mock.calls[0]![2];
      expect(payload.trackId).toBeUndefined();
    }
  });

  it('clip stays on original track in project store after drop with vertical movement', async () => {
    const clip = makeClip('clip-001', 10, 'track-001');
    const mockSetProject = vi.spyOn(projectStore, 'setProject');
    vi.spyOn(projectStore, 'getSnapshot').mockReturnValue(makeProject([clip]));
    vi.spyOn(timelineApi, 'patchClip').mockResolvedValue(undefined);

    const { result } = renderHook(() => useClipDrag('project-001'));

    act(() => {
      result.current.onClipPointerDown(makeReactPointerEvent(40), 'clip-001', false);
    });

    await act(async () => {
      // Move horizontally and vertically
      dispatchPointerEvent('pointermove', 60, 300);
      dispatchPointerEvent('pointerup', 60, 300);
      await Promise.resolve();
    });

    const lastCall = mockSetProject.mock.calls[mockSetProject.mock.calls.length - 1];
    expect(lastCall).toBeDefined();
    const updatedClip = lastCall![0].clips?.find((c: { id: string }) => c.id === 'clip-001');
    expect(updatedClip?.trackId).toBe('track-001');
  });
});
