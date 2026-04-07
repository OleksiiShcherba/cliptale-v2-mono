import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { useAddCaptionsToTimeline } from './useAddCaptionsToTimeline';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/store/project-store', () => ({
  getSnapshot: vi.fn(),
  setProject: vi.fn(),
}));

// Stable UUID for assertions.
vi.mock('crypto', () => ({
  // Provide a predictable sequence for UUID generation.
  randomUUID: vi.fn()
    .mockReturnValueOnce('track-uuid-0000')
    .mockReturnValue('clip-uuid-xxxx'),
}));

import type { ProjectDoc, Track, Clip } from '@ai-video-editor/project-schema';

import * as projectStore from '@/store/project-store';

const mockGetSnapshot = vi.mocked(projectStore.getSnapshot);
const mockSetProject = vi.mocked(projectStore.setProject);

const TEST_SEGMENTS = [
  { start: 0.0, end: 2.5, text: 'Hello world' },
  { start: 2.5, end: 5.0, text: 'Second line' },
];

function makeProject(fps = 30, overrides: Partial<ProjectDoc> = {}): ProjectDoc {
  return {
    schemaVersion: 1,
    id: 'proj-001',
    title: 'Test',
    fps,
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

describe('useAddCaptionsToTimeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('appends a captions track of type overlay to the project', () => {
    mockGetSnapshot.mockReturnValue(makeProject());

    const { result } = renderHook(() => useAddCaptionsToTimeline());
    act(() => result.current.addCaptionsToTimeline(TEST_SEGMENTS));

    const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
    const captionsTrack = updated.tracks.find((t: Track) => t.name === 'Captions 1');
    expect(captionsTrack).toBeDefined();
    expect(captionsTrack?.type).toBe('overlay');
  });

  it('creates TextOverlayClips with correct frame math at 30fps', () => {
    mockGetSnapshot.mockReturnValue(makeProject(30));

    const { result } = renderHook(() => useAddCaptionsToTimeline());
    act(() => result.current.addCaptionsToTimeline(TEST_SEGMENTS));

    const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
    const clips = updated.clips.filter((c: Clip) => c.type === 'text-overlay');

    // Segment 0: start=0.0, end=2.5 at 30fps → startFrame=0, durationFrames=75
    expect(clips[0]).toMatchObject({
      type: 'text-overlay',
      startFrame: 0,
      durationFrames: 75,
      text: 'Hello world',
    });

    // Segment 1: start=2.5, end=5.0 at 30fps → startFrame=75, durationFrames=75
    expect(clips[1]).toMatchObject({
      type: 'text-overlay',
      startFrame: 75,
      durationFrames: 75,
      text: 'Second line',
    });
  });

  it('clamps durationFrames to minimum 1 for zero-length segments', () => {
    mockGetSnapshot.mockReturnValue(makeProject(30));

    const { result } = renderHook(() => useAddCaptionsToTimeline());
    act(() =>
      result.current.addCaptionsToTimeline([{ start: 1.0, end: 1.0, text: 'Instant' }]),
    );

    const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
    const clip = updated.clips.find((c: Clip) => c.type === 'text-overlay');
    expect(clip?.durationFrames).toBeGreaterThanOrEqual(1);
  });

  it('sets clip trackId to the newly created track id', () => {
    mockGetSnapshot.mockReturnValue(makeProject());

    const { result } = renderHook(() => useAddCaptionsToTimeline());
    act(() => result.current.addCaptionsToTimeline(TEST_SEGMENTS));

    const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
    const captionsTrack = updated.tracks.find((t: Track) => t.name === 'Captions 1');
    const clips = updated.clips.filter((c: Clip) => c.type === 'text-overlay');

    clips.forEach((clip: Clip) => {
      expect(clip.trackId).toBe(captionsTrack?.id);
    });
  });

  it('preserves existing tracks and clips in the project', () => {
    const existingTrack: Track = { id: 'existing-track', type: 'video', name: 'Main', muted: false, locked: false };
    mockGetSnapshot.mockReturnValue(makeProject(30, { tracks: [existingTrack], clips: [] }));

    const { result } = renderHook(() => useAddCaptionsToTimeline());
    act(() => result.current.addCaptionsToTimeline(TEST_SEGMENTS));

    const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
    expect(updated.tracks).toContain(existingTrack);
    expect(updated.tracks).toHaveLength(2); // existing + captions 1
  });

  it('handles an empty segments array without throwing', () => {
    mockGetSnapshot.mockReturnValue(makeProject());

    const { result } = renderHook(() => useAddCaptionsToTimeline());
    expect(() =>
      act(() => result.current.addCaptionsToTimeline([])),
    ).not.toThrow();

    const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
    expect(updated.clips).toHaveLength(0);
    expect(updated.tracks).toHaveLength(1); // empty caption track still created
  });

  describe('multiple caption tracks', () => {
    it('names the first caption track "Captions 1" when no caption tracks exist', () => {
      mockGetSnapshot.mockReturnValue(makeProject());

      const { result } = renderHook(() => useAddCaptionsToTimeline());
      act(() => result.current.addCaptionsToTimeline(TEST_SEGMENTS));

      const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
      const track = updated.tracks.find((t: Track) => t.type === 'overlay');
      expect(track?.name).toBe('Captions 1');
    });

    it('names the second caption track "Captions 2" when one caption track already exists', () => {
      const existingCaptionsTrack: Track = {
        id: 'existing-captions-track',
        type: 'overlay',
        name: 'Captions 1',
        muted: false,
        locked: false,
      };
      mockGetSnapshot.mockReturnValue(
        makeProject(30, { tracks: [existingCaptionsTrack], clips: [] }),
      );

      const { result } = renderHook(() => useAddCaptionsToTimeline());
      act(() => result.current.addCaptionsToTimeline(TEST_SEGMENTS));

      expect(mockSetProject).toHaveBeenCalledTimes(1);
      const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
      const newTrack = updated.tracks.find((t: Track) => t.name === 'Captions 2');
      expect(newTrack).toBeDefined();
    });

    it('can add multiple caption tracks in sequence', () => {
      mockGetSnapshot
        .mockReturnValueOnce(makeProject())
        .mockReturnValueOnce(makeProject(30, {
          tracks: [{ id: 'ct1', type: 'overlay', name: 'Captions 1', muted: false, locked: false }],
          clips: [],
        }));

      const { result } = renderHook(() => useAddCaptionsToTimeline());
      act(() => result.current.addCaptionsToTimeline(TEST_SEGMENTS));
      act(() => result.current.addCaptionsToTimeline(TEST_SEGMENTS));

      expect(mockSetProject).toHaveBeenCalledTimes(2);
      const first = mockSetProject.mock.calls[0]![0] as ProjectDoc;
      const second = mockSetProject.mock.calls[1]![0] as ProjectDoc;
      expect(first.tracks.some((t: Track) => t.name === 'Captions 1')).toBe(true);
      expect(second.tracks.some((t: Track) => t.name === 'Captions 2')).toBe(true);
    });

    it('still adds a caption track when no tracks starting with "Captions" exist', () => {
      const unrelatedTrack: Track = {
        id: 'video-track',
        type: 'video',
        name: 'Main Video',
        muted: false,
        locked: false,
      };
      mockGetSnapshot.mockReturnValue(
        makeProject(30, { tracks: [unrelatedTrack], clips: [] }),
      );

      const { result } = renderHook(() => useAddCaptionsToTimeline());
      act(() => result.current.addCaptionsToTimeline(TEST_SEGMENTS));

      expect(mockSetProject).toHaveBeenCalledTimes(1);
      const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
      const captionsTrack = updated.tracks.find((t: Track) => t.name === 'Captions 1');
      expect(captionsTrack).toBeDefined();
    });
  });
});
