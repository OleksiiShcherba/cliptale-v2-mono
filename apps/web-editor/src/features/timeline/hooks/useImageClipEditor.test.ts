import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { useImageClipEditor } from './useImageClipEditor.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetSnapshot = vi.fn();
const mockSetProject = vi.fn();

vi.mock('@/store/project-store', () => ({
  getSnapshot: () => mockGetSnapshot(),
  setProject: (doc: unknown) => mockSetProject(doc),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeImageClip(overrides: Partial<{
  id: string;
  assetId: string;
  trackId: string;
  startFrame: number;
  durationFrames: number;
  opacity: number;
}> = {}) {
  return {
    id: 'clip-1',
    type: 'image' as const,
    assetId: 'asset-1',
    trackId: 'track-1',
    startFrame: 0,
    durationFrames: 150,
    opacity: 1,
    ...overrides,
  };
}

function makeProjectWithClip(clip: ReturnType<typeof makeImageClip>) {
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

describe('useImageClipEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('setStartFrame', () => {
    it('should update startFrame when called with a valid value', () => {
      const clip = makeImageClip({ startFrame: 0 });
      const project = makeProjectWithClip(clip);
      mockGetSnapshot.mockReturnValue(project);

      const { result } = renderHook(() => useImageClipEditor(clip));
      act(() => result.current.setStartFrame(30));

      expect(mockSetProject).toHaveBeenCalledWith(
        expect.objectContaining({
          clips: [expect.objectContaining({ id: 'clip-1', startFrame: 30 })],
        }),
      );
    });

    it('should clamp startFrame to 0 for negative values', () => {
      const clip = makeImageClip({ startFrame: 10 });
      const project = makeProjectWithClip(clip);
      mockGetSnapshot.mockReturnValue(project);

      const { result } = renderHook(() => useImageClipEditor(clip));
      act(() => result.current.setStartFrame(-5));

      expect(mockSetProject).toHaveBeenCalledWith(
        expect.objectContaining({
          clips: [expect.objectContaining({ startFrame: 0 })],
        }),
      );
    });

    it('should round float startFrame to nearest integer', () => {
      const clip = makeImageClip({ startFrame: 0 });
      const project = makeProjectWithClip(clip);
      mockGetSnapshot.mockReturnValue(project);

      const { result } = renderHook(() => useImageClipEditor(clip));
      act(() => result.current.setStartFrame(10.7));

      expect(mockSetProject).toHaveBeenCalledWith(
        expect.objectContaining({
          clips: [expect.objectContaining({ startFrame: 11 })],
        }),
      );
    });
  });

  describe('setDurationFrames', () => {
    it('should update durationFrames when called with a valid value', () => {
      const clip = makeImageClip({ durationFrames: 150 });
      const project = makeProjectWithClip(clip);
      mockGetSnapshot.mockReturnValue(project);

      const { result } = renderHook(() => useImageClipEditor(clip));
      act(() => result.current.setDurationFrames(300));

      expect(mockSetProject).toHaveBeenCalledWith(
        expect.objectContaining({
          clips: [expect.objectContaining({ durationFrames: 300 })],
        }),
      );
    });

    it('should clamp durationFrames to minimum 1 frame', () => {
      const clip = makeImageClip({ durationFrames: 150 });
      const project = makeProjectWithClip(clip);
      mockGetSnapshot.mockReturnValue(project);

      const { result } = renderHook(() => useImageClipEditor(clip));
      act(() => result.current.setDurationFrames(0));

      expect(mockSetProject).toHaveBeenCalledWith(
        expect.objectContaining({
          clips: [expect.objectContaining({ durationFrames: 1 })],
        }),
      );
    });

    it('should clamp negative durationFrames to 1', () => {
      const clip = makeImageClip({ durationFrames: 150 });
      const project = makeProjectWithClip(clip);
      mockGetSnapshot.mockReturnValue(project);

      const { result } = renderHook(() => useImageClipEditor(clip));
      act(() => result.current.setDurationFrames(-10));

      expect(mockSetProject).toHaveBeenCalledWith(
        expect.objectContaining({
          clips: [expect.objectContaining({ durationFrames: 1 })],
        }),
      );
    });

    it('should round float durationFrames to nearest integer', () => {
      const clip = makeImageClip({ durationFrames: 150 });
      const project = makeProjectWithClip(clip);
      mockGetSnapshot.mockReturnValue(project);

      const { result } = renderHook(() => useImageClipEditor(clip));
      act(() => result.current.setDurationFrames(90.4));

      expect(mockSetProject).toHaveBeenCalledWith(
        expect.objectContaining({
          clips: [expect.objectContaining({ durationFrames: 90 })],
        }),
      );
    });
  });

  describe('setOpacity', () => {
    it('should update opacity when called with a value in [0, 1]', () => {
      const clip = makeImageClip({ opacity: 1 });
      const project = makeProjectWithClip(clip);
      mockGetSnapshot.mockReturnValue(project);

      const { result } = renderHook(() => useImageClipEditor(clip));
      act(() => result.current.setOpacity(0.5));

      expect(mockSetProject).toHaveBeenCalledWith(
        expect.objectContaining({
          clips: [expect.objectContaining({ opacity: 0.5 })],
        }),
      );
    });

    it('should clamp opacity above 1 to 1', () => {
      const clip = makeImageClip({ opacity: 0.5 });
      const project = makeProjectWithClip(clip);
      mockGetSnapshot.mockReturnValue(project);

      const { result } = renderHook(() => useImageClipEditor(clip));
      act(() => result.current.setOpacity(1.5));

      expect(mockSetProject).toHaveBeenCalledWith(
        expect.objectContaining({
          clips: [expect.objectContaining({ opacity: 1 })],
        }),
      );
    });

    it('should clamp opacity below 0 to 0', () => {
      const clip = makeImageClip({ opacity: 0.5 });
      const project = makeProjectWithClip(clip);
      mockGetSnapshot.mockReturnValue(project);

      const { result } = renderHook(() => useImageClipEditor(clip));
      act(() => result.current.setOpacity(-0.2));

      expect(mockSetProject).toHaveBeenCalledWith(
        expect.objectContaining({
          clips: [expect.objectContaining({ opacity: 0 })],
        }),
      );
    });

    it('should only patch the target clip, leaving other clips unchanged', () => {
      const clip = makeImageClip({ id: 'clip-1', opacity: 1 });
      const otherClip = { ...makeImageClip({ id: 'clip-2', opacity: 0.8 }), trackId: 'track-2' };
      const project = {
        ...makeProjectWithClip(clip),
        clips: [clip, otherClip],
      };
      mockGetSnapshot.mockReturnValue(project);

      const { result } = renderHook(() => useImageClipEditor(clip));
      act(() => result.current.setOpacity(0.3));

      const updatedClips = mockSetProject.mock.calls[0][0].clips as Array<{ id: string; opacity: number }>;
      const updated = updatedClips.find((c) => c.id === 'clip-1');
      const untouched = updatedClips.find((c) => c.id === 'clip-2');
      expect(updated?.opacity).toBe(0.3);
      expect(untouched?.opacity).toBe(0.8);
    });
  });
});
