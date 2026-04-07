import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { useVideoClipEditor } from './useVideoClipEditor.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetSnapshot = vi.fn();
const mockSetProject = vi.fn();

vi.mock('@/store/project-store.js', () => ({
  getSnapshot: () => mockGetSnapshot(),
  setProject: (doc: unknown) => mockSetProject(doc),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeVideoClip(overrides: Partial<{
  id: string;
  assetId: string;
  trackId: string;
  startFrame: number;
  durationFrames: number;
  trimInFrame: number;
  opacity: number;
  volume: number;
}> = {}) {
  return {
    id: 'clip-1',
    type: 'video' as const,
    assetId: 'asset-1',
    trackId: 'track-1',
    startFrame: 0,
    durationFrames: 150,
    trimInFrame: 0,
    opacity: 1,
    volume: 1,
    ...overrides,
  };
}

function makeProject(clip: ReturnType<typeof makeVideoClip>) {
  return {
    id: 'project-1',
    fps: 30,
    tracks: [],
    clips: [clip],
    durationFrames: 300,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useVideoClipEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('setStartFrame', () => {
    it('should update startFrame with a valid value', () => {
      const clip = makeVideoClip({ startFrame: 0 });
      mockGetSnapshot.mockReturnValue(makeProject(clip));

      const { result } = renderHook(() => useVideoClipEditor(clip));
      act(() => result.current.setStartFrame(60));

      expect(mockSetProject).toHaveBeenCalledWith(
        expect.objectContaining({
          clips: [expect.objectContaining({ id: 'clip-1', startFrame: 60 })],
        }),
      );
    });

    it('should clamp startFrame to 0 for negative values', () => {
      const clip = makeVideoClip({ startFrame: 10 });
      mockGetSnapshot.mockReturnValue(makeProject(clip));

      const { result } = renderHook(() => useVideoClipEditor(clip));
      act(() => result.current.setStartFrame(-5));

      expect(mockSetProject).toHaveBeenCalledWith(
        expect.objectContaining({
          clips: [expect.objectContaining({ startFrame: 0 })],
        }),
      );
    });

    it('should round float startFrame to nearest integer', () => {
      const clip = makeVideoClip({ startFrame: 0 });
      mockGetSnapshot.mockReturnValue(makeProject(clip));

      const { result } = renderHook(() => useVideoClipEditor(clip));
      act(() => result.current.setStartFrame(10.7));

      expect(mockSetProject).toHaveBeenCalledWith(
        expect.objectContaining({
          clips: [expect.objectContaining({ startFrame: 11 })],
        }),
      );
    });
  });

  describe('setEndFrame', () => {
    it('should compute durationFrames from end frame minus start frame', () => {
      const clip = makeVideoClip({ startFrame: 30, durationFrames: 60 });
      mockGetSnapshot.mockReturnValue(makeProject(clip));

      const { result } = renderHook(() => useVideoClipEditor(clip));
      // endFrame = 120, startFrame = 30, so durationFrames = 90
      act(() => result.current.setEndFrame(120));

      expect(mockSetProject).toHaveBeenCalledWith(
        expect.objectContaining({
          clips: [expect.objectContaining({ durationFrames: 90 })],
        }),
      );
    });

    it('should clamp durationFrames to minimum 1 when end frame equals start frame', () => {
      const clip = makeVideoClip({ startFrame: 30, durationFrames: 60 });
      mockGetSnapshot.mockReturnValue(makeProject(clip));

      const { result } = renderHook(() => useVideoClipEditor(clip));
      act(() => result.current.setEndFrame(30));

      expect(mockSetProject).toHaveBeenCalledWith(
        expect.objectContaining({
          clips: [expect.objectContaining({ durationFrames: 1 })],
        }),
      );
    });

    it('should round end frame to nearest integer before computing duration', () => {
      const clip = makeVideoClip({ startFrame: 30, durationFrames: 60 });
      mockGetSnapshot.mockReturnValue(makeProject(clip));

      const { result } = renderHook(() => useVideoClipEditor(clip));
      act(() => result.current.setEndFrame(90.7));

      expect(mockSetProject).toHaveBeenCalledWith(
        expect.objectContaining({
          clips: [expect.objectContaining({ durationFrames: 61 })],
        }),
      );
    });
  });

  describe('setTrimInSeconds', () => {
    it('should convert seconds to frames using project fps', () => {
      const clip = makeVideoClip({ trimInFrame: 0 });
      mockGetSnapshot.mockReturnValue(makeProject(clip));

      const { result } = renderHook(() => useVideoClipEditor(clip));
      act(() => result.current.setTrimInSeconds(2));

      expect(mockSetProject).toHaveBeenCalledWith(
        expect.objectContaining({
          clips: [expect.objectContaining({ trimInFrame: 60 })], // 2s × 30fps
        }),
      );
    });

    it('should clamp trimInFrame to 0 for negative seconds', () => {
      const clip = makeVideoClip({ trimInFrame: 30 });
      mockGetSnapshot.mockReturnValue(makeProject(clip));

      const { result } = renderHook(() => useVideoClipEditor(clip));
      act(() => result.current.setTrimInSeconds(-1));

      expect(mockSetProject).toHaveBeenCalledWith(
        expect.objectContaining({
          clips: [expect.objectContaining({ trimInFrame: 0 })],
        }),
      );
    });

    it('should round fractional seconds to nearest frame', () => {
      const clip = makeVideoClip({ trimInFrame: 0 });
      mockGetSnapshot.mockReturnValue(makeProject(clip));

      const { result } = renderHook(() => useVideoClipEditor(clip));
      // 1.5s × 30fps = 45 frames
      act(() => result.current.setTrimInSeconds(1.5));

      expect(mockSetProject).toHaveBeenCalledWith(
        expect.objectContaining({
          clips: [expect.objectContaining({ trimInFrame: 45 })],
        }),
      );
    });

    it('should use 30 fps fallback when project fps is 0', () => {
      const clip = makeVideoClip({ trimInFrame: 0 });
      mockGetSnapshot.mockReturnValue({ ...makeProject(clip), fps: 0 });

      const { result } = renderHook(() => useVideoClipEditor(clip));
      act(() => result.current.setTrimInSeconds(1));

      // 1s × 30fps fallback = 30 frames
      expect(mockSetProject).toHaveBeenCalledWith(
        expect.objectContaining({
          clips: [expect.objectContaining({ trimInFrame: 30 })],
        }),
      );
    });
  });

  describe('setOpacity', () => {
    it('should update opacity with a value in [0, 1]', () => {
      const clip = makeVideoClip({ opacity: 1 });
      mockGetSnapshot.mockReturnValue(makeProject(clip));

      const { result } = renderHook(() => useVideoClipEditor(clip));
      act(() => result.current.setOpacity(0.5));

      expect(mockSetProject).toHaveBeenCalledWith(
        expect.objectContaining({
          clips: [expect.objectContaining({ opacity: 0.5 })],
        }),
      );
    });

    it('should clamp opacity above 1 to 1', () => {
      const clip = makeVideoClip({ opacity: 1 });
      mockGetSnapshot.mockReturnValue(makeProject(clip));

      const { result } = renderHook(() => useVideoClipEditor(clip));
      act(() => result.current.setOpacity(2));

      expect(mockSetProject).toHaveBeenCalledWith(
        expect.objectContaining({
          clips: [expect.objectContaining({ opacity: 1 })],
        }),
      );
    });

    it('should clamp opacity below 0 to 0', () => {
      const clip = makeVideoClip({ opacity: 0.5 });
      mockGetSnapshot.mockReturnValue(makeProject(clip));

      const { result } = renderHook(() => useVideoClipEditor(clip));
      act(() => result.current.setOpacity(-0.2));

      expect(mockSetProject).toHaveBeenCalledWith(
        expect.objectContaining({
          clips: [expect.objectContaining({ opacity: 0 })],
        }),
      );
    });
  });

  describe('setVolume', () => {
    it('should update volume with a value in [0, 1]', () => {
      const clip = makeVideoClip({ volume: 1 });
      mockGetSnapshot.mockReturnValue(makeProject(clip));

      const { result } = renderHook(() => useVideoClipEditor(clip));
      act(() => result.current.setVolume(0.5));

      expect(mockSetProject).toHaveBeenCalledWith(
        expect.objectContaining({
          clips: [expect.objectContaining({ volume: 0.5 })],
        }),
      );
    });

    it('should clamp volume above 1 to 1', () => {
      const clip = makeVideoClip({ volume: 1 });
      mockGetSnapshot.mockReturnValue(makeProject(clip));

      const { result } = renderHook(() => useVideoClipEditor(clip));
      act(() => result.current.setVolume(1.5));

      expect(mockSetProject).toHaveBeenCalledWith(
        expect.objectContaining({
          clips: [expect.objectContaining({ volume: 1 })],
        }),
      );
    });

    it('should clamp volume below 0 to 0', () => {
      const clip = makeVideoClip({ volume: 0.5 });
      mockGetSnapshot.mockReturnValue(makeProject(clip));

      const { result } = renderHook(() => useVideoClipEditor(clip));
      act(() => result.current.setVolume(-0.1));

      expect(mockSetProject).toHaveBeenCalledWith(
        expect.objectContaining({
          clips: [expect.objectContaining({ volume: 0 })],
        }),
      );
    });

    it('should only patch the target clip, leaving other clips unchanged', () => {
      const clip = makeVideoClip({ id: 'clip-1', volume: 1 });
      const otherClip = { ...makeVideoClip({ id: 'clip-2', volume: 0.8 }), trackId: 'track-2' };
      mockGetSnapshot.mockReturnValue({ ...makeProject(clip), clips: [clip, otherClip] });

      const { result } = renderHook(() => useVideoClipEditor(clip));
      act(() => result.current.setVolume(0.3));

      const updatedClips = mockSetProject.mock.calls[0][0].clips as Array<{ id: string; volume: number }>;
      expect(updatedClips.find((c) => c.id === 'clip-1')?.volume).toBe(0.3);
      expect(updatedClips.find((c) => c.id === 'clip-2')?.volume).toBe(0.8);
    });
  });
});
