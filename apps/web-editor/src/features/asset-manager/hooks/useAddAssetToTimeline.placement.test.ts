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

const uuidState = vi.hoisted(() => ({ count: 0 }));
vi.mock('crypto', () => ({
  randomUUID: vi.fn(() => `uuid-${++uuidState.count}`),
}));

import * as projectStore from '@/store/project-store';

const mockGetSnapshot = vi.mocked(projectStore.getSnapshot);
const mockSetProject = vi.mocked(projectStore.setProject);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useAddAssetToTimeline — duration and naming edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uuidState.count = 0;
  });

  it('computes durationFrames from asset.durationSeconds * fps (fps-agnostic)', () => {
    mockGetSnapshot.mockReturnValue(makeProject({ fps: 24 }));

    const { result } = renderHook(() => useAddAssetToTimeline(TEST_PROJECT_ID));
    act(() => result.current.addAssetToNewTrack(makeAsset({ contentType: 'video/mp4', durationSeconds: 3 })));

    const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
    expect(updated.clips[0]!.durationFrames).toBe(72); // 3s * 24fps
  });

  it('falls back to fps * 5 when durationSeconds is null', () => {
    mockGetSnapshot.mockReturnValue(makeProject({ fps: 30 }));

    const { result } = renderHook(() => useAddAssetToTimeline(TEST_PROJECT_ID));
    act(() => result.current.addAssetToNewTrack(makeAsset({ contentType: 'image/jpeg', durationSeconds: null })));

    const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
    expect(updated.clips[0]!.durationFrames).toBe(150); // 30 * 5
  });

  it('falls back to fps * 5 when durationSeconds is 0', () => {
    mockGetSnapshot.mockReturnValue(makeProject({ fps: 30 }));

    const { result } = renderHook(() => useAddAssetToTimeline(TEST_PROJECT_ID));
    act(() => result.current.addAssetToNewTrack(makeAsset({ contentType: 'image/webp', durationSeconds: 0 })));

    const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
    expect(updated.clips[0]!.durationFrames).toBe(150);
  });

  it('clamps durationFrames to 1 when durationSeconds * fps rounds to 0', () => {
    mockGetSnapshot.mockReturnValue(makeProject({ fps: 30 }));

    const { result } = renderHook(() => useAddAssetToTimeline(TEST_PROJECT_ID));
    // 0.001s * 30fps = 0.03 → Math.round = 0 → clamped to 1
    act(() => result.current.addAssetToNewTrack(makeAsset({ contentType: 'video/mp4', durationSeconds: 0.001 })));

    const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
    expect(updated.clips[0]!.durationFrames).toBe(1);
  });

  it('does nothing for unsupported content types', () => {
    mockGetSnapshot.mockReturnValue(makeProject());

    const { result } = renderHook(() => useAddAssetToTimeline(TEST_PROJECT_ID));
    act(() => result.current.addAssetToNewTrack(makeAsset({ contentType: 'application/pdf' })));

    expect(mockSetProject).not.toHaveBeenCalled();
  });

  it('uses asset filename (without extension) as the new track name', () => {
    mockGetSnapshot.mockReturnValue(makeProject());

    const { result } = renderHook(() => useAddAssetToTimeline(TEST_PROJECT_ID));
    act(() => result.current.addAssetToNewTrack(makeAsset({ filename: 'my-interview-clip.mp4', contentType: 'video/mp4' })));

    const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
    expect(updated.tracks[0]!.name).toBe('my-interview-clip');
  });

  it('strips multiple dots correctly — only removes the last extension', () => {
    mockGetSnapshot.mockReturnValue(makeProject());

    const { result } = renderHook(() => useAddAssetToTimeline(TEST_PROJECT_ID));
    act(() => result.current.addAssetToNewTrack(makeAsset({ filename: 'take.2.final.mp4', contentType: 'video/mp4' })));

    const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
    expect(updated.tracks[0]!.name).toBe('take.2.final');
  });

  it('always creates a new track for addAssetToNewTrack — even when a same-named track exists', () => {
    const existingTrack: Track = { id: 'video-track-id', type: 'video', name: 'test', muted: false, locked: false };
    const existingClip: Clip = {
      id: 'clip-first', type: 'video', fileId: 'asset-001', trackId: 'video-track-id',
      startFrame: 0, durationFrames: 300, trimInFrame: 0, opacity: 1, volume: 1,
    };
    mockGetSnapshot.mockReturnValue(makeProject({ tracks: [existingTrack], clips: [existingClip] }));

    const { result } = renderHook(() => useAddAssetToTimeline(TEST_PROJECT_ID));
    act(() => result.current.addAssetToNewTrack(makeAsset({ contentType: 'video/mp4', durationSeconds: 10 })));

    const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
    // A new track is created alongside the existing one
    expect(updated.tracks).toHaveLength(2);
    // The new clip is on the new track, starting at frame 0
    const newClip = updated.clips.find(c => c.id !== 'clip-first');
    expect(newClip!.startFrame).toBe(0);
  });
});
