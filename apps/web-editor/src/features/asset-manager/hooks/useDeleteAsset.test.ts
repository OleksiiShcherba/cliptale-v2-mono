import React from 'react';
import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { getSnapshot, setProject } from '@/store/project-store';
import { deleteAsset as deleteAssetApi } from '@/features/asset-manager/api';

import { useDeleteAsset } from './useDeleteAsset';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/store/project-store', () => ({
  getSnapshot: vi.fn(),
  setProject: vi.fn(),
}));

vi.mock('@/features/asset-manager/api', () => ({
  deleteAsset: vi.fn(),
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

function wrapper({ children }: { children: React.ReactNode }): React.ReactElement {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client }, children);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useDeleteAsset', () => {
  const mockGetSnapshot = vi.mocked(getSnapshot);
  const mockSetProject = vi.mocked(setProject);
  const mockDeleteAssetApi = vi.mocked(deleteAssetApi);

  beforeEach(() => {
    vi.clearAllMocks();
    mockDeleteAssetApi.mockResolvedValue(undefined);
  });

  it('returns an async function', () => {
    const { result } = renderHook(() => useDeleteAsset({ projectId: 'proj-001' }), { wrapper });
    expect(typeof result.current).toBe('function');
  });

  it('removes all clips referencing the deleted asset', async () => {
    const project = makeProject({
      tracks: [{ id: 'track-1', name: 'Video 1', type: 'video', muted: false, locked: false }],
      clips: [
        { id: 'clip-1', type: 'video', fileId: 'asset-a', trackId: 'track-1', startFrame: 0, durationFrames: 90, trimInFrame: 0, trimOutFrame: 90, opacity: 1, volume: 1 },
        { id: 'clip-2', type: 'video', fileId: 'asset-b', trackId: 'track-1', startFrame: 100, durationFrames: 60, trimInFrame: 0, trimOutFrame: 60, opacity: 1, volume: 1 },
      ],
    });
    mockGetSnapshot.mockReturnValue(project as ReturnType<typeof getSnapshot>);

    const { result } = renderHook(() => useDeleteAsset({ projectId: 'proj-001' }), { wrapper });
    await result.current('asset-a');

    expect(mockSetProject).toHaveBeenCalledOnce();
    const updatedProject = mockSetProject.mock.calls[0][0];
    expect(updatedProject.clips).toHaveLength(1);
    expect(updatedProject.clips[0].id).toBe('clip-2');
  });

  it('removes multiple clips referencing the same asset', async () => {
    const project = makeProject({
      tracks: [
        { id: 'track-1', name: 'Video 1', type: 'video', muted: false, locked: false },
        { id: 'track-2', name: 'Video 2', type: 'video', muted: false, locked: false },
      ],
      clips: [
        { id: 'clip-1', type: 'video', fileId: 'asset-a', trackId: 'track-1', startFrame: 0, durationFrames: 90, trimInFrame: 0, trimOutFrame: 90, opacity: 1, volume: 1 },
        { id: 'clip-2', type: 'video', fileId: 'asset-a', trackId: 'track-2', startFrame: 100, durationFrames: 60, trimInFrame: 0, trimOutFrame: 60, opacity: 1, volume: 1 },
        { id: 'clip-3', type: 'video', fileId: 'asset-b', trackId: 'track-1', startFrame: 200, durationFrames: 30, trimInFrame: 0, trimOutFrame: 30, opacity: 1, volume: 1 },
      ],
    });
    mockGetSnapshot.mockReturnValue(project as ReturnType<typeof getSnapshot>);

    const { result } = renderHook(() => useDeleteAsset({ projectId: 'proj-001' }), { wrapper });
    await result.current('asset-a');

    const updatedProject = mockSetProject.mock.calls[0][0];
    expect(updatedProject.clips).toHaveLength(1);
    expect(updatedProject.clips[0].id).toBe('clip-3');
  });

  it('removes empty tracks after deleting clips', async () => {
    const project = makeProject({
      tracks: [
        { id: 'track-1', name: 'Video 1', type: 'video', muted: false, locked: false },
        { id: 'track-2', name: 'Video 2', type: 'video', muted: false, locked: false },
      ],
      clips: [
        { id: 'clip-1', type: 'video', fileId: 'asset-a', trackId: 'track-1', startFrame: 0, durationFrames: 90, trimInFrame: 0, trimOutFrame: 90, opacity: 1, volume: 1 },
        { id: 'clip-2', type: 'video', fileId: 'asset-b', trackId: 'track-2', startFrame: 0, durationFrames: 60, trimInFrame: 0, trimOutFrame: 60, opacity: 1, volume: 1 },
      ],
    });
    mockGetSnapshot.mockReturnValue(project as ReturnType<typeof getSnapshot>);

    const { result } = renderHook(() => useDeleteAsset({ projectId: 'proj-001' }), { wrapper });
    await result.current('asset-a');

    const updatedProject = mockSetProject.mock.calls[0][0];
    expect(updatedProject.tracks).toHaveLength(1);
    expect(updatedProject.tracks[0].id).toBe('track-2');
  });

  it('keeps tracks that still have other clips after deletion', async () => {
    const project = makeProject({
      tracks: [{ id: 'track-1', name: 'Video 1', type: 'video', muted: false, locked: false }],
      clips: [
        { id: 'clip-1', type: 'video', fileId: 'asset-a', trackId: 'track-1', startFrame: 0, durationFrames: 90, trimInFrame: 0, trimOutFrame: 90, opacity: 1, volume: 1 },
        { id: 'clip-2', type: 'video', fileId: 'asset-b', trackId: 'track-1', startFrame: 100, durationFrames: 60, trimInFrame: 0, trimOutFrame: 60, opacity: 1, volume: 1 },
      ],
    });
    mockGetSnapshot.mockReturnValue(project as ReturnType<typeof getSnapshot>);

    const { result } = renderHook(() => useDeleteAsset({ projectId: 'proj-001' }), { wrapper });
    await result.current('asset-a');

    const updatedProject = mockSetProject.mock.calls[0][0];
    expect(updatedProject.tracks).toHaveLength(1);
    expect(updatedProject.tracks[0].id).toBe('track-1');
  });

  it('preserves clips without fileId (e.g. text overlay clips)', async () => {
    const project = makeProject({
      tracks: [{ id: 'track-1', name: 'Caption', type: 'caption', muted: false, locked: false }],
      clips: [
        { id: 'clip-1', type: 'video', fileId: 'asset-a', trackId: 'track-1', startFrame: 0, durationFrames: 90, trimInFrame: 0, trimOutFrame: 90, opacity: 1, volume: 1 },
        { id: 'clip-2', type: 'caption', text: 'Hello', trackId: 'track-1', startFrame: 0, durationFrames: 30, fontSize: 24, color: '#fff', position: 'bottom', opacity: 1 },
      ],
    });
    mockGetSnapshot.mockReturnValue(project as ReturnType<typeof getSnapshot>);

    const { result } = renderHook(() => useDeleteAsset({ projectId: 'proj-001' }), { wrapper });
    await result.current('asset-a');

    const updatedProject = mockSetProject.mock.calls[0][0];
    expect(updatedProject.clips).toHaveLength(1);
    expect(updatedProject.clips[0].id).toBe('clip-2');
  });

  it('handles audio clips referencing the asset', async () => {
    const project = makeProject({
      tracks: [{ id: 'track-1', name: 'Audio 1', type: 'audio', muted: false, locked: false }],
      clips: [
        { id: 'clip-1', type: 'audio', fileId: 'asset-a', trackId: 'track-1', startFrame: 0, durationFrames: 300, trimInFrame: 0, trimOutFrame: 300, volume: 1 },
      ],
    });
    mockGetSnapshot.mockReturnValue(project as ReturnType<typeof getSnapshot>);

    const { result } = renderHook(() => useDeleteAsset({ projectId: 'proj-001' }), { wrapper });
    await result.current('asset-a');

    const updatedProject = mockSetProject.mock.calls[0][0];
    expect(updatedProject.clips).toHaveLength(0);
    expect(updatedProject.tracks).toHaveLength(0);
  });

  it('handles image clips referencing the asset', async () => {
    const project = makeProject({
      tracks: [{ id: 'track-1', name: 'Overlay 1', type: 'overlay', muted: false, locked: false }],
      clips: [
        { id: 'clip-1', type: 'image', fileId: 'asset-a', trackId: 'track-1', startFrame: 0, durationFrames: 60, opacity: 1 },
      ],
    });
    mockGetSnapshot.mockReturnValue(project as ReturnType<typeof getSnapshot>);

    const { result } = renderHook(() => useDeleteAsset({ projectId: 'proj-001' }), { wrapper });
    await result.current('asset-a');

    const updatedProject = mockSetProject.mock.calls[0][0];
    expect(updatedProject.clips).toHaveLength(0);
    expect(updatedProject.tracks).toHaveLength(0);
  });

  it('still calls setProject when no clips reference the asset', async () => {
    const project = makeProject({
      tracks: [{ id: 'track-1', name: 'Video 1', type: 'video', muted: false, locked: false }],
      clips: [
        { id: 'clip-1', type: 'video', fileId: 'asset-b', trackId: 'track-1', startFrame: 0, durationFrames: 90, trimInFrame: 0, trimOutFrame: 90, opacity: 1, volume: 1 },
      ],
    });
    mockGetSnapshot.mockReturnValue(project as ReturnType<typeof getSnapshot>);

    const { result } = renderHook(() => useDeleteAsset({ projectId: 'proj-001' }), { wrapper });
    await result.current('asset-nonexistent');

    const updatedProject = mockSetProject.mock.calls[0][0];
    expect(updatedProject.clips).toHaveLength(1);
    expect(updatedProject.tracks).toHaveLength(1);
  });

  it('preserves other project fields', async () => {
    const project = makeProject({
      tracks: [],
      clips: [],
    });
    mockGetSnapshot.mockReturnValue(project as ReturnType<typeof getSnapshot>);

    const { result } = renderHook(() => useDeleteAsset({ projectId: 'proj-001' }), { wrapper });
    await result.current('asset-a');

    const updatedProject = mockSetProject.mock.calls[0][0];
    expect(updatedProject.title).toBe('Test Project');
    expect(updatedProject.fps).toBe(30);
    expect(updatedProject.id).toBe('proj-001');
  });

  it('calls DELETE /assets/:id after updating the project doc', async () => {
    const project = makeProject();
    mockGetSnapshot.mockReturnValue(project as ReturnType<typeof getSnapshot>);

    const callOrder: string[] = [];
    mockSetProject.mockImplementation(() => { callOrder.push('setProject'); });
    mockDeleteAssetApi.mockImplementation(async () => { callOrder.push('deleteAsset'); });

    const { result } = renderHook(() => useDeleteAsset({ projectId: 'proj-001' }), { wrapper });
    await result.current('asset-a');

    expect(mockDeleteAssetApi).toHaveBeenCalledWith('asset-a');
    expect(callOrder).toEqual(['setProject', 'deleteAsset']);
  });

  it('invalidates the assets query after deletion', async () => {
    const project = makeProject();
    mockGetSnapshot.mockReturnValue(project as ReturnType<typeof getSnapshot>);

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const customWrapper = ({ children }: { children: React.ReactNode }): React.ReactElement =>
      React.createElement(QueryClientProvider, { client }, children);

    const { result } = renderHook(() => useDeleteAsset({ projectId: 'proj-001' }), { wrapper: customWrapper });
    await result.current('asset-a');

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['assets', 'proj-001'] });
  });

  it('propagates backend errors from DELETE /assets/:id', async () => {
    const project = makeProject();
    mockGetSnapshot.mockReturnValue(project as ReturnType<typeof getSnapshot>);
    mockDeleteAssetApi.mockRejectedValue(new Error('Asset is referenced by one or more clips'));

    const { result } = renderHook(() => useDeleteAsset({ projectId: 'proj-001' }), { wrapper });
    await expect(result.current('asset-a')).rejects.toThrow(/referenced by one or more clips/);
  });
});
