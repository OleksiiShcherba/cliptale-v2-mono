import { describe, it, expect } from 'vitest';
import {
  EmptyTimeline,
  SingleVideoClip,
  AudioAndVideo,
  OverlappingClips,
  TextOverlay,
} from './VideoComposition.stories.js';

// ---------------------------------------------------------------------------
// UUID pattern — matches the format required by the clip schemas (fileId).
// ---------------------------------------------------------------------------
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Local type for story args once we know they are fully populated.
// StoryObj.args is Partial<Props> (Storybook convention), so we assert the
// full shape after reading .args! to keep downstream helpers type-safe.
// ---------------------------------------------------------------------------
type StoryArgs = {
  projectDoc: { clips: Array<Record<string, unknown>> };
  assetUrls: Record<string, string>;
};

/** Narrows story.args (Partial) to the fully-required StoryArgs shape. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function argsOf(story: { args?: Record<string, any> }): StoryArgs {
  return story.args as unknown as StoryArgs;
}

/** Returns all clips in the story args that carry a fileId field. */
function clipsWithFileId(args: StoryArgs): Array<{ id: string; fileId: string }> {
  return args.projectDoc.clips.filter((c) => 'fileId' in c) as Array<{
    id: string;
    fileId: string;
  }>;
}

describe('VideoComposition.stories — fixture integrity', () => {
  describe('EmptyTimeline', () => {
    it('should have no clips and empty assetUrls', () => {
      const args = argsOf(EmptyTimeline);
      expect(args.projectDoc.clips).toHaveLength(0);
      expect(args.assetUrls).toEqual({});
    });
  });

  describe('SingleVideoClip', () => {
    it('should use fileId (not assetId) on every clip', () => {
      const args = argsOf(SingleVideoClip);
      for (const clip of args.projectDoc.clips) {
        expect(clip).not.toHaveProperty('assetId');
        if (clip['type'] === 'video' || clip['type'] === 'audio' || clip['type'] === 'image') {
          expect(clip['fileId']).toBeDefined();
        }
      }
    });

    it('should have fileIds that are valid UUIDs', () => {
      const args = argsOf(SingleVideoClip);
      for (const clip of clipsWithFileId(args)) {
        expect(clip.fileId).toMatch(UUID_PATTERN);
      }
    });

    it('should have assetUrls keys that match every clip fileId', () => {
      const args = argsOf(SingleVideoClip);
      for (const clip of clipsWithFileId(args)) {
        expect(args.assetUrls).toHaveProperty(clip.fileId);
        expect(args.assetUrls[clip.fileId]).toBeTruthy();
      }
    });
  });

  describe('AudioAndVideo', () => {
    it('should use fileId on both video and audio clips', () => {
      const args = argsOf(AudioAndVideo);
      const videoClip = args.projectDoc.clips.find((c) => c['type'] === 'video');
      const audioClip = args.projectDoc.clips.find((c) => c['type'] === 'audio');
      expect(videoClip).not.toHaveProperty('assetId');
      expect(audioClip).not.toHaveProperty('assetId');
      expect(videoClip?.['fileId']).toMatch(UUID_PATTERN);
      expect(audioClip?.['fileId']).toMatch(UUID_PATTERN);
    });

    it('should have distinct fileIds for video and audio clips', () => {
      const args = argsOf(AudioAndVideo);
      const videoClip = args.projectDoc.clips.find((c) => c['type'] === 'video');
      const audioClip = args.projectDoc.clips.find((c) => c['type'] === 'audio');
      expect(videoClip?.['fileId']).not.toBe(audioClip?.['fileId']);
    });

    it('should have assetUrls keys matching all clip fileIds', () => {
      const args = argsOf(AudioAndVideo);
      for (const clip of clipsWithFileId(args)) {
        expect(args.assetUrls).toHaveProperty(clip.fileId);
        expect(args.assetUrls[clip.fileId]).toBeTruthy();
      }
    });
  });

  describe('OverlappingClips', () => {
    it('should use fileId on all clips without assetId', () => {
      const args = argsOf(OverlappingClips);
      for (const clip of args.projectDoc.clips) {
        expect(clip).not.toHaveProperty('assetId');
      }
    });

    it('should have assetUrls keys matching every clip fileId', () => {
      const args = argsOf(OverlappingClips);
      for (const clip of clipsWithFileId(args)) {
        expect(args.assetUrls).toHaveProperty(clip.fileId);
      }
    });
  });

  describe('TextOverlay', () => {
    it('should use fileId on the video clip and have no assetId', () => {
      const args = argsOf(TextOverlay);
      const videoClip = args.projectDoc.clips.find((c) => c['type'] === 'video');
      expect(videoClip).not.toHaveProperty('assetId');
      expect(videoClip?.['fileId']).toMatch(UUID_PATTERN);
    });

    it('should have assetUrls key matching the video clip fileId', () => {
      const args = argsOf(TextOverlay);
      for (const clip of clipsWithFileId(args)) {
        expect(args.assetUrls).toHaveProperty(clip.fileId);
      }
    });

    it('should have the text-overlay clip without assetId or fileId', () => {
      const args = argsOf(TextOverlay);
      const textClip = args.projectDoc.clips.find((c) => c['type'] === 'text-overlay');
      expect(textClip).toBeDefined();
      expect(textClip).not.toHaveProperty('assetId');
      expect(textClip).not.toHaveProperty('fileId');
    });
  });
});
