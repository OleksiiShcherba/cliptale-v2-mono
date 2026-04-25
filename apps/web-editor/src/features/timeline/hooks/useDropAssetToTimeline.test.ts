import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

import type { Clip, ProjectDoc } from '@ai-video-editor/project-schema';

import { useDropAssetToTimeline } from './useDropAssetToTimeline';
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

const mockInvalidateQueries = vi.hoisted(() => vi.fn());
vi.mock('@tanstack/react-query', () => {
  const stableQueryClient = { invalidateQueries: mockInvalidateQueries };
  return { useQueryClient: () => stableQueryClient };
});

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

describe('useDropAssetToTimeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uuidState.count = 0;
    mockGetSnapshot.mockReturnValue(makeProject());
  });

  it('returns a stable callback function', () => {
    const { result, rerender } = renderHook(() => useDropAssetToTimeline('proj-001'));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it('adds a VideoClip to the project store when a video asset is dropped', () => {
    mockGetSnapshot.mockReturnValue(makeProject());
    const { result } = renderHook(() => useDropAssetToTimeline('proj-001'));

    result.current(makeAsset({ contentType: 'video/mp4' }), 'track-001', 0);

    expect(mockSetProject).toHaveBeenCalledOnce();
    const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
    expect(updated.clips).toHaveLength(1);
    expect(updated.clips[0]?.type).toBe('video');
    expect(updated.clips[0]?.trackId).toBe('track-001');
    expect(updated.clips[0]?.startFrame).toBe(0);
  });

  it('adds an AudioClip to the project store when an audio asset is dropped', () => {
    mockGetSnapshot.mockReturnValue(makeProject());
    const { result } = renderHook(() => useDropAssetToTimeline('proj-001'));

    result.current(makeAsset({ id: 'asset-audio', contentType: 'audio/mpeg' }), 'track-002', 10);

    expect(mockSetProject).toHaveBeenCalledOnce();
    const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
    expect(updated.clips[0]?.type).toBe('audio');
    expect(updated.clips[0]?.startFrame).toBe(10);
  });

  it('adds an ImageClip to the project store when an image asset is dropped', () => {
    mockGetSnapshot.mockReturnValue(makeProject());
    const { result } = renderHook(() => useDropAssetToTimeline('proj-001'));

    result.current(makeAsset({ id: 'asset-img', contentType: 'image/png', durationSeconds: null }), 'track-001', 30);

    expect(mockSetProject).toHaveBeenCalledOnce();
    const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
    expect(updated.clips[0]?.type).toBe('image');
    // image fallback = fps * 5 = 150 frames
    expect(updated.clips[0]?.durationFrames).toBe(150);
  });

  it('calls createClip with the correct projectId and clip after store update', () => {
    mockGetSnapshot.mockReturnValue(makeProject());
    const { result } = renderHook(() => useDropAssetToTimeline('proj-001'));

    result.current(makeAsset(), 'track-001', 0);

    expect(mockCreateClip).toHaveBeenCalledOnce();
    expect(mockCreateClip.mock.calls[0]![0]).toBe('proj-001');
    const clip = mockCreateClip.mock.calls[0]![1] as Clip;
    expect(clip.fileId).toBe('asset-001');
  });

  it('does NOT call setProject or createClip for an unsupported content type', () => {
    mockGetSnapshot.mockReturnValue(makeProject());
    const { result } = renderHook(() => useDropAssetToTimeline('proj-001'));

    result.current(makeAsset({ contentType: 'application/pdf' }), 'track-001', 0);

    expect(mockSetProject).not.toHaveBeenCalled();
    expect(mockCreateClip).not.toHaveBeenCalled();
  });

  it('uses project fps to compute clip durationFrames from asset durationSeconds', () => {
    mockGetSnapshot.mockReturnValue(makeProject({ fps: 24 }));
    const { result } = renderHook(() => useDropAssetToTimeline('proj-001'));

    result.current(makeAsset({ durationSeconds: 2 }), 'track-001', 0);

    const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
    // 2 seconds * 24 fps = 48 frames
    expect(updated.clips[0]?.durationFrames).toBe(48);
  });

  it('appends to existing clips rather than replacing them', () => {
    const existingClip = {
      id: 'existing-clip',
      type: 'video' as const,
      fileId: 'asset-000',
      trackId: 'track-001',
      startFrame: 0,
      durationFrames: 90,
      trimInFrame: 0,
      volume: 1,
      opacity: 1,
    } as unknown as Clip;
    mockGetSnapshot.mockReturnValue(makeProject({ clips: [existingClip] as Clip[] }));

    const { result } = renderHook(() => useDropAssetToTimeline('proj-001'));
    result.current(makeAsset(), 'track-001', 90);

    const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
    expect(updated.clips).toHaveLength(2);
    expect(updated.clips.find((c: Clip) => c.id === 'existing-clip')).toBeDefined();
  });

  it('calls linkFileToProject with projectId and asset id after a successful drop', () => {
    mockGetSnapshot.mockReturnValue(makeProject());
    const { result } = renderHook(() => useDropAssetToTimeline('proj-001'));

    result.current(makeAsset({ id: 'asset-link-test' }), 'track-001', 0);

    expect(mockLinkFileToProject).toHaveBeenCalledOnce();
    expect(mockLinkFileToProject.mock.calls[0]![0]).toBe('proj-001');
    expect(mockLinkFileToProject.mock.calls[0]![1]).toBe('asset-link-test');
  });

  it('invalidates the assets query after linkFileToProject resolves', async () => {
    // Regression: picking a file from Show All and dropping it must make it
    // appear in the project-scoped list without a manual refresh.
    mockGetSnapshot.mockReturnValue(makeProject());
    const { result } = renderHook(() => useDropAssetToTimeline('proj-001'));

    result.current(makeAsset({ id: 'asset-link-inval' }), 'track-001', 0);
    // linkFileToProject is fire-and-forget; await until the chained .then runs.
    await vi.waitFor(() =>
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ['assets', 'proj-001'],
      }),
    );
  });

  it('does NOT call linkFileToProject for unsupported content types', () => {
    mockGetSnapshot.mockReturnValue(makeProject());
    const { result } = renderHook(() => useDropAssetToTimeline('proj-001'));

    result.current(makeAsset({ contentType: 'application/pdf' }), 'track-001', 0);

    expect(mockLinkFileToProject).not.toHaveBeenCalled();
  });

  it('allows adding the same asset (same fileId) more than once to the same track', () => {
    const existingClip = {
      id: 'clip-first',
      type: 'video' as const,
      fileId: 'asset-001', // same fileId as the asset being dropped
      trackId: 'track-001',
      startFrame: 0,
      durationFrames: 150,
      trimInFrame: 0,
      volume: 1,
      opacity: 1,
    } as unknown as Clip;
    mockGetSnapshot.mockReturnValue(makeProject({ clips: [existingClip] as Clip[] }));

    const { result } = renderHook(() => useDropAssetToTimeline('proj-001'));
    result.current(makeAsset({ id: 'asset-001' }), 'track-001', 150);

    const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
    // Both clips should be present
    expect(updated.clips).toHaveLength(2);
    // Both reference the same fileId
    expect(updated.clips.filter((c: Clip) => (c as { fileId: string }).fileId === 'asset-001')).toHaveLength(2);
    // New clip has a different id
    const newClip = updated.clips.find((c: Clip) => c.id !== 'clip-first');
    expect(newClip).toBeDefined();
    expect(newClip?.startFrame).toBe(150);
  });
});
