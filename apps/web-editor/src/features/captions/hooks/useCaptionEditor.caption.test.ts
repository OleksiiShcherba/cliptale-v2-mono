import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCaptionEditor } from './useCaptionEditor';

vi.mock('@/store/project-store', () => ({
  getSnapshot: vi.fn(),
  setProject: vi.fn(),
}));

import type { CaptionClip, Clip, ProjectDoc } from '@ai-video-editor/project-schema';
import * as projectStore from '@/store/project-store';

import { CLIP_ID, makeCaptionClip, makeProject } from './useCaptionEditor.fixtures';

const mockGetSnapshot = vi.mocked(projectStore.getSnapshot);
const mockSetProject = vi.mocked(projectStore.setProject);

describe('useCaptionEditor — caption clip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('return type discriminant', () => {
    it('returns type === "caption" for a CaptionClip', () => {
      const clip = makeCaptionClip();
      mockGetSnapshot.mockReturnValue(makeProject([clip as unknown as Clip]));

      const { result } = renderHook(() => useCaptionEditor(clip));
      expect(result.current.type).toBe('caption');
    });

    it('exposes setActiveColor and setInactiveColor for a CaptionClip', () => {
      const clip = makeCaptionClip();
      mockGetSnapshot.mockReturnValue(makeProject([clip as unknown as Clip]));

      const { result } = renderHook(() => useCaptionEditor(clip));
      expect(typeof (result.current as { setActiveColor?: unknown }).setActiveColor).toBe('function');
      expect(typeof (result.current as { setInactiveColor?: unknown }).setInactiveColor).toBe('function');
    });

    it('does not expose setText for a CaptionClip', () => {
      const clip = makeCaptionClip();
      mockGetSnapshot.mockReturnValue(makeProject([clip as unknown as Clip]));

      const { result } = renderHook(() => useCaptionEditor(clip));
      expect((result.current as { setText?: unknown }).setText).toBeUndefined();
    });
  });

  describe('setActiveColor', () => {
    it('updates activeColor of the target caption clip', () => {
      const clip = makeCaptionClip({ activeColor: '#FFFFFF' });
      mockGetSnapshot.mockReturnValue(makeProject([clip as unknown as Clip]));

      const { result } = renderHook(() => useCaptionEditor(clip));
      const setters = result.current as { setActiveColor: (c: string) => void };
      act(() => setters.setActiveColor('#7C3AED'));

      const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
      const updatedClip = updated.clips.find((c) => c.id === CLIP_ID) as CaptionClip;
      expect(updatedClip.activeColor).toBe('#7C3AED');
    });
  });

  describe('setInactiveColor', () => {
    it('updates inactiveColor of the target caption clip', () => {
      const clip = makeCaptionClip({ inactiveColor: 'rgba(255,255,255,0.35)' });
      mockGetSnapshot.mockReturnValue(makeProject([clip as unknown as Clip]));

      const { result } = renderHook(() => useCaptionEditor(clip));
      const setters = result.current as { setInactiveColor: (c: string) => void };
      act(() => setters.setInactiveColor('rgba(255,255,255,0.5)'));

      const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
      const updatedClip = updated.clips.find((c) => c.id === CLIP_ID) as CaptionClip;
      expect(updatedClip.inactiveColor).toBe('rgba(255,255,255,0.5)');
    });
  });

  describe('setFontSize', () => {
    it('updates fontSize of the target caption clip', () => {
      const clip = makeCaptionClip({ fontSize: 24 });
      mockGetSnapshot.mockReturnValue(makeProject([clip as unknown as Clip]));

      const { result } = renderHook(() => useCaptionEditor(clip));
      act(() => result.current.setFontSize(36));

      const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
      const updatedClip = updated.clips.find((c) => c.id === CLIP_ID) as CaptionClip;
      expect(updatedClip.fontSize).toBe(36);
    });
  });

  describe('setPosition', () => {
    it('updates position of the target caption clip', () => {
      const clip = makeCaptionClip({ position: 'bottom' });
      mockGetSnapshot.mockReturnValue(makeProject([clip as unknown as Clip]));

      const { result } = renderHook(() => useCaptionEditor(clip));
      act(() => result.current.setPosition('top'));

      const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
      const updatedClip = updated.clips.find((c) => c.id === CLIP_ID) as CaptionClip;
      expect(updatedClip.position).toBe('top');
    });
  });

  describe('setEndFrame', () => {
    it('computes durationFrames from endFrame for caption clip', () => {
      const clip = makeCaptionClip({ startFrame: 10, durationFrames: 20 });
      mockGetSnapshot.mockReturnValue(makeProject([clip as unknown as Clip]));

      const { result } = renderHook(() => useCaptionEditor(clip));
      act(() => result.current.setEndFrame(40));

      const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
      const updatedClip = updated.clips.find((c) => c.id === CLIP_ID) as CaptionClip;
      expect(updatedClip.durationFrames).toBe(30);
    });

    it('clamps durationFrames to minimum 1 for caption clip', () => {
      const clip = makeCaptionClip({ startFrame: 10, durationFrames: 20 });
      mockGetSnapshot.mockReturnValue(makeProject([clip as unknown as Clip]));

      const { result } = renderHook(() => useCaptionEditor(clip));
      act(() => result.current.setEndFrame(5));

      const updated = mockSetProject.mock.calls[0]![0] as ProjectDoc;
      const updatedClip = updated.clips.find((c) => c.id === CLIP_ID) as CaptionClip;
      expect(updatedClip.durationFrames).toBe(1);
    });
  });
});
