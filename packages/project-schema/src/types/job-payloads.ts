/**
 * Shared job payload types for BullMQ queues.
 * Imported by both the API (enqueue side) and the workers (consume side)
 * to avoid duplication across app boundaries.
 */

import type { PromptDoc } from '../schemas/promptDoc.schema.js';

/**
 * Payload for a `media-ingest` job — carries everything the worker needs to process an asset.
 *
 * `fileId` is the primary identifier for the `files`-table row that the worker
 * will update once FFprobe metadata has been extracted.
 */
export type MediaIngestJobPayload = {
  /** `files` table row ID — the primary identifier; used as the BullMQ jobId for deduplication. */
  fileId: string;
  storageUri: string;
  contentType: string;
};

/** Payload for a `transcription` job — carries everything the worker needs to transcribe an asset via Whisper. */
export type TranscriptionJobPayload = {
  fileId: string;
  storageUri: string;
  contentType: string;
  language?: string;
};

/** A single word-level timestamp entry from Whisper verbose_json output. */
export type CaptionWord = {
  word: string;
  start: number;
  end: number;
};

/** A single Whisper transcript segment with timing and text. */
export type CaptionSegment = {
  start: number;
  end: number;
  text: string;
  /** Optional word-level timestamps from Whisper verbose_json output. Present only for segments
   * transcribed after word-level extraction was added. Existing DB rows without this field
   * deserialize correctly since the field is optional. */
  words?: CaptionWord[];
};

/**
 * Allowed render presets that the service validates against.
 * Each preset uniquely identifies a resolution + fps + format combination.
 */
export type RenderPresetKey = '1080p' | '4k' | '720p' | 'vertical' | 'square' | 'webm';

/** Render preset configuration — validated server-side before the job is created. */
export type RenderPreset = {
  /** Preset identifier matching one of the allowed keys. */
  key: RenderPresetKey;
  width: number;
  height: number;
  fps: number;
  /** Output container format. */
  format: 'mp4' | 'webm';
  /** Video codec used by Remotion renderMedia(). */
  codec: 'h264' | 'vp8';
};

/** Payload for a `render` BullMQ job — carries everything the render-worker needs to produce the video. */
export type RenderVideoJobPayload = {
  /** Unique job identifier (matches render_jobs.job_id). */
  jobId: string;
  projectId: string;
  /** Version snapshot to render — must be locked at request time. */
  versionId: number;
  /** User who triggered the render (may be null for anonymous). */
  requestedBy: string | null;
  /** Resolved preset configuration (not just the key). */
  preset: RenderPreset;
};

/**
 * Payload for an `ai-enhance` BullMQ job — carries the draft, user context,
 * and the prompt document to be rewritten by the LLM.
 *
 * The worker receives the full PromptDoc so it can perform the
 * sentinel-splice strategy without an extra DB read.
 */
export type EnhancePromptJobPayload = {
  /** The generation draft this enhancement belongs to. */
  draftId: string;
  /** The user who initiated the enhancement. */
  userId: string;
  /** The current prompt document to be rewritten. */
  promptDoc: PromptDoc;
};

/**
 * Payload for a `storyboard-plan` BullMQ job.
 *
 * The worker fetches the current draft/media state from durable storage using
 * these identifiers. The API persists the queued job row before enqueueing.
 */
export type StoryboardPlanJobPayload = {
  /** Unique job identifier, matching storyboard_plan_jobs.job_id. */
  jobId: string;
  /** Generation draft being planned. */
  draftId: string;
  /** User who initiated planning. */
  userId: string;
};

/**
 * Scene illustrations are the only storyboard-openai-image jobs: the legacy
 * draft-level 'style_reference' (principal image) kind was retired by
 * scene-generation-reference-gate (ADR-0004) — no producer enqueues it.
 */
export type StoryboardOpenAIImageJobKind = 'scene';

export type StoryboardOpenAIImageSize =
  | '1024x1024'
  | '1536x1024'
  | '1024x1536'
  | 'auto';

/**
 * Payload for an `ai-generate` BullMQ job — unified provider dispatcher.
 *
 * Defined here (packages/project-schema) so it is shared between the API
 * (enqueue side) and the media-worker (consume side) without cross-app imports.
 *
 * `flowId` and `blockId` are optional back-links added by the generate-ai-flow
 * feature (T4 / AC-10 / ADR-0001) so the worker can write the `flow_files` link
 * on success and so the UI can reattach by block on reopen (AC-08b).
 * Both fields mirror the nullable `flow_id`/`block_id` columns on
 * `ai_generation_jobs` (migration 048).
 */
export type AiGenerateJobPayload = {
  /** Unique job identifier, matching ai_generation_jobs.job_id. */
  jobId: string;
  /** The user who initiated the generation. */
  userId: string;
  /** Catalog model id, matching ai_generation_jobs.model_id. */
  modelId: string;
  /** Provider capability discriminant (image / video / audio / …). */
  capability: string;
  /** Provider router key so the worker branches without re-deriving from capability. */
  provider: string;
  /** Primary text prompt forwarded to the provider. */
  prompt: string;
  /** Model-specific options forwarded as the provider payload options object. */
  options: Record<string, unknown>;
  /**
   * Optional: the generation_flows.flow_id that triggered this run.
   * Present only when the job was enqueued from the Generate AI canvas (AC-10).
   * No FK — the job lifecycle is independent of the flow (ADR-0001).
   */
  flowId?: string;
  /**
   * Optional: the canvas generation-block id (lives inside generation_flows.canvas JSON).
   * Lets the UI reattach a job to its result block on reopen (AC-08b).
   */
  blockId?: string;
};

/**
 * Payload for direct OpenAI Images storyboard illustration jobs.
 *
 * The worker owns the OpenAI API key and resolves file IDs into durable object
 * storage reads. API services should validate/orchestrate, persist an
 * `ai_generation_jobs` row, then enqueue this payload with the same `jobId`.
 */
export type StoryboardOpenAIImageJobPayload = {
  /** Unique job identifier, matching ai_generation_jobs.job_id. */
  jobId: string;
  /** User who initiated the image job. */
  userId: string;
  /** Generation draft owning the output file link. */
  draftId: string;
  /** Scene illustration (the retired principal-image kind no longer exists). */
  kind: StoryboardOpenAIImageJobKind;
  /** Scene block being illustrated. */
  blockId?: string;
  /** Prompt sent to the OpenAI Images API. */
  prompt: string;
  /** File IDs used as image-edit inputs. Empty means text-to-image. */
  referenceFileIds: string[];
  /** Optional previous scene output used as an additional continuity input. */
  previousSceneFileId?: string;
  /** Requested output size/aspect. Defaults to auto in the worker. */
  size?: StoryboardOpenAIImageSize;
};
