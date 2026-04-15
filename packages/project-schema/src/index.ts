export { projectDocSchema } from './schemas/project-doc.schema.js';
export { trackSchema } from './schemas/track.schema.js';
export { clipSchema, videoClipSchema, audioClipSchema, textOverlayClipSchema, imageClipSchema, captionClipSchema } from './schemas/clip.schema.js';
export { promptDocSchema, promptBlockSchema } from './schemas/promptDoc.schema.js';
export type { ProjectDoc, Track, Clip, VideoClip, AudioClip, TextOverlayClip, ImageClip, CaptionClip } from './types/index.js';
export type { PromptDoc, PromptBlock, TextBlock, MediaRefBlock } from './schemas/promptDoc.schema.js';
export type {
  MediaIngestJobPayload,
  TranscriptionJobPayload,
  CaptionWord,
  CaptionSegment,
  RenderPresetKey,
  RenderPreset,
  RenderVideoJobPayload,
} from './types/job-payloads.js';
