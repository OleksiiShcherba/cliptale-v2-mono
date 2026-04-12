import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { ProjectDoc, Clip } from '@ai-video-editor/project-schema';

import * as projectStore from '@/store/project-store';

import { useAddCaptionsToTimeline } from './useAddCaptionsToTimeline';
import { makeProject, TEST_SEGMENTS } from './useAddCaptionsToTimeline.fixtures';

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

// ── Backward compatibility ────────────────────────────────────────────────────

describe('useAddCaptionsToTimeline — backward compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('produces text-overlay clips for segments without words property', () => {
    mockGetSnapshot.mockReturnValue(makeProject(30));

    const { result } = renderHook(() => useAddCaptionsToTimeline());
    act(() => result.current.addCaptionsToTimeline(TEST_SEGMENTS));

    const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
    const clips = updated.clips;

    expect(clips.every((c: Clip) => c.type === 'text-overlay')).toBe(true);
  });

  it('produces mixed clip types for a mixed segment array', () => {
    mockGetSnapshot.mockReturnValue(makeProject(30));

    const mixedSegments = [
      { start: 0.0, end: 2.5, text: 'No words — text-overlay' },
      {
        start: 2.5,
        end: 5.0,
        text: 'Has words — caption',
        words: [
          { word: 'Has', start: 2.5, end: 3.0 },
          { word: 'words', start: 3.0, end: 5.0 },
        ],
      },
    ];

    const { result } = renderHook(() => useAddCaptionsToTimeline());
    act(() => result.current.addCaptionsToTimeline(mixedSegments));

    const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
    expect(updated.clips[0]?.type).toBe('text-overlay');
    expect(updated.clips[1]?.type).toBe('caption');
  });

  it('text-overlay clips retain correct text and frame math when words are absent', () => {
    mockGetSnapshot.mockReturnValue(makeProject(24));

    // Verify that at 24fps, existing behavior is unchanged
    const segment = { start: 0.0, end: 2.0, text: 'Old caption' };

    const { result } = renderHook(() => useAddCaptionsToTimeline());
    act(() => result.current.addCaptionsToTimeline([segment]));

    const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
    const clip = updated.clips[0];

    expect(clip).toMatchObject({
      type: 'text-overlay',
      startFrame: 0,
      durationFrames: 48, // 2.0 * 24 = 48
      text: 'Old caption',
      color: '#FFFFFF',
    });
  });
});
