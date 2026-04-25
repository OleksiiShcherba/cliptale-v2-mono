import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCaptionEditor } from './useCaptionEditor';

vi.mock('@/store/project-store', () => ({
  getSnapshot: vi.fn(),
  setProject: vi.fn(),
}));

import type { Clip, ProjectDoc, TextOverlayClip } from '@ai-video-editor/project-schema';
import * as projectStore from '@/store/project-store';

import { CLIP_ID, makeClip, makeProject } from './useCaptionEditor.fixtures';

const mockGetSnapshot = vi.mocked(projectStore.getSnapshot);
const mockSetProject = vi.mocked(projectStore.setProject);

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
      act(() => result.current.setEndFrame(40));

      const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
      const updatedClip = updated.clips.find((c) => c.id === CLIP_ID) as TextOverlayClip;
      expect(updatedClip.durationFrames).toBe(30);
    });

    it('clamps durationFrames to minimum 1 when endFrame <= startFrame', () => {
      const clip = makeClip({ startFrame: 10, durationFrames: 20 });
      mockGetSnapshot.mockReturnValue(makeProject([clip]));

      const { result } = renderHook(() => useCaptionEditor(clip));
      act(() => result.current.setEndFrame(5));

      const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
      const updatedClip = updated.clips.find((c) => c.id === CLIP_ID) as TextOverlayClip;
      expect(updatedClip.durationFrames).toBe(1);
    });

    it('clamps durationFrames to minimum 1 when endFrame equals startFrame', () => {
      const clip = makeClip({ startFrame: 10, durationFrames: 20 });
      mockGetSnapshot.mockReturnValue(makeProject([clip]));

      const { result } = renderHook(() => useCaptionEditor(clip));
      act(() => result.current.setEndFrame(10));

      const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
      const updatedClip = updated.clips.find((c) => c.id === CLIP_ID) as TextOverlayClip;
      expect(updatedClip.durationFrames).toBe(1);
    });

    it('reads startFrame from the latest snapshot (not stale closure)', () => {
      const clip = makeClip({ startFrame: 5, durationFrames: 10 });
      const updatedClip = makeClip({ startFrame: 20, durationFrames: 10 });
      mockGetSnapshot.mockReturnValue(makeProject([updatedClip]));

      const { result } = renderHook(() => useCaptionEditor(clip));
      act(() => result.current.setEndFrame(30));

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
    it.each([
      ['top' as const, 'bottom' as const],
      ['center' as const, 'bottom' as const],
      ['bottom' as const, 'top' as const],
    ])('updates position to "%s"', (target, initial) => {
      const clip = makeClip({ position: initial });
      mockGetSnapshot.mockReturnValue(makeProject([clip]));

      const { result } = renderHook(() => useCaptionEditor(clip));
      act(() => result.current.setPosition(target));

      const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
      const updatedClip = updated.clips.find((c) => c.id === CLIP_ID) as TextOverlayClip;
      expect(updatedClip.position).toBe(target);
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

  describe('return type discriminant for text-overlay', () => {
    it('returns type === "text-overlay" for a TextOverlayClip', () => {
      const clip = makeClip();
      mockGetSnapshot.mockReturnValue(makeProject([clip]));

      const { result } = renderHook(() => useCaptionEditor(clip));
      expect(result.current.type).toBe('text-overlay');
    });

    it('exposes setText and setColor for a TextOverlayClip', () => {
      const clip = makeClip();
      mockGetSnapshot.mockReturnValue(makeProject([clip]));

      const { result } = renderHook(() => useCaptionEditor(clip));
      expect(typeof (result.current as { setText?: unknown }).setText).toBe('function');
      expect(typeof (result.current as { setColor?: unknown }).setColor).toBe('function');
    });
  });
});
