import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { Clip, ProjectDoc, Track } from '@ai-video-editor/project-schema';

import { useAddAssetToTimeline } from './useAddAssetToTimeline';
import { TEST_PROJECT_ID, makeProject, makeAsset } from './useAddAssetToTimeline.fixtures';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/store/project-store', () => ({
  getSnapshot: vi.fn(),
  setProject: vi.fn(),
}));

vi.mock('@/features/timeline/api', () => ({
  createClip: vi.fn().mockResolvedValue(undefined),
  linkFileToProject: vi.fn().mockResolvedValue(undefined),
}));

// Mock useQueryClient so the hook can be rendered outside a QueryClientProvider.
const { mockInvalidateQueries } = vi.hoisted(() => ({
  mockInvalidateQueries: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: vi.fn(() => ({ invalidateQueries: mockInvalidateQueries })),
}));

// vi.hoisted ensures the mutable counter is available inside the vi.mock factory,
// which is hoisted above variable declarations — plain `let` would be TDZ at hoist time.
const uuidState = vi.hoisted(() => ({ count: 0 }));
vi.mock('crypto', () => ({
  randomUUID: vi.fn(() => `uuid-${++uuidState.count}`),
}));

import * as projectStore from '@/store/project-store';
import * as timelineApi from '@/features/timeline/api';

const mockGetSnapshot = vi.mocked(projectStore.getSnapshot);
const mockSetProject = vi.mocked(projectStore.setProject);
const mockCreateClip = vi.mocked(timelineApi.createClip);
const mockLinkFileToProject = vi.mocked(timelineApi.linkFileToProject);

// ── Tests: addAssetToNewTrack ─────────────────────────────────────────────────

