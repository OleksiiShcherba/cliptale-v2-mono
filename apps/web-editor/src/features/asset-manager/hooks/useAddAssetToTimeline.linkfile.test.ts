import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { Track } from '@ai-video-editor/project-schema';

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

import * as projectStore from '@/store/project-store';
import * as timelineApi from '@/features/timeline/api';

const mockGetSnapshot = vi.mocked(projectStore.getSnapshot);
const mockLinkFileToProject = vi.mocked(timelineApi.linkFileToProject);

// ── Tests: linkFileToProject integration ─────────────────────────────────────

describe('useAddAssetToTimeline / linkFileToProject calls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLinkFileToProject.mockResolvedValue(undefined);
  });

  it('calls linkFileToProject(projectId, asset.id) after addAssetToNewTrack', async () => {
    mockGetSnapshot.mockReturnValue(makeProject());
    const asset = makeAsset({ id: 'file-abc', contentType: 'video/mp4', durationSeconds: 5 });

    const { result } = renderHook(() => useAddAssetToTimeline(TEST_PROJECT_ID));
    act(() => result.current.addAssetToNewTrack(asset));

    // Allow the fire-and-forget promise chain to settle
    await act(async () => { await Promise.resolve(); });

    expect(mockLinkFileToProject).toHaveBeenCalledTimes(1);
    expect(mockLinkFileToProject).toHaveBeenCalledWith(TEST_PROJECT_ID, 'file-abc');
  });

  it('calls linkFileToProject(projectId, asset.id) after addAssetToExistingTrack', async () => {
    const existingTrack: Track = { id: 'track-001', type: 'video', name: 'Main', muted: false, locked: false };
    mockGetSnapshot.mockReturnValue(makeProject({ tracks: [existingTrack] }));
    const asset = makeAsset({ id: 'file-xyz', contentType: 'video/mp4', durationSeconds: 5 });

    const { result } = renderHook(() => useAddAssetToTimeline(TEST_PROJECT_ID));
    act(() => result.current.addAssetToExistingTrack(asset, 'track-001'));

    // Allow the fire-and-forget promise chain to settle
    await act(async () => { await Promise.resolve(); });

    expect(mockLinkFileToProject).toHaveBeenCalledTimes(1);
    expect(mockLinkFileToProject).toHaveBeenCalledWith(TEST_PROJECT_ID, 'file-xyz');
  });

  it('invalidates ["assets", projectId] after successful link via addAssetToNewTrack', async () => {
    mockGetSnapshot.mockReturnValue(makeProject());

    const { result } = renderHook(() => useAddAssetToTimeline(TEST_PROJECT_ID));
    act(() => result.current.addAssetToNewTrack(makeAsset({ contentType: 'video/mp4' })));

    await act(async () => { await Promise.resolve(); });

    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['assets', TEST_PROJECT_ID] });
  });

  it('invalidates ["assets", projectId] after successful link via addAssetToExistingTrack', async () => {
    const existingTrack: Track = { id: 'track-001', type: 'video', name: 'Main', muted: false, locked: false };
    mockGetSnapshot.mockReturnValue(makeProject({ tracks: [existingTrack] }));

    const { result } = renderHook(() => useAddAssetToTimeline(TEST_PROJECT_ID));
    act(() => result.current.addAssetToExistingTrack(makeAsset({ contentType: 'video/mp4' }), 'track-001'));

    await act(async () => { await Promise.resolve(); });

    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['assets', TEST_PROJECT_ID] });
  });

  it('does not throw when linkFileToProject rejects (fire-and-forget) for addAssetToNewTrack', async () => {
    mockGetSnapshot.mockReturnValue(makeProject());
    mockLinkFileToProject.mockRejectedValue(new Error('network error'));

    const { result } = renderHook(() => useAddAssetToTimeline(TEST_PROJECT_ID));

    // Must not throw
    await expect(
      act(async () => {
        result.current.addAssetToNewTrack(makeAsset({ contentType: 'video/mp4' }));
        await Promise.resolve();
      }),
    ).resolves.toBeUndefined();
  });

  it('does not throw when linkFileToProject rejects (fire-and-forget) for addAssetToExistingTrack', async () => {
    const existingTrack: Track = { id: 'track-001', type: 'video', name: 'Main', muted: false, locked: false };
    mockGetSnapshot.mockReturnValue(makeProject({ tracks: [existingTrack] }));
    mockLinkFileToProject.mockRejectedValue(new Error('network error'));

    const { result } = renderHook(() => useAddAssetToTimeline(TEST_PROJECT_ID));

    // Must not throw
    await expect(
      act(async () => {
        result.current.addAssetToExistingTrack(makeAsset({ contentType: 'video/mp4' }), 'track-001');
        await Promise.resolve();
      }),
    ).resolves.toBeUndefined();
  });

  it('does not call linkFileToProject for unsupported content types', async () => {
    mockGetSnapshot.mockReturnValue(makeProject());

    const { result } = renderHook(() => useAddAssetToTimeline(TEST_PROJECT_ID));
    act(() => result.current.addAssetToNewTrack(makeAsset({ contentType: 'application/pdf' })));

    await act(async () => { await Promise.resolve(); });

    expect(mockLinkFileToProject).not.toHaveBeenCalled();
  });
});
