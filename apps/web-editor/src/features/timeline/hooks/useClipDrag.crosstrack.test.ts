import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useClipDrag } from './useClipDrag';
import * as projectStore from '@/store/project-store';
import * as ephemeralStore from '@/store/ephemeral-store';
import * as timelineApi from '../api';
import * as timelineRefs from '@/store/timeline-refs';
import {
  TRACK_ROW_HEIGHT,
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

describe('useClipDrag — cross-track drag', () => {
  it('includes targetTrackId in dragInfo resolved from track list bounds', () => {
    const clip = makeClip('clip-001', 10, 'track-001');
    vi.spyOn(projectStore, 'getSnapshot').mockReturnValue(
      makeProject([clip], [{ id: 'track-002', name: 'Track 2' }]),
    );
    vi.spyOn(timelineRefs, 'getTrackListBounds').mockReturnValue({
      topY: 0,
      trackIds: ['track-001', 'track-002'],
    });

    const { result } = renderHook(() => useClipDrag('project-001'));

    act(() => {
      result.current.onClipPointerDown(makeReactPointerEvent(40), 'clip-001', false);
    });

    // Move pointer to row 1 (clientY = TRACK_ROW_HEIGHT + 1 = 49)
    act(() => {
      dispatchPointerEvent('pointermove', 40, TRACK_ROW_HEIGHT + 1);
    });

    expect(result.current.dragInfo?.targetTrackId).toBe('track-002');
  });

  it('patches trackId when clip is dropped on a different track', async () => {
    const clip = makeClip('clip-001', 10, 'track-001');
    vi.spyOn(projectStore, 'getSnapshot').mockReturnValue(
      makeProject([clip], [{ id: 'track-002', name: 'Track 2' }]),
    );
    vi.spyOn(projectStore, 'setProject');
    vi.spyOn(timelineRefs, 'getTrackListBounds').mockReturnValue({
      topY: 0,
      trackIds: ['track-001', 'track-002'],
    });
    const mockPatch = vi.spyOn(timelineApi, 'patchClip').mockResolvedValue(undefined);

    const { result } = renderHook(() => useClipDrag('project-001'));

    act(() => {
      result.current.onClipPointerDown(makeReactPointerEvent(40), 'clip-001', false);
    });

    await act(async () => {
      // Drop on track-002 row, same X (no horizontal move)
      dispatchPointerEvent('pointermove', 40, TRACK_ROW_HEIGHT + 1);
      dispatchPointerEvent('pointerup', 40, TRACK_ROW_HEIGHT + 1);
      await Promise.resolve();
    });

    expect(mockPatch).toHaveBeenCalledWith(
      'project-001',
      'clip-001',
      expect.objectContaining({ trackId: 'track-002' }),
    );
  });

  it('does NOT patch trackId when dropped on same track', async () => {
    const clip = makeClip('clip-001', 10, 'track-001');
    vi.spyOn(projectStore, 'getSnapshot').mockReturnValue(makeProject([clip]));
    vi.spyOn(projectStore, 'setProject');
    vi.spyOn(timelineRefs, 'getTrackListBounds').mockReturnValue({
      topY: 0,
      trackIds: ['track-001'],
    });
    const mockPatch = vi.spyOn(timelineApi, 'patchClip').mockResolvedValue(undefined);

    const { result } = renderHook(() => useClipDrag('project-001'));

    act(() => {
      result.current.onClipPointerDown(makeReactPointerEvent(40), 'clip-001', false);
    });

    await act(async () => {
      dispatchPointerEvent('pointermove', 60, 10);
      dispatchPointerEvent('pointerup', 60, 10);
      await Promise.resolve();
    });

    // patchClip called with startFrame but NOT trackId
    if (mockPatch.mock.calls.length > 0) {
      const payload = mockPatch.mock.calls[0]![2];
      expect(payload.trackId).toBeUndefined();
    }
  });

  it('includes draggingClipSnapshots in dragInfo for cross-track ghost rendering', () => {
    const clip = makeClip('clip-001', 10, 'track-001');
    vi.spyOn(projectStore, 'getSnapshot').mockReturnValue(
      makeProject([clip], [{ id: 'track-002', name: 'Track 2' }]),
    );

    const { result } = renderHook(() => useClipDrag('project-001'));

    act(() => {
      result.current.onClipPointerDown(makeReactPointerEvent(40), 'clip-001', false);
    });

    const snapshots = result.current.dragInfo?.draggingClipSnapshots;
    expect(snapshots).toBeDefined();
    expect(snapshots!.length).toBe(1);
    expect(snapshots![0]!.id).toBe('clip-001');
  });
});
