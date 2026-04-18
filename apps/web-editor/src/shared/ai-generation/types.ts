/**
 * AI generation feature types.
 *
 * Epic 9 replaced the type-first (image/video/audio) surface with a
 * model-first contract driven by the static fal.ai catalog. All model,
 * capability, and input-schema type definitions live in the shared
 * `@ai-video-editor/api-contracts` package; this file re-exports them
 * so components in `shared/ai-generation` can import from one place.
 */

export type {
  AiProvider,
  AiModel,
  AiCapability,
  FalModel,
  FalCapability,
  FalFieldType,
  FalFieldSchema,
  FalInputSchema,
  AiGroup,
  ElevenLabsModel,
  AudioCapability,
} from '@ai-video-editor/api-contracts';

export { CAPABILITY_TO_GROUP, AUDIO_CAPABILITY_TO_GROUP, AI_MODELS } from '@ai-video-editor/api-contracts';

import type { AiCapability, AiModel } from '@ai-video-editor/api-contracts';

/**
 * A single ElevenLabs voice from GET /ai/voices/available.
 * Shape mirrors the server-side `ElevenLabsVoice` in `apps/api/src/lib/elevenlabs-catalog.ts`.
 */
export type ElevenLabsVoice = {
  /** ElevenLabs voice_id — pass to TTS/S2S as the voice identifier. */
  voiceId: string;
  /** Human-readable display name. */
  name: string;
  /** Category returned by ElevenLabs (e.g. `"premade"`, `"cloned"`). */
  category: string;
  /** Optional freeform description; null when absent. */
  description: string | null;
  /** URL to the ElevenLabs-hosted MP3 preview sample. */
  previewUrl: string;
  /** Key-value labels (accent, gender, age, etc.). */
  labels: Record<string, string>;
};

/**
 * A cloned voice from the authenticated user's voice library (GET /ai/voices).
 * Shape mirrors the server-side `UserVoice` in `apps/api/src/repositories/voice.repository.ts`.
 */
export type UserVoice = {
  voiceId: string;
  userId: string;
  label: string;
  /** The ElevenLabs voice_id to pass to TTS/S2S. */
  elevenLabsVoiceId: string;
  createdAt: string;
};

/**
 * Response shape of GET /ai/models — mirrors the BE
 * `aiGeneration.service.ts#listModels` return type.
 */
export type ListModelsResponse = Record<AiCapability, AiModel[]>;

/**
 * Request payload for POST /projects/:id/ai/generate.
 *
 * `prompt` is a top-level optional field: the BE merges it into
 * `options.prompt` when the selected model's schema exposes a `prompt`
 * field (see `aiGeneration.service.ts`).
 */
export type AiGenerationRequest = {
  modelId: string;
  prompt?: string;
  options: Record<string, unknown>;
};

/** Job status as returned by GET /ai/jobs/:jobId. */
export type AiJobStatus = 'queued' | 'processing' | 'completed' | 'failed';

/** AI generation job state returned by the polling endpoint. */
export type AiGenerationJob = {
  jobId: string;
  status: AiJobStatus;
  progress: number;
  resultAssetId: string | null;
  errorMessage: string | null;
};

/** Response from POST /projects/:id/ai/generate or POST /generation-drafts/:id/ai/generate. */
export type AiGenerationSubmitResponse = {
  jobId: string;
  status: 'queued';
};

/**
 * Discriminated union that identifies where an AI generation runs in.
 *
 * - `kind: 'project'` → calls `POST /projects/:id/ai/generate`; assets endpoint `GET /projects/:id/assets`
 * - `kind: 'draft'`   → calls `POST /generation-drafts/:id/ai/generate`; assets endpoint `GET /generation-drafts/:id/assets`
 */
export type AiGenerationContext =
  | { kind: 'project'; id: string }
  | { kind: 'draft'; id: string };
