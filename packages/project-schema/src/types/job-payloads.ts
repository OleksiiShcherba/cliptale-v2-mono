/**
 * Shared job payload types for BullMQ queues.
 * Imported by both the API (enqueue side) and the workers (consume side)
 * to avoid duplication across app boundaries.
 */

/** Payload for a `media-ingest` job — carries everything the worker needs to process an asset. */
export type MediaIngestJobPayload = {
  assetId: string;
  storageUri: string;
  contentType: string;
};

/** Payload for a `transcription` job — carries everything the worker needs to transcribe an asset via Whisper. */
export type TranscriptionJobPayload = {
  assetId: string;
  storageUri: string;
  contentType: string;
  language?: string;
};

/** A single Whisper transcript segment with timing and text. */
export type CaptionSegment = {
  start: number;
  end: number;
  text: string;
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