describe('useAddAssetToTimeline / addAssetToNewTrack', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLinkFileToProject.mockResolvedValue(undefined);
    uuidState.count = 0;
  });

  it('creates a video track and VideoClip for a video/* asset', () => {
    mockGetSnapshot.mockReturnValue(makeProject());

    const { result } = renderHook(() => useAddAssetToTimeline(TEST_PROJECT_ID));
    act(() => result.current.addAssetToNewTrack(makeAsset({ contentType: 'video/mp4', durationSeconds: 10 })));

    const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
    expect(updated.tracks).toHaveLength(1);
    expect(updated.tracks[0]!.type).toBe('video');
    expect(updated.tracks[0]!.name).toBe('test'); // filename 'test.mp4' → 'test'
    expect(updated.clips).toHaveLength(1);
    expect(updated.clips[0]!.type).toBe('video');
    expect(updated.clips[0]!.durationFrames).toBe(300); // 10s * 30fps
    expect(updated.clips[0]!.startFrame).toBe(0);
    expect(updated.clips[0]!.fileId).toBe('asset-001');
    expect(updated.clips[0]!.trackId).toBe(updated.tracks[0]!.id);
  });

  it('always creates a new track even when a same-named track already exists', () => {
    const existingTrack: Track = {
      id: 'existing-track-id',
      type: 'video',
      name: 'test',
      muted: false,
      locked: false,
    };
    mockGetSnapshot.mockReturnValue(makeProject({ tracks: [existingTrack] }));

    const { result } = renderHook(() => useAddAssetToTimeline(TEST_PROJECT_ID));
    act(() => result.current.addAssetToNewTrack(makeAsset({ contentType: 'video/mp4' })));

    const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
    // New track created in addition to the existing one
    expect(updated.tracks).toHaveLength(2);
  });

  it('places the new clip at frame 0 regardless of existing clips on other tracks', () => {
    mockGetSnapshot.mockReturnValue(makeProject());

    const { result } = renderHook(() => useAddAssetToTimeline(TEST_PROJECT_ID));
    act(() => result.current.addAssetToNewTrack(makeAsset({ contentType: 'video/mp4', durationSeconds: 5 })));

    const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
    expect(updated.clips[0]!.startFrame).toBe(0);
  });

  it('calls createClip with projectId and the new clip', () => {
    mockGetSnapshot.mockReturnValue(makeProject());

    const { result } = renderHook(() => useAddAssetToTimeline(TEST_PROJECT_ID));
    act(() => result.current.addAssetToNewTrack(makeAsset({ contentType: 'video/mp4', durationSeconds: 10 })));

    expect(mockCreateClip).toHaveBeenCalledTimes(1);
    const [calledProjectId, calledClip] = mockCreateClip.mock.calls[0]!;
    expect(calledProjectId).toBe(TEST_PROJECT_ID);
    expect(calledClip.type).toBe('video');
  });

  it('creates an audio track and AudioClip for an audio/* asset', () => {
    mockGetSnapshot.mockReturnValue(makeProject());

    const { result } = renderHook(() => useAddAssetToTimeline(TEST_PROJECT_ID));
    act(() => result.current.addAssetToNewTrack(makeAsset({ contentType: 'audio/mpeg', durationSeconds: 5 })));

    const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
    expect(updated.tracks[0]!.type).toBe('audio');
    expect(updated.clips[0]!.type).toBe('audio');
    expect(updated.clips[0]!.durationFrames).toBe(150); // 5s * 30fps
  });

  it('creates a video track and ImageClip for an image/* asset', () => {
    mockGetSnapshot.mockReturnValue(makeProject());

    const { result } = renderHook(() => useAddAssetToTimeline(TEST_PROJECT_ID));
    act(() => result.current.addAssetToNewTrack(makeAsset({ contentType: 'image/png', durationSeconds: null })));

    const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
    expect(updated.tracks[0]!.type).toBe('video');
    expect(updated.clips[0]!.type).toBe('image');
    expect(updated.clips[0]!.durationFrames).toBe(150); // fallback: fps * 5
  });

  it('silently no-ops for unsupported content types', () => {
    mockGetSnapshot.mockReturnValue(makeProject());

    const { result } = renderHook(() => useAddAssetToTimeline(TEST_PROJECT_ID));
    act(() => result.current.addAssetToNewTrack(makeAsset({ contentType: 'application/pdf' })));

    expect(mockSetProject).not.toHaveBeenCalled();
    expect(mockCreateClip).not.toHaveBeenCalled();
  });

  it('sets correct default fields on VideoClip (trimInFrame, opacity, volume)', () => {
    mockGetSnapshot.mockReturnValue(makeProject());

    const { result } = renderHook(() => useAddAssetToTimeline(TEST_PROJECT_ID));
    act(() => result.current.addAssetToNewTrack(makeAsset({ contentType: 'video/mp4', durationSeconds: 5 })));

    const clip = (mockSetProject.mock.calls[0]![0] as ProjectDoc).clips[0] as Record<string, unknown>;
    expect(clip['trimInFrame']).toBe(0);
    expect(clip['opacity']).toBe(1);
    expect(clip['volume']).toBe(1);
  });
});

// ── Tests: addAssetToExistingTrack ────────────────────────────────────────────

