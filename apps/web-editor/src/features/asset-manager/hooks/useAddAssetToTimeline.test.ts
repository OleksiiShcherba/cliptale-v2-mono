import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { Clip, ProjectDoc, Track } from '@ai-video-editor/project-schema';

import type { Asset } from '@/features/asset-manager/types';

import { useAddAssetToTimeline } from './useAddAssetToTimeline';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/store/project-store', () => ({
  getSnapshot: vi.fn(),
  setProject: vi.fn(),
}));

vi.mock('@/features/timeline/api', () => ({
  createClip: vi.fn().mockResolvedValue(undefined),
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

// ── Helpers ───────────────────────────────────────────────────────────────────

const TEST_PROJECT_ID = 'proj-001';

function makeProject(overrides: Partial<ProjectDoc> = {}): ProjectDoc {
  return {
    schemaVersion: 1,
    id: TEST_PROJECT_ID,
    title: 'Test',
    fps: 30,
    durationFrames: 300,
    width: 1920,
    height: 1080,
    tracks: [] as Track[],
    clips: [] as Clip[],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as unknown as ProjectDoc;
}

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'asset-001',
    projectId: TEST_PROJECT_ID,
    filename: 'test.mp4',
    contentType: 'video/mp4',
    downloadUrl: 'https://example.com/presigned/test.mp4',
    status: 'ready',
    durationSeconds: 10,
    width: 1920,
    height: 1080,
    fileSizeBytes: 1_000_000,
    thumbnailUri: null,
    waveformPeaks: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useAddAssetToTimeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uuidState.count = 0; // reset counter so each test starts from uuid-1
  });

  it('creates a video track and VideoClip for a video/* asset', () => {
    mockGetSnapshot.mockReturnValue(makeProject());

    const { result } = renderHook(() => useAddAssetToTimeline(TEST_PROJECT_ID));
    act(() => result.current(makeAsset({ contentType: 'video/mp4', durationSeconds: 10 })));

    const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
    expect(updated.tracks).toHaveLength(1);
    expect(updated.tracks[0]!.type).toBe('video');
    expect(updated.tracks[0]!.name).toBe('test'); // filename 'test.mp4' → 'test'
    expect(updated.clips).toHaveLength(1);
    expect(updated.clips[0]!.type).toBe('video');
    // durationFrames = round(10s * 30fps) = 300
    expect(updated.clips[0]!.durationFrames).toBe(300);
    expect(updated.clips[0]!.startFrame).toBe(0);
    // assetId links the clip back to the source asset
    expect(updated.clips[0]!.assetId).toBe('asset-001');
    // trackId links the clip to the newly created track
    expect(updated.clips[0]!.trackId).toBe(updated.tracks[0]!.id);
  });

  it('calls createClip with projectId and the new clip after setProject', () => {
    mockGetSnapshot.mockReturnValue(makeProject());

    const { result } = renderHook(() => useAddAssetToTimeline(TEST_PROJECT_ID));
    act(() => result.current(makeAsset({ contentType: 'video/mp4', durationSeconds: 10 })));

    expect(mockCreateClip).toHaveBeenCalledTimes(1);
    const [calledProjectId, calledClip] = mockCreateClip.mock.calls[0]!;
    expect(calledProjectId).toBe(TEST_PROJECT_ID);
    expect(calledClip.type).toBe('video');
    expect(calledClip.durationFrames).toBe(300);
    expect(calledClip.startFrame).toBe(0);
  });

  it('calls createClip with correct projectId for audio assets', () => {
    mockGetSnapshot.mockReturnValue(makeProject());

    const { result } = renderHook(() => useAddAssetToTimeline(TEST_PROJECT_ID));
    act(() => result.current(makeAsset({ contentType: 'audio/mpeg', durationSeconds: 5 })));

    expect(mockCreateClip).toHaveBeenCalledTimes(1);
    const [calledProjectId, calledClip] = mockCreateClip.mock.calls[0]!;
    expect(calledProjectId).toBe(TEST_PROJECT_ID);
    expect(calledClip.type).toBe('audio');
  });

  it('calls createClip with image type for image/* assets', () => {
    mockGetSnapshot.mockReturnValue(makeProject());

    const { result } = renderHook(() => useAddAssetToTimeline(TEST_PROJECT_ID));
    act(() => result.current(makeAsset({ contentType: 'image/png', durationSeconds: null })));

    expect(mockCreateClip).toHaveBeenCalledTimes(1);
    const [calledProjectId, calledClip] = mockCreateClip.mock.calls[0]!;
    expect(calledProjectId).toBe(TEST_PROJECT_ID);
    expect(calledClip.type).toBe('image');
  });

  it('does NOT call createClip for unsupported content types', () => {
    mockGetSnapshot.mockReturnValue(makeProject());

    const { result } = renderHook(() => useAddAssetToTimeline(TEST_PROJECT_ID));
    act(() => result.current(makeAsset({ contentType: 'application/pdf' })));

    expect(mockSetProject).not.toHaveBeenCalled();
    expect(mockCreateClip).not.toHaveBeenCalled();
  });

  it('sets correct default fields on VideoClip (trimInFrame, opacity, volume)', () => {
    mockGetSnapshot.mockReturnValue(makeProject());

    const { result } = renderHook(() => useAddAssetToTimeline(TEST_PROJECT_ID));
    act(() => result.current(makeAsset({ contentType: 'video/mp4', durationSeconds: 5 })));

    const clip = (mockSetProject.mock.calls[0]![0] as ProjectDoc).clips[0] as Record<string, unknown>;
    expect(clip['trimInFrame']).toBe(0);
    expect(clip['opacity']).toBe(1);
    expect(clip['volume']).toBe(1);
  });

  it('creates an audio track and AudioClip with correct defaults for an audio/* asset', () => {
    mockGetSnapshot.mockReturnValue(makeProject());

    const { result } = renderHook(() => useAddAssetToTimeline(TEST_PROJECT_ID));
    act(() => result.current(makeAsset({ contentType: 'audio/mpeg', durationSeconds: 5 })));

    const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
    expect(updated.tracks[0]!.type).toBe('audio');
    expect(updated.tracks[0]!.name).toBe('test'); // filename 'test.mp4' → 'test'
    expect(updated.clips[0]!.type).toBe('audio');
    expect(updated.clips[0]!.durationFrames).toBe(150); // 5s * 30fps
    expect(updated.clips[0]!.assetId).toBe('asset-001');
    expect(updated.clips[0]!.trackId).toBe(updated.tracks[0]!.id);
    const clip = updated.clips[0] as Record<string, unknown>;
    expect(clip['trimInFrame']).toBe(0);
    expect(clip['volume']).toBe(1);
  });

  it('creates a video track named after the asset file and ImageClip for an image/* asset', () => {
    mockGetSnapshot.mockReturnValue(makeProject());

    const { result } = renderHook(() => useAddAssetToTimeline(TEST_PROJECT_ID));
    act(() => result.current(makeAsset({ contentType: 'image/png', durationSeconds: null })));

    const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
    expect(updated.tracks[0]!.type).toBe('video');
    expect(updated.tracks[0]!.name).toBe('test'); // filename 'test.mp4' → 'test'
    expect(updated.clips[0]!.type).toBe('image');
    // No duration → fallback to fps * 5 = 150
    expect(updated.clips[0]!.durationFrames).toBe(150);
    expect(updated.clips[0]!.assetId).toBe('asset-001');
    expect(updated.clips[0]!.trackId).toBe(updated.tracks[0]!.id);
  });

  it('reuses an existing track whose name matches the asset filename (no extension)', () => {
    const existingTrack: Track = {
      id: 'existing-track-id',
      type: 'video',
      name: 'test', // matches 'test.mp4' (asset fixture filename without extension)
      muted: false,
      locked: false,
    };
    mockGetSnapshot.mockReturnValue(makeProject({ tracks: [existingTrack] }));

    const { result } = renderHook(() => useAddAssetToTimeline(TEST_PROJECT_ID));
    act(() => result.current(makeAsset({ contentType: 'video/mp4' })));

    const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
    expect(updated.tracks).toHaveLength(1);
    expect(updated.tracks[0]!.id).toBe('existing-track-id');
    expect(updated.clips[0]!.trackId).toBe('existing-track-id');
  });

  it('places the clip at the end of existing clips on the same track', () => {
    const trackId = 'video-track-id';
    const existingTrack: Track = { id: trackId, type: 'video', name: 'test', muted: false, locked: false };
    const existingClip: Clip = {
      id: 'clip-existing',
      type: 'video',
      assetId: 'asset-old',
      trackId,
      startFrame: 0,
      durationFrames: 120,
      trimInFrame: 0,
      opacity: 1,
      volume: 1,
    };
    mockGetSnapshot.mockReturnValue(makeProject({ tracks: [existingTrack], clips: [existingClip] }));

    const { result } = renderHook(() => useAddAssetToTimeline(TEST_PROJECT_ID));
    act(() => result.current(makeAsset({ contentType: 'video/mp4', durationSeconds: 5 })));

    const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
    expect(updated.clips).toHaveLength(2);
    // New clip starts at frame 120 (end of existing clip)
    expect(updated.clips[1]!.startFrame).toBe(120);
  });

  it('uses the max end-frame across multiple clips on the track, not the last clip', () => {
    const trackId = 'video-track-id';
    const track: Track = { id: trackId, type: 'video', name: 'test', muted: false, locked: false };
    const clips: Clip[] = [
      // clip A: 0–200 (largest end frame)
      { id: 'clip-a', type: 'video', assetId: 'a1', trackId, startFrame: 0, durationFrames: 200, trimInFrame: 0, opacity: 1, volume: 1 },
      // clip B: 50–150 (smaller end frame — reduce must pick 200, not 150)
      { id: 'clip-b', type: 'video', assetId: 'a2', trackId, startFrame: 50, durationFrames: 100, trimInFrame: 0, opacity: 1, volume: 1 },
    ];
    mockGetSnapshot.mockReturnValue(makeProject({ tracks: [track], clips }));

    const { result } = renderHook(() => useAddAssetToTimeline(TEST_PROJECT_ID));
    act(() => result.current(makeAsset({ contentType: 'video/mp4', durationSeconds: 2 })));

    const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
    expect(updated.clips[2]!.startFrame).toBe(200);
  });

  it('ignores clips on other tracks when computing startFrame', () => {
    const videoTrackId = 'video-track-id';
    const audioTrackId = 'audio-track-id';
    // Track names must match the asset filename (without extension) to be reused.
    const videoTrack: Track = { id: videoTrackId, type: 'video', name: 'test', muted: false, locked: false };
    const audioTrack: Track = { id: audioTrackId, type: 'audio', name: 'other-audio', muted: false, locked: false };
    const audioClipWithLargeFrame: Clip = {
      id: 'clip-audio',
      type: 'audio',
      assetId: 'a1',
      trackId: audioTrackId,
      startFrame: 0,
      durationFrames: 900, // ends at 900 — must NOT affect video track startFrame
      trimInFrame: 0,
      volume: 1,
    };
    mockGetSnapshot.mockReturnValue(makeProject({ tracks: [videoTrack, audioTrack], clips: [audioClipWithLargeFrame] }));

    const { result } = renderHook(() => useAddAssetToTimeline(TEST_PROJECT_ID));
    act(() => result.current(makeAsset({ contentType: 'video/mp4', durationSeconds: 2 })));

    const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
    const newVideoClip = updated.clips.find(c => c.trackId === videoTrackId);
    // Video track has no clips → startFrame must be 0, not 900
    expect(newVideoClip!.startFrame).toBe(0);
  });

  it('computes durationFrames from asset.durationSeconds * fps (fps-agnostic)', () => {
    mockGetSnapshot.mockReturnValue(makeProject({ fps: 24 }));

    const { result } = renderHook(() => useAddAssetToTimeline(TEST_PROJECT_ID));
    act(() => result.current(makeAsset({ contentType: 'video/mp4', durationSeconds: 3 })));

    const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
    // 3s * 24fps = 72
    expect(updated.clips[0]!.durationFrames).toBe(72);
  });

  it('falls back to fps * 5 when durationSeconds is null', () => {
    mockGetSnapshot.mockReturnValue(makeProject({ fps: 30 }));

    const { result } = renderHook(() => useAddAssetToTimeline(TEST_PROJECT_ID));
    act(() => result.current(makeAsset({ contentType: 'image/jpeg', durationSeconds: null })));

    const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
    expect(updated.clips[0]!.durationFrames).toBe(150); // 30 * 5
  });

  it('falls back to fps * 5 when durationSeconds is 0', () => {
    mockGetSnapshot.mockReturnValue(makeProject({ fps: 30 }));

    const { result } = renderHook(() => useAddAssetToTimeline(TEST_PROJECT_ID));
    act(() => result.current(makeAsset({ contentType: 'image/webp', durationSeconds: 0 })));

    const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
    expect(updated.clips[0]!.durationFrames).toBe(150);
  });

  it('clamps durationFrames to 1 when durationSeconds * fps rounds to 0', () => {
    mockGetSnapshot.mockReturnValue(makeProject({ fps: 30 }));

    const { result } = renderHook(() => useAddAssetToTimeline(TEST_PROJECT_ID));
    // 0.001s * 30fps = 0.03 → Math.round = 0 → clamped to 1
    act(() => result.current(makeAsset({ contentType: 'video/mp4', durationSeconds: 0.001 })));

    const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
    expect(updated.clips[0]!.durationFrames).toBe(1);
  });

  it('does nothing for unsupported content types', () => {
    mockGetSnapshot.mockReturnValue(makeProject());

    const { result } = renderHook(() => useAddAssetToTimeline(TEST_PROJECT_ID));
    act(() => result.current(makeAsset({ contentType: 'application/pdf' })));

    expect(mockSetProject).not.toHaveBeenCalled();
  });

  it('uses asset filename (without extension) as the new track name', () => {
    mockGetSnapshot.mockReturnValue(makeProject());

    const { result } = renderHook(() => useAddAssetToTimeline(TEST_PROJECT_ID));
    act(() => result.current(makeAsset({ filename: 'my-interview-clip.mp4', contentType: 'video/mp4' })));

    const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
    expect(updated.tracks[0]!.name).toBe('my-interview-clip');
  });

  it('strips multiple dots correctly — only removes the last extension', () => {
    mockGetSnapshot.mockReturnValue(makeProject());

    const { result } = renderHook(() => useAddAssetToTimeline(TEST_PROJECT_ID));
    act(() => result.current(makeAsset({ filename: 'take.2.final.mp4', contentType: 'video/mp4' })));

    const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
    expect(updated.tracks[0]!.name).toBe('take.2.final');
  });

  it('does not place image clips on the same track as a differently-named video track', () => {
    const videoTrack: Track = { id: 'video-track', type: 'video', name: 'my-video', muted: false, locked: false };
    mockGetSnapshot.mockReturnValue(makeProject({ tracks: [videoTrack] }));

    const { result } = renderHook(() => useAddAssetToTimeline(TEST_PROJECT_ID));
    // Asset filename 'test.mp4' → track name 'test', which differs from 'my-video'
    act(() => result.current(makeAsset({ contentType: 'image/png', durationSeconds: null })));

    const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
    // A new 'test' track should be created, not reusing 'my-video'
    expect(updated.tracks).toHaveLength(2);
    const imageTrack = updated.tracks.find(t => t.name === 'test');
    expect(imageTrack).toBeDefined();
    expect(updated.clips[0]!.trackId).toBe(imageTrack!.id);
  });
});
