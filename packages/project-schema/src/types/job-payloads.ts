/**
 * Shared job payload types for BullMQ queues.
 * Imported by both the API (enqueue side) and the workers (consume side)
 * to avoid duplication across app boundaries.
 */

import type { PromptDoc } from '../schemas/promptDoc.schema.js';

/**
 * Payload for a `media-ingest` job — carries everything the worker needs to process an asset.
 *
 * One of `fileId` or `assetId` must be provided:
 * - `fileId` is the primary identifier for the new `files`-table path.
 * - `assetId` is retained for the AI-generation worker legacy path that writes to `project_assets_current`.
 * Once the legacy AI-generation path is removed, `assetId` will be deleted from this type.
 */
export type MediaIngestJobPayload = {
  /** New `files` table row ID — the primary identifier; used as the BullMQ jobId for deduplication. */
  fileId?: string;
  storageUri: string;
  contentType: string;
  /** Legacy asset row ID — only present for `project_assets_current` ingest jobs from the AI generation worker. */
  assetId?: string;
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
