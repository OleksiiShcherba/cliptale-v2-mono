// Mock project-schema package to avoid build artifact dependency in tests.
import { describe, it, expect, vi } from 'vitest';
vi.mock('@ai-video-editor/project-schema', () => ({}));

import { prepareClipsForComposition } from './VideoComposition.utils.js';
import {
  makeProjectDoc,
  TRACK_VIDEO,
  TRACK_AUDIO,
  CLIP_VIDEO,
  CLIP_AUDIO,
} from './VideoComposition.fixtures.js';

describe('prepareClipsForComposition', () => {
  describe('empty input', () => {
    it('returns empty array when there are no clips', () => {
      const doc = makeProjectDoc({ tracks: [], clips: [] });
      expect(prepareClipsForComposition(doc)).toHaveLength(0);
    });
  });

  describe('mute filtering', () => {
    it('excludes clips whose parent track is muted', () => {
      const mutedTrack = { ...TRACK_VIDEO, muted: true };
      const doc = makeProjectDoc({
        tracks: [mutedTrack],
        clips: [CLIP_VIDEO],
      });
      expect(prepareClipsForComposition(doc)).toHaveLength(0);
    });

    it('keeps clips from unmuted tracks when other tracks are muted', () => {
      const mutedAudio = { ...TRACK_AUDIO, muted: true };
      const doc = makeProjectDoc({
        tracks: [TRACK_VIDEO, mutedAudio],
        clips: [CLIP_VIDEO, CLIP_AUDIO],
      });
      const result = prepareClipsForComposition(doc);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(CLIP_VIDEO.id);
    });

    it('keeps all clips when no tracks are muted', () => {
      const doc = makeProjectDoc({
        tracks: [TRACK_VIDEO, TRACK_AUDIO],
        clips: [CLIP_VIDEO, CLIP_AUDIO],
      });
      expect(prepareClipsForComposition(doc)).toHaveLength(2);
    });
  });

  describe('z-order sorting', () => {
    it('sorts clips by their track array index ascending', () => {
      // tracks: [TRACK_VIDEO (0), TRACK_AUDIO (1)]
      // clips supplied in reverse order to verify sort
      const doc = makeProjectDoc({
        tracks: [TRACK_VIDEO, TRACK_AUDIO],
        clips: [CLIP_AUDIO, CLIP_VIDEO],
      });
      const result = prepareClipsForComposition(doc);
      expect(result[0].id).toBe(CLIP_VIDEO.id);  // track index 0
      expect(result[1].id).toBe(CLIP_AUDIO.id);  // track index 1
    });

    it('does not mutate the original clips array', () => {
      const clips = [CLIP_AUDIO, CLIP_VIDEO];
      const doc = makeProjectDoc({
        tracks: [TRACK_VIDEO, TRACK_AUDIO],
        clips,
      });
      prepareClipsForComposition(doc);
      // Original order must be preserved.
      expect(clips[0].id).toBe(CLIP_AUDIO.id);
      expect(clips[1].id).toBe(CLIP_VIDEO.id);
    });
  });

  describe('edge cases', () => {
    it('keeps clips whose trackId is not found in tracks (treats them as unmuted)', () => {
      // clip references a track that does not exist — should not crash and should be included
      const doc = makeProjectDoc({
        tracks: [],
        clips: [CLIP_VIDEO],
      });
      const result = prepareClipsForComposition(doc);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(CLIP_VIDEO.id);
    });
  });
});
