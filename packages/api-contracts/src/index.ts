/**
 * API contracts package.
 * Contains the OpenAPI spec for the ClipTale API.
 */
export { openApiSpec } from './openapi.js';

export { FAL_MODELS, CAPABILITY_TO_GROUP } from './fal-models.js';
export type {
  AiProvider,
  FalModel,
  FalCapability,
  FalFieldType,
  FalFieldSchema,
  FalInputSchema,
  AiGroup,
} from './fal-models.js';

export { ELEVENLABS_MODELS, AUDIO_CAPABILITY_TO_GROUP } from './elevenlabs-models.js';
export type { ElevenLabsModel, AudioCapability } from './elevenlabs-models.js';

import { FAL_MODELS } from './fal-models.js';
import { ELEVENLABS_MODELS } from './elevenlabs-models.js';
import type { FalModel } from './fal-models.js';
import type { ElevenLabsModel } from './elevenlabs-models.js';
import type { FalCapability } from './fal-models.js';
import type { AudioCapability } from './elevenlabs-models.js';

/** Combined union of all supported AI capabilities across all providers. */
export type AiCapability = FalCapability | AudioCapability;

/** Unified model type — discriminated by `provider`. */
export type AiModel = FalModel | ElevenLabsModel;

/** Combined catalog of all supported AI models across all providers. */
export const AI_MODELS: readonly AiModel[] = [...FAL_MODELS, ...ELEVENLABS_MODELS];
