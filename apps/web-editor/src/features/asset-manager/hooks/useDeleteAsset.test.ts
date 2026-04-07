import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { getSnapshot, setProject } from '@/store/project-store';

import { useDeleteAsset } from './useDeleteAsset';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/store/project-store', () => ({
  getSnapshot: vi.fn(),
  setProject: vi.fn(),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeProject(overrides: { tracks?: object[]; clips?: object[] } = {}) {
  return {
    schemaVersion: 1,
    id: 'proj-001',
    title: 'Test Project',
    fps: 30,
    durationFrames: 300,
    width: 1920,
    height: 1080,
    tracks: [],
    clips: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useDeleteAsset', () => {
  const mockGetSnapshot = vi.mocked(getSnapshot);
  const mockSetProject = vi.mocked(setProject);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a function', () => {
    const { result } = renderHook(() => useDeleteAsset());
    expect(typeof result.current).toBe('function');
  });

  it('removes all clips referencing the deleted asset', () => {
    const project = makeProject({
      tracks: [{ id: 'track-1', name: 'Video 1', type: 'video', muted: false, locked: false }],
      clips: [
        { id: 'clip-1', type: 'video', assetId: 'asset-a', trackId: 'track-1', startFrame: 0, durationFrames: 90, trimInFrame: 0, trimOutFrame: 90, opacity: 1, volume: 1 },
        { id: 'clip-2', type: 'video', assetId: 'asset-b', trackId: 'track-1', startFrame: 100, durationFrames: 60, trimInFrame: 0, trimOutFrame: 60, opacity: 1, volume: 1 },
      ],
    });
    mockGetSnapshot.mockReturnValue(project as ReturnType<typeof getSnapshot>);

    const { result } = renderHook(() => useDeleteAsset());
    result.current('asset-a');

    expect(mockSetProject).toHaveBeenCalledOnce();
    const updatedProject = mockSetProject.mock.calls[0][0];
    expect(updatedProject.clips).toHaveLength(1);
    expect(updatedProject.clips[0].id).toBe('clip-2');
  });

  it('removes multiple clips referencing the same asset', () => {
    const project = makeProject({
      tracks: [
        { id: 'track-1', name: 'Video 1', type: 'video', muted: false, locked: false },
        { id: 'track-2', name: 'Video 2', type: 'video', muted: false, locked: false },
      ],
      clips: [
        { id: 'clip-1', type: 'video', assetId: 'asset-a', trackId: 'track-1', startFrame: 0, durationFrames: 90, trimInFrame: 0, trimOutFrame: 90, opacity: 1, volume: 1 },
        { id: 'clip-2', type: 'video', assetId: 'asset-a', trackId: 'track-2', startFrame: 100, durationFrames: 60, trimInFrame: 0, trimOutFrame: 60, opacity: 1, volume: 1 },
        { id: 'clip-3', type: 'video', assetId: 'asset-b', trackId: 'track-1', startFrame: 200, durationFrames: 30, trimInFrame: 0, trimOutFrame: 30, opacity: 1, volume: 1 },
      ],
    });
    mockGetSnapshot.mockReturnValue(project as ReturnType<typeof getSnapshot>);

    const { result } = renderHook(() => useDeleteAsset());
    result.current('asset-a');

    const updatedProject = mockSetProject.mock.calls[0][0];
    expect(updatedProject.clips).toHaveLength(1);
    expect(updatedProject.clips[0].id).toBe('clip-3');
  });

  it('removes empty tracks after deleting clips', () => {
    const project = makeProject({
      tracks: [
        { id: 'track-1', name: 'Video 1', type: 'video', muted: false, locked: false },
        { id: 'track-2', name: 'Video 2', type: 'video', muted: false, locked: false },
      ],
      clips: [
        { id: 'clip-1', type: 'video', assetId: 'asset-a', trackId: 'track-1', startFrame: 0, durationFrames: 90, trimInFrame: 0, trimOutFrame: 90, opacity: 1, volume: 1 },
        { id: 'clip-2', type: 'video', assetId: 'asset-b', trackId: 'track-2', startFrame: 0, durationFrames: 60, trimInFrame: 0, trimOutFrame: 60, opacity: 1, volume: 1 },
      ],
    });
    mockGetSnapshot.mockReturnValue(project as ReturnType<typeof getSnapshot>);

    const { result } = renderHook(() => useDeleteAsset());
    result.current('asset-a');

    const updatedProject = mockSetProject.mock.calls[0][0];
    expect(updatedProject.tracks).toHaveLength(1);
    expect(updatedProject.tracks[0].id).toBe('track-2');
  });

  it('keeps tracks that still have other clips after deletion', () => {
    const project = makeProject({
      tracks: [{ id: 'track-1', name: 'Video 1', type: 'video', muted: false, locked: false }],
      clips: [
        { id: 'clip-1', type: 'video', assetId: 'asset-a', trackId: 'track-1', startFrame: 0, durationFrames: 90, trimInFrame: 0, trimOutFrame: 90, opacity: 1, volume: 1 },
        { id: 'clip-2', type: 'video', assetId: 'asset-b', trackId: 'track-1', startFrame: 100, durationFrames: 60, trimInFrame: 0, trimOutFrame: 60, opacity: 1, volume: 1 },
      ],
    });
    mockGetSnapshot.mockReturnValue(project as ReturnType<typeof getSnapshot>);

    const { result } = renderHook(() => useDeleteAsset());
    result.current('asset-a');

    const updatedProject = mockSetProject.mock.calls[0][0];
    expect(updatedProject.tracks).toHaveLength(1);
    expect(updatedProject.tracks[0].id).toBe('track-1');
  });

  it('preserves clips without assetId (e.g. text overlay clips)', () => {
    const project = makeProject({
      tracks: [{ id: 'track-1', name: 'Caption', type: 'caption', muted: false, locked: false }],
      clips: [
        { id: 'clip-1', type: 'video', assetId: 'asset-a', trackId: 'track-1', startFrame: 0, durationFrames: 90, trimInFrame: 0, trimOutFrame: 90, opacity: 1, volume: 1 },
        { id: 'clip-2', type: 'caption', text: 'Hello', trackId: 'track-1', startFrame: 0, durationFrames: 30, fontSize: 24, color: '#fff', position: 'bottom', opacity: 1 },
      ],
    });
    mockGetSnapshot.mockReturnValue(project as ReturnType<typeof getSnapshot>);

    const { result } = renderHook(() => useDeleteAsset());
    result.current('asset-a');

    const updatedProject = mockSetProject.mock.calls[0][0];
    expect(updatedProject.clips).toHaveLength(1);
    expect(updatedProject.clips[0].id).toBe('clip-2');
  });

  it('handles audio clips referencing the asset', () => {
    const project = makeProject({
      tracks: [{ id: 'track-1', name: 'Audio 1', type: 'audio', muted: false, locked: false }],
      clips: [
        { id: 'clip-1', type: 'audio', assetId: 'asset-a', trackId: 'track-1', startFrame: 0, durationFrames: 300, trimInFrame: 0, trimOutFrame: 300, volume: 1 },
      ],
    });
    mockGetSnapshot.mockReturnValue(project as ReturnType<typeof getSnapshot>);

    const { result } = renderHook(() => useDeleteAsset());
    result.current('asset-a');

    const updatedProject = mockSetProject.mock.calls[0][0];
    expect(updatedProject.clips).toHaveLength(0);
    expect(updatedProject.tracks).toHaveLength(0);
  });

  it('handles image clips referencing the asset', () => {
    const project = makeProject({
      tracks: [{ id: 'track-1', name: 'Overlay 1', type: 'overlay', muted: false, locked: false }],
      clips: [
        { id: 'clip-1', type: 'image', assetId: 'asset-a', trackId: 'track-1', startFrame: 0, durationFrames: 60, opacity: 1 },
      ],
    });
    mockGetSnapshot.mockReturnValue(project as ReturnType<typeof getSnapshot>);

    const { result } = renderHook(() => useDeleteAsset());
    result.current('asset-a');

    const updatedProject = mockSetProject.mock.calls[0][0];
    expect(updatedProject.clips).toHaveLength(0);
    expect(updatedProject.tracks).toHaveLength(0);
  });

  it('still calls setProject when no clips reference the asset', () => {
    const project = makeProject({
      tracks: [{ id: 'track-1', name: 'Video 1', type: 'video', muted: false, locked: false }],
      clips: [
        { id: 'clip-1', type: 'video', assetId: 'asset-b', trackId: 'track-1', startFrame: 0, durationFrames: 90, trimInFrame: 0, trimOutFrame: 90, opacity: 1, volume: 1 },
      ],
    });
    mockGetSnapshot.mockReturnValue(project as ReturnType<typeof getSnapshot>);

    const { result } = renderHook(() => useDeleteAsset());
    result.current('asset-nonexistent');

    const updatedProject = mockSetProject.mock.calls[0][0];
    expect(updatedProject.clips).toHaveLength(1);
    expect(updatedProject.tracks).toHaveLength(1);
  });

  it('preserves other project fields', () => {
    const project = makeProject({
      tracks: [],
      clips: [],
    });
    mockGetSnapshot.mockReturnValue(project as ReturnType<typeof getSnapshot>);

    const { result } = renderHook(() => useDeleteAsset());
    result.current('asset-a');

    const updatedProject = mockSetProject.mock.calls[0][0];
    expect(updatedProject.title).toBe('Test Project');
    expect(updatedProject.fps).toBe(30);
    expect(updatedProject.id).toBe('proj-001');
  });
});
