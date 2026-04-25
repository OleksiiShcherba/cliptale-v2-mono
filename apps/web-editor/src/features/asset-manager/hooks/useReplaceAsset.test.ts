import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { getSnapshot, setProject } from '@/store/project-store';

import { useReplaceAsset } from './useReplaceAsset';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/store/project-store', () => ({
  getSnapshot: vi.fn(),
  setProject: vi.fn(),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeProject(clips: object[]) {
  return {
    schemaVersion: 1,
    id: 'proj-001',
    title: 'Test',
    fps: 30,
    durationFrames: 300,
    width: 1920,
    height: 1080,
    tracks: [],
    clips,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useReplaceAsset', () => {
  const mockGetSnapshot = vi.mocked(getSnapshot);
  const mockSetProject = vi.mocked(setProject);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return a function', () => {
    const { result } = renderHook(() => useReplaceAsset());
    expect(typeof result.current).toBe('function');
  });

  it('should update clips with old fileId to use the new fileId', () => {
    const clips = [
      { id: 'clip-1', type: 'video', fileId: 'asset-old', trackId: 't1', startFrame: 0, durationFrames: 90, trimInFrame: 0, opacity: 1, volume: 1 },
      { id: 'clip-2', type: 'video', fileId: 'asset-other', trackId: 't1', startFrame: 90, durationFrames: 60, trimInFrame: 0, opacity: 1, volume: 1 },
    ];
    const project = makeProject(clips);
    mockGetSnapshot.mockReturnValue(project as ReturnType<typeof getSnapshot>);

    const { result } = renderHook(() => useReplaceAsset());
    result.current('asset-old', 'asset-new');

    expect(mockSetProject).toHaveBeenCalledOnce();
    const updated = mockSetProject.mock.calls[0][0];
    expect(updated.clips[0].fileId).toBe('asset-new');
    expect(updated.clips[1].fileId).toBe('asset-other'); // untouched
  });

  it('should update multiple clips that share the same old fileId', () => {
    const clips = [
      { id: 'clip-1', type: 'video', fileId: 'asset-old', trackId: 't1', startFrame: 0, durationFrames: 60, trimInFrame: 0, opacity: 1, volume: 1 },
      { id: 'clip-2', type: 'video', fileId: 'asset-old', trackId: 't2', startFrame: 0, durationFrames: 60, trimInFrame: 0, opacity: 1, volume: 1 },
    ];
    const project = makeProject(clips);
    mockGetSnapshot.mockReturnValue(project as ReturnType<typeof getSnapshot>);

    const { result } = renderHook(() => useReplaceAsset());
    result.current('asset-old', 'asset-new');

    const updated = mockSetProject.mock.calls[0][0];
    expect(updated.clips[0].fileId).toBe('asset-new');
    expect(updated.clips[1].fileId).toBe('asset-new');
  });

  it('should not call setProject when oldAssetId equals newAssetId', () => {
    const project = makeProject([]);
    mockGetSnapshot.mockReturnValue(project as ReturnType<typeof getSnapshot>);

    const { result } = renderHook(() => useReplaceAsset());
    result.current('asset-001', 'asset-001');

    expect(mockSetProject).not.toHaveBeenCalled();
  });

  it('should not modify clips that have no fileId (text overlay clips)', () => {
    const clips = [
      // TextOverlayClip has no fileId
      { id: 'clip-text', type: 'textOverlay', trackId: 't1', startFrame: 0, durationFrames: 30, text: 'Hello' },
      { id: 'clip-video', type: 'video', fileId: 'asset-old', trackId: 't2', startFrame: 0, durationFrames: 30, trimInFrame: 0, opacity: 1, volume: 1 },
    ];
    const project = makeProject(clips);
    mockGetSnapshot.mockReturnValue(project as ReturnType<typeof getSnapshot>);

    const { result } = renderHook(() => useReplaceAsset());
    result.current('asset-old', 'asset-new');

    const updated = mockSetProject.mock.calls[0][0];
    // Text overlay clip unchanged
    expect(updated.clips[0]).toEqual(clips[0]);
    // Video clip updated
    expect(updated.clips[1].fileId).toBe('asset-new');
  });

  it('should handle audio clips as well as video clips', () => {
    const clips = [
      { id: 'clip-a', type: 'audio', fileId: 'asset-old', trackId: 't1', startFrame: 0, durationFrames: 120, trimInFrame: 0, volume: 0.8 },
    ];
    const project = makeProject(clips);
    mockGetSnapshot.mockReturnValue(project as ReturnType<typeof getSnapshot>);

    const { result } = renderHook(() => useReplaceAsset());
    result.current('asset-old', 'asset-new');

    const updated = mockSetProject.mock.calls[0][0];
    expect(updated.clips[0].fileId).toBe('asset-new');
  });

  it('should handle image clips', () => {
    const clips = [
      { id: 'clip-i', type: 'image', fileId: 'asset-old', trackId: 't1', startFrame: 0, durationFrames: 150, opacity: 0.9 },
    ];
    const project = makeProject(clips);
    mockGetSnapshot.mockReturnValue(project as ReturnType<typeof getSnapshot>);

    const { result } = renderHook(() => useReplaceAsset());
    result.current('asset-old', 'asset-new');

    const updated = mockSetProject.mock.calls[0][0];
    expect(updated.clips[0].fileId).toBe('asset-new');
  });

  it('should call setProject with all other project fields intact', () => {
    const clips = [
      { id: 'clip-1', type: 'video', fileId: 'asset-old', trackId: 't1', startFrame: 0, durationFrames: 30, trimInFrame: 0, opacity: 1, volume: 1 },
    ];
    const project = makeProject(clips);
    mockGetSnapshot.mockReturnValue(project as ReturnType<typeof getSnapshot>);

    const { result } = renderHook(() => useReplaceAsset());
    result.current('asset-old', 'asset-new');

    const updated = mockSetProject.mock.calls[0][0];
    expect(updated.id).toBe('proj-001');
    expect(updated.fps).toBe(30);
    expect(updated.title).toBe('Test');
  });

  it('should still call setProject when no clips reference oldAssetId (clips array unchanged)', () => {
    const clips = [
      { id: 'clip-1', type: 'video', fileId: 'asset-other', trackId: 't1', startFrame: 0, durationFrames: 30, trimInFrame: 0, opacity: 1, volume: 1 },
    ];
    const project = makeProject(clips);
    mockGetSnapshot.mockReturnValue(project as ReturnType<typeof getSnapshot>);

    const { result } = renderHook(() => useReplaceAsset());
    result.current('asset-notfound', 'asset-new');

    // setProject is called but clips are unchanged
    const updated = mockSetProject.mock.calls[0][0];
    expect(updated.clips[0].fileId).toBe('asset-other');
  });
});
