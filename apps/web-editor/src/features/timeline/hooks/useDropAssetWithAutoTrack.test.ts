import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

import type { ProjectDoc, Track } from '@ai-video-editor/project-schema';

import { useDropAssetWithAutoTrack } from './useDropAssetToTimeline';
import { makeProject, makeAsset } from './useDropAssetToTimeline.fixtures';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/store/project-store', () => ({
  getSnapshot: vi.fn(),
  setProject: vi.fn(),
}));

vi.mock('@/features/timeline/api', () => ({
  createClip: vi.fn().mockResolvedValue(undefined),
  patchClip: vi.fn().mockResolvedValue(undefined),
  linkFileToProject: vi.fn().mockResolvedValue(undefined),
}));

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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useDropAssetWithAutoTrack', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uuidState.count = 0;
    mockGetSnapshot.mockReturnValue(makeProject());
  });

  it('returns a stable callback function', () => {
    const { result, rerender } = renderHook(() => useDropAssetWithAutoTrack('proj-001'));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it('creates a new track and clip when the timeline has no tracks', () => {
    mockGetSnapshot.mockReturnValue(makeProject({ tracks: [], clips: [] }));
    const { result } = renderHook(() => useDropAssetWithAutoTrack('proj-001'));

    result.current(makeAsset({ filename: 'my-video.mp4', contentType: 'video/mp4' }), 0);

    expect(mockSetProject).toHaveBeenCalledOnce();
    const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
    expect(updated.tracks).toHaveLength(1);
    expect(updated.tracks[0]?.type).toBe('video');
    expect(updated.tracks[0]?.name).toBe('my-video');
    expect(updated.clips).toHaveLength(1);
    expect(updated.clips[0]?.startFrame).toBe(0);
    expect(updated.clips[0]?.trackId).toBe(updated.tracks[0]?.id);
  });

  it('reuses an existing track with the same name', () => {
    const existingTrack: Track = {
      id: 'track-existing',
      type: 'video',
      name: 'my-video',
      muted: false,
      locked: false,
    };
    mockGetSnapshot.mockReturnValue(makeProject({ tracks: [existingTrack], clips: [] }));
    const { result } = renderHook(() => useDropAssetWithAutoTrack('proj-001'));

    result.current(makeAsset({ filename: 'my-video.mp4', contentType: 'video/mp4' }), 0);

    const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
    expect(updated.tracks).toHaveLength(1);
    expect(updated.tracks[0]?.id).toBe('track-existing');
  });

  it('creates an audio track for audio assets', () => {
    mockGetSnapshot.mockReturnValue(makeProject({ tracks: [], clips: [] }));
    const { result } = renderHook(() => useDropAssetWithAutoTrack('proj-001'));

    result.current(makeAsset({ filename: 'narration.mp3', contentType: 'audio/mpeg' }), 0);

    const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
    expect(updated.tracks[0]?.type).toBe('audio');
    expect(updated.tracks[0]?.name).toBe('narration');
    expect(updated.clips[0]?.type).toBe('audio');
  });

  it('creates a video track for image assets', () => {
    mockGetSnapshot.mockReturnValue(makeProject({ tracks: [], clips: [] }));
    const { result } = renderHook(() => useDropAssetWithAutoTrack('proj-001'));

    result.current(makeAsset({ filename: 'photo.png', contentType: 'image/png', durationSeconds: null }), 0);

    const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
    expect(updated.tracks[0]?.type).toBe('video');
    expect(updated.clips[0]?.type).toBe('image');
  });

  it('does not call setProject for unsupported content types', () => {
    mockGetSnapshot.mockReturnValue(makeProject());
    const { result } = renderHook(() => useDropAssetWithAutoTrack('proj-001'));

    result.current(makeAsset({ contentType: 'application/pdf' }), 0);

    expect(mockSetProject).not.toHaveBeenCalled();
    expect(mockCreateClip).not.toHaveBeenCalled();
  });

  it('calls createClip with the project ID after store update', () => {
    mockGetSnapshot.mockReturnValue(makeProject({ tracks: [], clips: [] }));
    const { result } = renderHook(() => useDropAssetWithAutoTrack('proj-001'));

    result.current(makeAsset(), 0);

    expect(mockCreateClip).toHaveBeenCalledOnce();
    expect(mockCreateClip.mock.calls[0]![0]).toBe('proj-001');
  });

  it('places the clip at the given startFrame', () => {
    mockGetSnapshot.mockReturnValue(makeProject({ tracks: [], clips: [] }));
    const { result } = renderHook(() => useDropAssetWithAutoTrack('proj-001'));

    result.current(makeAsset(), 60);

    const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
    expect(updated.clips[0]?.startFrame).toBe(60);
  });

  it('calls linkFileToProject with projectId and asset id after a successful drop', () => {
    mockGetSnapshot.mockReturnValue(makeProject({ tracks: [], clips: [] }));
    const { result } = renderHook(() => useDropAssetWithAutoTrack('proj-001'));

    result.current(makeAsset({ id: 'asset-auto-link' }), 0);

    expect(mockLinkFileToProject).toHaveBeenCalledOnce();
    expect(mockLinkFileToProject.mock.calls[0]![0]).toBe('proj-001');
    expect(mockLinkFileToProject.mock.calls[0]![1]).toBe('asset-auto-link');
  });

  it('does NOT call linkFileToProject for unsupported content types', () => {
    mockGetSnapshot.mockReturnValue(makeProject());
    const { result } = renderHook(() => useDropAssetWithAutoTrack('proj-001'));

    result.current(makeAsset({ contentType: 'application/pdf' }), 0);

    expect(mockLinkFileToProject).not.toHaveBeenCalled();
  });
});
