import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useAddEmptyTrack, TRACK_TYPE_LABELS } from './useAddEmptyTrack';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockProject = {
  schemaVersion: 1,
  id: 'project-1',
  title: 'Test Project',
  fps: 30,
  durationFrames: 300,
  width: 1920,
  height: 1080,
  tracks: [],
  clips: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockSetProject = vi.fn();
const mockGetSnapshot = vi.fn(() => ({ ...mockProject }));

vi.mock('@/store/project-store', () => ({
  getSnapshot: () => mockGetSnapshot(),
  setProject: (doc: unknown) => mockSetProject(doc),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useAddEmptyTrack', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSnapshot.mockReturnValue({ ...mockProject, tracks: [], clips: [] });
  });

  it('should return a callable function', () => {
    const { result } = renderHook(() => useAddEmptyTrack());
    expect(typeof result.current).toBe('function');
  });

  it('should create a video track when type is "video"', () => {
    const { result } = renderHook(() => useAddEmptyTrack());
    act(() => {
      result.current('video');
    });
    expect(mockSetProject).toHaveBeenCalledOnce();
    const updatedProject = mockSetProject.mock.calls[0][0];
    expect(updatedProject.tracks).toHaveLength(1);
    expect(updatedProject.tracks[0]).toMatchObject({
      type: 'video',
      name: 'Video 1',
      muted: false,
      locked: false,
    });
  });

  it('should create an audio track when type is "audio"', () => {
    const { result } = renderHook(() => useAddEmptyTrack());
    act(() => {
      result.current('audio');
    });
    const updatedProject = mockSetProject.mock.calls[0][0];
    expect(updatedProject.tracks[0]).toMatchObject({ type: 'audio', name: 'Audio 1' });
  });

  it('should create a caption track when type is "caption"', () => {
    const { result } = renderHook(() => useAddEmptyTrack());
    act(() => {
      result.current('caption');
    });
    const updatedProject = mockSetProject.mock.calls[0][0];
    expect(updatedProject.tracks[0]).toMatchObject({ type: 'caption', name: 'Caption 1' });
  });

  it('should create an overlay track when type is "overlay"', () => {
    const { result } = renderHook(() => useAddEmptyTrack());
    act(() => {
      result.current('overlay');
    });
    const updatedProject = mockSetProject.mock.calls[0][0];
    expect(updatedProject.tracks[0]).toMatchObject({ type: 'overlay', name: 'Overlay 1' });
  });

  it('should increment track number when a track of the same type already exists', () => {
    mockGetSnapshot.mockReturnValue({
      ...mockProject,
      tracks: [{ id: 'track-1', type: 'video', name: 'Video 1', muted: false, locked: false }],
      clips: [],
    });
    const { result } = renderHook(() => useAddEmptyTrack());
    act(() => {
      result.current('video');
    });
    const updatedProject = mockSetProject.mock.calls[0][0];
    expect(updatedProject.tracks).toHaveLength(2);
    expect(updatedProject.tracks[1]).toMatchObject({ type: 'video', name: 'Video 2' });
  });

  it('should not increment number for different track types', () => {
    mockGetSnapshot.mockReturnValue({
      ...mockProject,
      tracks: [{ id: 'track-1', type: 'video', name: 'Video 1', muted: false, locked: false }],
      clips: [],
    });
    const { result } = renderHook(() => useAddEmptyTrack());
    act(() => {
      result.current('audio');
    });
    const updatedProject = mockSetProject.mock.calls[0][0];
    expect(updatedProject.tracks[1]).toMatchObject({ type: 'audio', name: 'Audio 1' });
  });

  it('should assign a UUID to the new track', () => {
    const { result } = renderHook(() => useAddEmptyTrack());
    act(() => {
      result.current('video');
    });
    const updatedProject = mockSetProject.mock.calls[0][0];
    expect(updatedProject.tracks[0].id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('should preserve existing tracks when adding a new one', () => {
    mockGetSnapshot.mockReturnValue({
      ...mockProject,
      tracks: [{ id: 'track-1', type: 'audio', name: 'Audio 1', muted: false, locked: false }],
      clips: [],
    });
    const { result } = renderHook(() => useAddEmptyTrack());
    act(() => {
      result.current('video');
    });
    const updatedProject = mockSetProject.mock.calls[0][0];
    expect(updatedProject.tracks).toHaveLength(2);
    expect(updatedProject.tracks[0].id).toBe('track-1');
  });

  it('should preserve existing clips when adding a track', () => {
    const existingClip = { id: 'clip-1', type: 'audio', fileId: 'a1', trackId: 't1', startFrame: 0, durationFrames: 60 };
    mockGetSnapshot.mockReturnValue({
      ...mockProject,
      tracks: [],
      clips: [existingClip],
    });
    const { result } = renderHook(() => useAddEmptyTrack());
    act(() => {
      result.current('video');
    });
    const updatedProject = mockSetProject.mock.calls[0][0];
    expect(updatedProject.clips).toHaveLength(1);
    expect(updatedProject.clips[0].id).toBe('clip-1');
  });
});

describe('TRACK_TYPE_LABELS', () => {
  it('should have labels for all four track types', () => {
    expect(TRACK_TYPE_LABELS).toMatchObject({
      video: 'Video',
      audio: 'Audio',
      caption: 'Caption',
      overlay: 'Overlay',
    });
  });
});
