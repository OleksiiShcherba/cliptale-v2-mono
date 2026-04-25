import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { ProjectDoc, Clip, CaptionClip } from '@ai-video-editor/project-schema';

import * as projectStore from '@/store/project-store';

import { useAddCaptionsToTimeline } from './useAddCaptionsToTimeline';
import { makeProject, TEST_SEGMENTS_WITH_WORDS } from './useAddCaptionsToTimeline.fixtures';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/store/project-store', () => ({
  getSnapshot: vi.fn(),
  setProject: vi.fn(),
}));

vi.mock('crypto', () => ({
  randomUUID: vi.fn().mockReturnValue('clip-uuid-xxxx'),
}));

const mockGetSnapshot = vi.mocked(projectStore.getSnapshot);
const mockSetProject = vi.mocked(projectStore.setProject);

// ── Caption clip production ───────────────────────────────────────────────────

describe('useAddCaptionsToTimeline — caption clips (segments with words)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('produces caption clips (not text-overlay) when segment has words', () => {
    mockGetSnapshot.mockReturnValue(makeProject(30));

    const { result } = renderHook(() => useAddCaptionsToTimeline());
    act(() => result.current.addCaptionsToTimeline(TEST_SEGMENTS_WITH_WORDS));

    const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
    const captionClips = updated.clips.filter((c: Clip) => c.type === 'caption');
    const textOverlayClips = updated.clips.filter((c: Clip) => c.type === 'text-overlay');

    expect(captionClips).toHaveLength(2);
    expect(textOverlayClips).toHaveLength(0);
  });

  it('converts word timestamps to frames correctly at 30fps', () => {
    mockGetSnapshot.mockReturnValue(makeProject(30));

    const { result } = renderHook(() => useAddCaptionsToTimeline());
    act(() => result.current.addCaptionsToTimeline([TEST_SEGMENTS_WITH_WORDS[0]!]));

    const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
    const captionClip = updated.clips.find((c: Clip) => c.type === 'caption') as CaptionClip | undefined;

    expect(captionClip).toBeDefined();
    // word 'Hello': start=0.0 → startFrame=0, end=1.0 → endFrame=30
    expect(captionClip?.words[0]).toMatchObject({ word: 'Hello', startFrame: 0, endFrame: 30 });
    // word 'world': start=1.1 → startFrame=33, end=2.5 → endFrame=75 (capped to segment end)
    expect(captionClip?.words[1]).toMatchObject({ word: 'world', startFrame: 33, endFrame: 75 });
  });

  it('sets correct segment-level frame properties on caption clips', () => {
    mockGetSnapshot.mockReturnValue(makeProject(30));

    const { result } = renderHook(() => useAddCaptionsToTimeline());
    act(() => result.current.addCaptionsToTimeline([TEST_SEGMENTS_WITH_WORDS[0]!]));

    const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
    const captionClip = updated.clips.find((c: Clip) => c.type === 'caption') as CaptionClip | undefined;

    // Segment: start=0.0, end=2.5 at 30fps → startFrame=0, durationFrames=75
    expect(captionClip?.startFrame).toBe(0);
    expect(captionClip?.durationFrames).toBe(75);
  });

  it('sets default activeColor and inactiveColor', () => {
    mockGetSnapshot.mockReturnValue(makeProject(30));

    const { result } = renderHook(() => useAddCaptionsToTimeline());
    act(() => result.current.addCaptionsToTimeline([TEST_SEGMENTS_WITH_WORDS[0]!]));

    const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
    const captionClip = updated.clips.find((c: Clip) => c.type === 'caption') as CaptionClip | undefined;

    expect(captionClip?.activeColor).toBe('#FFFFFF');
    expect(captionClip?.inactiveColor).toBe('rgba(255,255,255,0.35)');
  });

  it('caps last word endFrame to segment endFrame to prevent 1-frame gap', () => {
    mockGetSnapshot.mockReturnValue(makeProject(30));

    // Last word ends after segment end (due to floating point rounding)
    const segmentWithOverrun = {
      start: 0.0,
      end: 2.0,
      text: 'Over run',
      words: [
        { word: 'Over', start: 0.0, end: 1.0 },
        { word: 'run', start: 1.0, end: 2.1 }, // ends past segment end
      ],
    };

    const { result } = renderHook(() => useAddCaptionsToTimeline());
    act(() => result.current.addCaptionsToTimeline([segmentWithOverrun]));

    const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
    const captionClip = updated.clips.find((c: Clip) => c.type === 'caption') as CaptionClip | undefined;

    // Segment endFrame = startFrame(0) + durationFrames(60) = 60
    // Last word 'run' end=2.1 → Math.round(2.1*30)=63, but capped to 60
    expect(captionClip?.words[1]?.endFrame).toBe(60);
  });

  it('falls back to TextOverlayClip when segment has empty words array', () => {
    mockGetSnapshot.mockReturnValue(makeProject(30));

    const segmentEmptyWords = { start: 0.0, end: 2.5, text: 'No words', words: [] };

    const { result } = renderHook(() => useAddCaptionsToTimeline());
    act(() => result.current.addCaptionsToTimeline([segmentEmptyWords]));

    const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
    const clip = updated.clips[0];

    expect(clip?.type).toBe('text-overlay');
  });
});
