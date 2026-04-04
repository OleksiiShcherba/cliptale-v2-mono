import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';

import { useSnapping, SNAP_THRESHOLD_PX } from './useSnapping';
import type { Clip } from '@ai-video-editor/project-schema';

const makeClip = (id: string, startFrame: number, durationFrames: number): Clip => ({
  id,
  type: 'video',
  assetId: 'asset-001',
  trackId: 'track-001',
  startFrame,
  durationFrames,
  trimInFrame: 0,
  volume: 1,
  opacity: 1,
});

describe('useSnapping', () => {
  it('returns the raw frame when no snap target is nearby', () => {
    const { result } = renderHook(() =>
      useSnapping({
        clips: [],
        draggingClipIds: new Set(),
        playheadFrame: 0,
        pxPerFrame: 4,
      }),
    );
    // Frame 200 — far from frame 0 (threshold at 4px = 1.25 frames from target).
    const res = result.current.snap(200);
    expect(res.frame).toBe(200);
    expect(res.isSnapping).toBe(false);
    expect(res.snapPx).toBeNull();
  });

  it('snaps to frame 0 when within threshold', () => {
    const { result } = renderHook(() =>
      useSnapping({
        clips: [],
        draggingClipIds: new Set(),
        playheadFrame: 100,
        pxPerFrame: 4,
      }),
    );
    // pxPerFrame = 4, threshold = 5px → thresholdFrames = 1.25
    // rawFrame = 0.5 is within 1.25 frames of frame 0
    const res = result.current.snap(0.5);
    expect(res.frame).toBe(0);
    expect(res.isSnapping).toBe(true);
    expect(res.snapPx).toBe(0);
  });

  it('snaps to playhead frame when within threshold', () => {
    const { result } = renderHook(() =>
      useSnapping({
        clips: [],
        draggingClipIds: new Set(),
        playheadFrame: 50,
        pxPerFrame: 4,
      }),
    );
    // rawFrame = 50.5 is within threshold of playheadFrame=50
    const res = result.current.snap(50.5);
    expect(res.frame).toBe(50);
    expect(res.isSnapping).toBe(true);
    expect(res.snapPx).toBe(50 * 4);
  });

  it('snaps to the left edge of a non-dragging clip', () => {
    const clip = makeClip('clip-002', 100, 30);
    const { result } = renderHook(() =>
      useSnapping({
        clips: [clip],
        draggingClipIds: new Set(['clip-001']), // different clip dragging
        playheadFrame: 0,
        pxPerFrame: 4,
      }),
    );
    // rawFrame near clip.startFrame=100
    const res = result.current.snap(100.5);
    expect(res.frame).toBe(100);
    expect(res.isSnapping).toBe(true);
  });

  it('snaps to the right edge (startFrame + durationFrames) of a non-dragging clip', () => {
    const clip = makeClip('clip-002', 80, 20); // right edge = 100
    const { result } = renderHook(() =>
      useSnapping({
        clips: [clip],
        draggingClipIds: new Set(),
        playheadFrame: 0,
        pxPerFrame: 4,
      }),
    );
    // rawFrame near clip end edge = 100
    const res = result.current.snap(99.8);
    expect(res.frame).toBe(100);
    expect(res.isSnapping).toBe(true);
  });

  it('does not snap to edges of clips that are being dragged', () => {
    const draggingClip = makeClip('clip-dragging', 100, 30);
    const { result } = renderHook(() =>
      useSnapping({
        clips: [draggingClip],
        draggingClipIds: new Set(['clip-dragging']),
        playheadFrame: 0,
        pxPerFrame: 4,
      }),
    );
    // Would snap to 100 (left edge of dragging clip) but dragging clips are excluded
    // Nearest valid target is 0 (frame 0). Frame 100 is far from 0.
    const res = result.current.snap(100.5);
    // Should NOT snap to 100 (dragged clip excluded), nearest is 0 which is far away
    expect(res.isSnapping).toBe(false);
    expect(res.frame).toBe(100.5);
  });

  it('picks the nearest snap target when multiple targets are nearby', () => {
    const clip = makeClip('clip-002', 50, 20); // edges at 50 and 70
    const { result } = renderHook(() =>
      useSnapping({
        clips: [clip],
        draggingClipIds: new Set(),
        playheadFrame: 51,
        pxPerFrame: 4,
      }),
    );
    // rawFrame=50.2, clip left=50, playhead=51 — closer to 50
    const res = result.current.snap(50.2);
    expect(res.frame).toBe(50);
  });

  it('SNAP_THRESHOLD_PX is exported as 5', () => {
    expect(SNAP_THRESHOLD_PX).toBe(5);
  });

  it('scales threshold correctly at different zoom levels', () => {
    // pxPerFrame = 2 → thresholdFrames = 5/2 = 2.5
    // rawFrame = 2.4, frame 0 is within 2.5 frames → should snap
    const { result } = renderHook(() =>
      useSnapping({
        clips: [],
        draggingClipIds: new Set(),
        playheadFrame: 100,
        pxPerFrame: 2,
      }),
    );
    const res = result.current.snap(2.4);
    expect(res.frame).toBe(0);
    expect(res.isSnapping).toBe(true);
  });

  it('does not snap when frame is just outside threshold', () => {
    // pxPerFrame = 10 → thresholdFrames = 5/10 = 0.5
    // rawFrame = 50.6, playhead = 50; delta = 0.6 > 0.5 → should not snap
    const { result } = renderHook(() =>
      useSnapping({
        clips: [],
        draggingClipIds: new Set(),
        playheadFrame: 50,
        pxPerFrame: 10,
      }),
    );
    const res = result.current.snap(50.6);
    expect(res.isSnapping).toBe(false);
  });
});
