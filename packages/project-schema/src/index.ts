export type { FileKind } from './file-kind.js';
export { mimeToKind } from './file-kind.js';
export { projectDocSchema } from './schemas/project-doc.schema.js';
export { trackSchema } from './schemas/track.schema.js';
export { clipSchema, videoClipSchema, audioClipSchema, textOverlayClipSchema, imageClipSchema, captionClipSchema } from './schemas/clip.schema.js';
export {
  promptDocSchema,
  promptBlockSchema,
  draftSettingsSchema,
  draftVideoLengthSecondsSchema,
  draftAspectRatioSchema,
  draftStyleKeySchema,
} from './schemas/promptDoc.schema.js';
export {
  STORYBOARD_PLAN_SCHEMA_VERSION,
  STORYBOARD_PLAN_TARGET_SCENE_DURATION_SECONDS,
  STORYBOARD_PLAN_MIN_SCENE_COUNT,
  STORYBOARD_PLAN_MAX_SCENE_COUNT,
  STORYBOARD_PLAN_DURATION_TOLERANCE_SECONDS,
  STORYBOARD_PLAN_DEFAULT_VIDEO_LENGTH_SECONDS,
  STORYBOARD_PLAN_DEFAULT_STYLE_KEY,
  storyboardPlanReferencedMediaSchema,
  storyboardPlanSceneSchema,
  storyboardPlanJobStatusSchema,
  storyboardPlanSchema,
  storyboardPlanJobResultSchema,
  deriveStoryboardSceneCount,
  resolveStoryboardPlanVideoLengthSeconds,
  resolveStoryboardPlanStyleKey,
} from './schemas/storyboardPlan.schema.js';
export type { ProjectDoc, Track, Clip, VideoClip, AudioClip, TextOverlayClip, ImageClip, CaptionClip } from './types/index.js';
export type {
  PromptDoc,
  PromptBlock,
  TextBlock,
  MediaRefBlock,
  DraftSettings,
  DraftVideoLengthSeconds,
  DraftAspectRatio,
  DraftStyleKey,
} from './schemas/promptDoc.schema.js';
export type {
  StoryboardPlanReferencedMedia,
  StoryboardPlanScene,
  StoryboardPlan,
  StoryboardPlanJobStatus,
  StoryboardPlanJobResult,
} from './schemas/storyboardPlan.schema.js';
export type {
  MediaIngestJobPayload,
  TranscriptionJobPayload,
  CaptionWord,
  CaptionSegment,
  RenderPresetKey,
  RenderPreset,
  RenderVideoJobPayload,
  EnhancePromptJobPayload,
  StoryboardPlanJobPayload,
} from './types/job-payloads.js';
