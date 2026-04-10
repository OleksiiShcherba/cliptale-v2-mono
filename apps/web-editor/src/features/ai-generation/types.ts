/**
 * AI generation feature types.
 *
 * Epic 9 replaced the type-first (image/video/audio) surface with a
 * model-first contract driven by the static fal.ai catalog. All model,
 * capability, and input-schema type definitions live in the shared
 * `@ai-video-editor/api-contracts` package; this file re-exports them
 * so components in `features/ai-generation` can import from one place.
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

/** Response from POST /projects/:id/ai/generate. */
export type AiGenerationSubmitResponse = {
  jobId: string;
  status: 'queued';
};
