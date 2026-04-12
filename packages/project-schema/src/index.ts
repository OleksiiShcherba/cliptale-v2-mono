export { projectDocSchema } from './schemas/project-doc.schema.js';
export { trackSchema } from './schemas/track.schema.js';
export { clipSchema, videoClipSchema, audioClipSchema, textOverlayClipSchema, imageClipSchema, captionClipSchema } from './schemas/clip.schema.js';
export type { ProjectDoc, Track, Clip, VideoClip, AudioClip, TextOverlayClip, ImageClip, CaptionClip } from './types/index.js';
export type {
  MediaIngestJobPayload,
  TranscriptionJobPayload,
  CaptionWord,
  CaptionSegment,
  RenderPresetKey,
  RenderPreset,
  RenderVideoJobPayload,
} from './types/job-payloads.js';