describe('useAddAssetToTimeline / addAssetToExistingTrack', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLinkFileToProject.mockResolvedValue(undefined);
    uuidState.count = 0;
  });

  it('appends a clip to the specified existing track without creating a new track', () => {
    const existingTrack: Track = { id: 'track-001', type: 'video', name: 'Main Video', muted: false, locked: false };
    mockGetSnapshot.mockReturnValue(makeProject({ tracks: [existingTrack] }));

    const { result } = renderHook(() => useAddAssetToTimeline(TEST_PROJECT_ID));
    act(() => result.current.addAssetToExistingTrack(makeAsset({ contentType: 'video/mp4', durationSeconds: 5 }), 'track-001'));

    const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
    // No new track — only the existing one
    expect(updated.tracks).toHaveLength(1);
    expect(updated.tracks[0]!.id).toBe('track-001');
    expect(updated.clips).toHaveLength(1);
    expect(updated.clips[0]!.trackId).toBe('track-001');
  });

  it('places the clip at the end of existing clips on the target track', () => {
    const trackId = 'track-001';
    const existingTrack: Track = { id: trackId, type: 'video', name: 'Main', muted: false, locked: false };
    const existingClip: Clip = {
      id: 'clip-existing', type: 'video', fileId: 'a1', trackId,
      startFrame: 0, durationFrames: 120, trimInFrame: 0, opacity: 1, volume: 1,
    };
    mockGetSnapshot.mockReturnValue(makeProject({ tracks: [existingTrack], clips: [existingClip] }));

    const { result } = renderHook(() => useAddAssetToTimeline(TEST_PROJECT_ID));
    act(() => result.current.addAssetToExistingTrack(makeAsset({ contentType: 'video/mp4', durationSeconds: 5 }), trackId));

    const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
    expect(updated.clips).toHaveLength(2);
    expect(updated.clips[1]!.startFrame).toBe(120);
  });

  it('uses the max end-frame across multiple clips, not the last clip', () => {
    const trackId = 'track-001';
    const track: Track = { id: trackId, type: 'video', name: 'Main', muted: false, locked: false };
    const clips: Clip[] = [
      { id: 'a', type: 'video', fileId: 'a1', trackId, startFrame: 0, durationFrames: 200, trimInFrame: 0, opacity: 1, volume: 1 },
      { id: 'b', type: 'video', fileId: 'a2', trackId, startFrame: 50, durationFrames: 100, trimInFrame: 0, opacity: 1, volume: 1 },
    ];
    mockGetSnapshot.mockReturnValue(makeProject({ tracks: [track], clips }));

    const { result } = renderHook(() => useAddAssetToTimeline(TEST_PROJECT_ID));
    act(() => result.current.addAssetToExistingTrack(makeAsset({ contentType: 'video/mp4', durationSeconds: 2 }), trackId));

    const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
    expect(updated.clips[2]!.startFrame).toBe(200);
  });

  it('ignores clips on other tracks when computing startFrame', () => {
    const videoTrackId = 'video-track-id';
    const audioTrackId = 'audio-track-id';
    const videoTrack: Track = { id: videoTrackId, type: 'video', name: 'Main', muted: false, locked: false };
    const audioTrack: Track = { id: audioTrackId, type: 'audio', name: 'Audio', muted: false, locked: false };
    const audioClipLong: Clip = {
      id: 'clip-audio', type: 'audio', fileId: 'a1', trackId: audioTrackId,
      startFrame: 0, durationFrames: 900, trimInFrame: 0, volume: 1,
    };
    mockGetSnapshot.mockReturnValue(makeProject({ tracks: [videoTrack, audioTrack], clips: [audioClipLong] }));

    const { result } = renderHook(() => useAddAssetToTimeline(TEST_PROJECT_ID));
    act(() => result.current.addAssetToExistingTrack(makeAsset({ contentType: 'video/mp4', durationSeconds: 2 }), videoTrackId));

    const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
    const newClip = updated.clips.find(c => c.trackId === videoTrackId);
    expect(newClip!.startFrame).toBe(0); // no clips on video track
  });

  it('silently no-ops when the trackId does not match any existing track', () => {
    mockGetSnapshot.mockReturnValue(makeProject());

    const { result } = renderHook(() => useAddAssetToTimeline(TEST_PROJECT_ID));
    act(() => result.current.addAssetToExistingTrack(makeAsset({ contentType: 'video/mp4' }), 'nonexistent-track'));

    expect(mockSetProject).not.toHaveBeenCalled();
  });

  it('silently no-ops for unsupported content types', () => {
    const existingTrack: Track = { id: 'track-001', type: 'video', name: 'Main', muted: false, locked: false };
    mockGetSnapshot.mockReturnValue(makeProject({ tracks: [existingTrack] }));

    const { result } = renderHook(() => useAddAssetToTimeline(TEST_PROJECT_ID));
    act(() => result.current.addAssetToExistingTrack(makeAsset({ contentType: 'application/pdf' }), 'track-001'));

    expect(mockSetProject).not.toHaveBeenCalled();
  });

  it('calls createClip with projectId and the new clip', () => {
    const existingTrack: Track = { id: 'track-001', type: 'video', name: 'Main', muted: false, locked: false };
    mockGetSnapshot.mockReturnValue(makeProject({ tracks: [existingTrack] }));

    const { result } = renderHook(() => useAddAssetToTimeline(TEST_PROJECT_ID));
    act(() => result.current.addAssetToExistingTrack(makeAsset({ contentType: 'video/mp4', durationSeconds: 5 }), 'track-001'));

    expect(mockCreateClip).toHaveBeenCalledTimes(1);
    const [calledProjectId] = mockCreateClip.mock.calls[0]!;
    expect(calledProjectId).toBe(TEST_PROJECT_ID);
  });
});
