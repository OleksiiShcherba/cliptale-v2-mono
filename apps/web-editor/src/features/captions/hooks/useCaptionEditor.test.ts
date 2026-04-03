import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { useCaptionEditor } from './useCaptionEditor';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/store/project-store', () => ({
  getSnapshot: vi.fn(),
  setProject: vi.fn(),
}));

import * as projectStore from '@/store/project-store';
import type { ProjectDoc, Track, Clip, TextOverlayClip } from '@ai-video-editor/project-schema';

const mockGetSnapshot = vi.mocked(projectStore.getSnapshot);
const mockSetProject = vi.mocked(projectStore.setProject);

// ── Fixtures ───────────────────────────────────────────────────────────────────

const CLIP_ID = '00000000-0000-0000-0000-000000000020';
const TRACK_ID = '00000000-0000-0000-0000-000000000010';

function makeClip(overrides: Partial<TextOverlayClip> = {}): TextOverlayClip {
  return {
    id: CLIP_ID,
    type: 'text-overlay',
    trackId: TRACK_ID,
    startFrame: 10,
    durationFrames: 50,
    text: 'Hello',
    fontSize: 24,
    color: '#FFFFFF',
    position: 'bottom',
    ...overrides,
  };
}

function makeProject(clips: Clip[] = [], overrides: Partial<ProjectDoc> = {}): ProjectDoc {
  return {
    schemaVersion: 1,
    id: 'proj-001',
    title: 'Test',
    fps: 30,
    durationFrames: 300,
    width: 1920,
    height: 1080,
    tracks: [{ id: TRACK_ID, type: 'overlay', name: 'Captions', muted: false, locked: false }] as Track[],
    clips,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as unknown as ProjectDoc;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useCaptionEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('setText', () => {
    it('updates the text field of the target clip', () => {
      const clip = makeClip();
      mockGetSnapshot.mockReturnValue(makeProject([clip]));

      const { result } = renderHook(() => useCaptionEditor(clip));
      act(() => result.current.setText('New caption'));

      const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
      const updatedClip = updated.clips.find((c) => c.id === CLIP_ID) as TextOverlayClip;
      expect(updatedClip.text).toBe('New caption');
    });

    it('preserves all other fields when updating text', () => {
      const clip = makeClip({ fontSize: 32, color: '#FF0000' });
      mockGetSnapshot.mockReturnValue(makeProject([clip]));

      const { result } = renderHook(() => useCaptionEditor(clip));
      act(() => result.current.setText('Changed'));

      const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
      const updatedClip = updated.clips.find((c) => c.id === CLIP_ID) as TextOverlayClip;
      expect(updatedClip.fontSize).toBe(32);
      expect(updatedClip.color).toBe('#FF0000');
    });
  });

  describe('setStartFrame', () => {
    it('updates startFrame of the target clip', () => {
      const clip = makeClip({ startFrame: 0 });
      mockGetSnapshot.mockReturnValue(makeProject([clip]));

      const { result } = renderHook(() => useCaptionEditor(clip));
      act(() => result.current.setStartFrame(15));

      const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
      const updatedClip = updated.clips.find((c) => c.id === CLIP_ID) as TextOverlayClip;
      expect(updatedClip.startFrame).toBe(15);
    });
  });

  describe('setEndFrame', () => {
    it('computes durationFrames = endFrame - startFrame', () => {
      const clip = makeClip({ startFrame: 10, durationFrames: 20 });
      mockGetSnapshot.mockReturnValue(makeProject([clip]));

      const { result } = renderHook(() => useCaptionEditor(clip));
      act(() => result.current.setEndFrame(40)); // endFrame=40, startFrame=10 → durationFrames=30

      const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
      const updatedClip = updated.clips.find((c) => c.id === CLIP_ID) as TextOverlayClip;
      expect(updatedClip.durationFrames).toBe(30);
    });

    it('clamps durationFrames to minimum 1 when endFrame <= startFrame', () => {
      const clip = makeClip({ startFrame: 10, durationFrames: 20 });
      mockGetSnapshot.mockReturnValue(makeProject([clip]));

      const { result } = renderHook(() => useCaptionEditor(clip));
      act(() => result.current.setEndFrame(5)); // endFrame=5, startFrame=10 → durationFrames=max(1,-5)=1

      const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
      const updatedClip = updated.clips.find((c) => c.id === CLIP_ID) as TextOverlayClip;
      expect(updatedClip.durationFrames).toBe(1);
    });

    it('clamps durationFrames to minimum 1 when endFrame equals startFrame', () => {
      const clip = makeClip({ startFrame: 10, durationFrames: 20 });
      mockGetSnapshot.mockReturnValue(makeProject([clip]));

      const { result } = renderHook(() => useCaptionEditor(clip));
      act(() => result.current.setEndFrame(10)); // endFrame=10, startFrame=10 → durationFrames=max(1,0)=1

      const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
      const updatedClip = updated.clips.find((c) => c.id === CLIP_ID) as TextOverlayClip;
      expect(updatedClip.durationFrames).toBe(1);
    });

    it('reads startFrame from the latest snapshot (not stale closure)', () => {
      // Simulate the case where startFrame was updated between renders
      const clip = makeClip({ startFrame: 5, durationFrames: 10 });
      // Snapshot has startFrame=20 (updated by a prior action)
      const updatedClip = makeClip({ startFrame: 20, durationFrames: 10 });
      mockGetSnapshot.mockReturnValue(makeProject([updatedClip]));

      const { result } = renderHook(() => useCaptionEditor(clip));
      act(() => result.current.setEndFrame(30)); // uses snapshot startFrame=20 → durationFrames=10

      const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
      const resultClip = updated.clips.find((c) => c.id === CLIP_ID) as TextOverlayClip;
      expect(resultClip.durationFrames).toBe(10);
    });
  });

  describe('setFontSize', () => {
    it('updates fontSize of the target clip', () => {
      const clip = makeClip({ fontSize: 24 });
      mockGetSnapshot.mockReturnValue(makeProject([clip]));

      const { result } = renderHook(() => useCaptionEditor(clip));
      act(() => result.current.setFontSize(36));

      const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
      const updatedClip = updated.clips.find((c) => c.id === CLIP_ID) as TextOverlayClip;
      expect(updatedClip.fontSize).toBe(36);
    });
  });

  describe('setColor', () => {
    it('updates color of the target clip', () => {
      const clip = makeClip({ color: '#FFFFFF' });
      mockGetSnapshot.mockReturnValue(makeProject([clip]));

      const { result } = renderHook(() => useCaptionEditor(clip));
      act(() => result.current.setColor('#7C3AED'));

      const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
      const updatedClip = updated.clips.find((c) => c.id === CLIP_ID) as TextOverlayClip;
      expect(updatedClip.color).toBe('#7C3AED');
    });
  });

  describe('setPosition', () => {
    it('updates position to "top"', () => {
      const clip = makeClip({ position: 'bottom' });
      mockGetSnapshot.mockReturnValue(makeProject([clip]));

      const { result } = renderHook(() => useCaptionEditor(clip));
      act(() => result.current.setPosition('top'));

      const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
      const updatedClip = updated.clips.find((c) => c.id === CLIP_ID) as TextOverlayClip;
      expect(updatedClip.position).toBe('top');
    });

    it('updates position to "center"', () => {
      const clip = makeClip({ position: 'bottom' });
      mockGetSnapshot.mockReturnValue(makeProject([clip]));

      const { result } = renderHook(() => useCaptionEditor(clip));
      act(() => result.current.setPosition('center'));

      const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
      const updatedClip = updated.clips.find((c) => c.id === CLIP_ID) as TextOverlayClip;
      expect(updatedClip.position).toBe('center');
    });

    it('updates position to "bottom"', () => {
      const clip = makeClip({ position: 'top' });
      mockGetSnapshot.mockReturnValue(makeProject([clip]));

      const { result } = renderHook(() => useCaptionEditor(clip));
      act(() => result.current.setPosition('bottom'));

      const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
      const updatedClip = updated.clips.find((c) => c.id === CLIP_ID) as TextOverlayClip;
      expect(updatedClip.position).toBe('bottom');
    });
  });

  describe('store isolation', () => {
    it('only mutates the target clip, not other clips', () => {
      const clip = makeClip();
      const otherId = '00000000-0000-0000-0000-000000000099';
      const otherClip: TextOverlayClip = {
        ...makeClip(),
        id: otherId,
        text: 'Other',
      };
      mockGetSnapshot.mockReturnValue(makeProject([clip, otherClip as Clip]));

      const { result } = renderHook(() => useCaptionEditor(clip));
      act(() => result.current.setText('Updated target'));

      const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
      const other = updated.clips.find((c) => c.id === otherId) as TextOverlayClip;
      expect(other.text).toBe('Other');
    });
  });
});
