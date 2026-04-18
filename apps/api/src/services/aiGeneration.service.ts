/**
 * AI generation service — unified fal.ai + ElevenLabs model submission.
 *
 * Validates submit requests against the static AI_MODELS catalog (fal + ElevenLabs),
 * enforces the kling-o3 prompt XOR (fal-only), resolves any asset URL fields into
 * presigned HTTPS URLs, enqueues a worker job, and persists a job row.
 *
 * Jobs are tied only to `user_id` + `output_file_id` — no project coupling in
 * the job shape (Batch 1 Subtask 8). Project/draft linking is handled separately
 * by an explicit link call after the job completes.
 */
import {
  AI_MODELS,
  type AiCapability,
  type AiModel,
} from '@ai-video-editor/api-contracts';

import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
} from '@/lib/errors.js';
import { enqueueAiGenerateJob } from '@/queues/jobs/enqueue-ai-generate.js';
import * as aiGenerationJobRepository from '@/repositories/aiGenerationJob.repository.js';
import type {
  AiJobStatus,
} from '@/repositories/aiGenerationJob.repository.js';
import { getVoicesByUserId, type UserVoice } from '@/repositories/voice.repository.js';
import { resolveAssetImageUrls } from '@/services/aiGeneration.assetResolver.js';
import { validateFalOptions } from '@/services/falOptions.validator.js';

/** Model id for the only catalog entry that exposes a mutually-exclusive prompt XOR. */
const KLING_O3_MODEL_ID = 'fal-ai/kling-video/o3/standard/image-to-video';

/** Parameters accepted by {@link submitGeneration}. */
export type SubmitGenerationParams = {
  modelId: string;
  prompt?: string;
  options: Record<string, unknown>;
};

/** Result returned by {@link submitGeneration}. */
export type SubmitGenerationResult = {
  jobId: string;
  status: 'queued';
};

/** Result returned by {@link getJobStatus}. Shape matches the FE polling hook. */
export type GetJobStatusResult = {
  jobId: string;
  status: AiJobStatus;
  progress: number;
  outputFileId: string | null;
  resultUrl: string | null;
  errorMessage: string | null;
};

/** Result returned by {@link listModels} — full catalog grouped by capability. */
export type ListModelsResult = Record<AiCapability, AiModel[]>;

/**
 * Derives the non-null DB `prompt` column value. Migration 014 declared
 * `prompt TEXT NOT NULL`, but the top-level field is optional in the request.
 * Falls back through: top-level → options.prompt → options.multi_prompt[0] → ''.
 */
function deriveDbPrompt(
  topLevelPrompt: string | undefined,
  options: Record<string, unknown>,
): string {
  if (typeof topLevelPrompt === 'string' && topLevelPrompt.length > 0) {
    return topLevelPrompt;
  }
  const optPrompt = options['prompt'];
  if (typeof optPrompt === 'string' && optPrompt.length > 0) {
    return optPrompt;
  }
  const mp = options['multi_prompt'];
  if (
    Array.isArray(mp) &&
    mp.length > 0 &&
    typeof mp[0] === 'string' &&
    (mp[0] as string).length > 0
  ) {
    return mp[0] as string;
  }
  return '';
}

/**
 * Submits an AI generation request against any supported model (fal.ai or ElevenLabs).
 *
 * 1. Looks up `modelId` in the unified AI_MODELS catalog.
 * 2. Merges the top-level `prompt` into `options.prompt` when the model
 *    accepts a `prompt` field and the caller did not already supply one.
 * 3. Runs the field-level validator over the merged options.
 * 4. Enforces the kling-o3 XOR (fal.ai models only).
 * 5. Resolves any `image_url` / `audio_url` fields into presigned HTTPS URLs.
 * 6. Enqueues a worker job and writes a job row with status='queued'.
 *
 * `userId` is the only scope — jobs are no longer tied to a project.
 */
export async function submitGeneration(
  userId: string,
  params: SubmitGenerationParams,
): Promise<SubmitGenerationResult> {
  const { modelId, prompt, options } = params;

  const model = AI_MODELS.find((m) => m.id === modelId);
  if (!model) {
    throw new ValidationError(`Unknown modelId '${modelId}'`);
  }

  // Clone to avoid mutating the caller's object.
  const mergedOptions: Record<string, unknown> = { ...options };

  // If the model accepts a `prompt` field and the caller supplied a top-level
  // prompt, copy it into options.prompt so the worker sees a unified shape.
  // Never overwrite an existing options.prompt.
  const hasPromptField = model.inputSchema.fields.some(
    (f) => f.name === 'prompt',
  );
  if (
    hasPromptField &&
    typeof prompt === 'string' &&
    prompt.length > 0 &&
    mergedOptions['prompt'] === undefined
  ) {
    mergedOptions['prompt'] = prompt;
  }

  const validation = validateFalOptions(model, mergedOptions);
  if (!validation.ok) {
    throw new ValidationError(validation.errors.join('; '));
  }

  // kling-o3 XOR is specific to fal.ai — skip for ElevenLabs models.
  if (model.provider === 'fal' && model.id === KLING_O3_MODEL_ID) {
    const hasPromptOpt = typeof mergedOptions['prompt'] === 'string';
    const mp = mergedOptions['multi_prompt'];
    const hasMulti = Array.isArray(mp) && mp.length > 0;
    if (hasPromptOpt && hasMulti) {
      throw new ValidationError(
        `Model '${model.id}' accepts exactly one of 'prompt' or 'multi_prompt', not both`,
      );
    }
    if (!hasPromptOpt && !hasMulti) {
      throw new ValidationError(
        `Model '${model.id}' requires exactly one of 'prompt' or 'multi_prompt'`,
      );
    }
  }

  // Resolve internal file IDs in image_url / audio_url fields into presigned URLs.
  // audio_upload fields are direct upload URLs from the FE — they pass through unchanged.
  const resolvedOptions = await resolveAssetImageUrls({
    model,
    options: mergedOptions,
    userId,
  });

  const dbPrompt = deriveDbPrompt(prompt, resolvedOptions);

  const jobId = await enqueueAiGenerateJob({
    userId,
    modelId: model.id,
    capability: model.capability,
    provider: model.provider,
    prompt: dbPrompt,
    options: resolvedOptions,
  });

  await aiGenerationJobRepository.createJob({
    jobId,
    userId,
    modelId: model.id,
    capability: model.capability,
    prompt: dbPrompt,
    options: resolvedOptions,
  });

  return { jobId, status: 'queued' };
}

/**
 * Returns the current status of a generation job. Enforces that only the
 * requesting user can read their own jobs.
 */
export async function getJobStatus(
  jobId: string,
  userId: string,
): Promise<GetJobStatusResult> {
  const row = await aiGenerationJobRepository.getJobById(jobId);
  if (!row) {
    throw new NotFoundError('Job not found');
  }
  if (row.userId !== userId) {
    throw new ForbiddenError('Forbidden');
  }
  return {
    jobId: row.jobId,
    status: row.status,
    progress: row.progress,
    outputFileId: row.outputFileId,
    resultUrl: row.resultUrl,
    errorMessage: row.errorMessage,
  };
}

/** Re-export UserVoice so the controller can type its response without reaching into the repo. */
export type { UserVoice };

/**
 * Returns all cloned voices belonging to a user, ordered newest first.
 * Used to populate the voice picker in the TTS and speech-to-speech forms.
 */
export async function listUserVoices(userId: string): Promise<UserVoice[]> {
  return getVoicesByUserId(userId);
}

/**
 * Returns the static AI model catalog grouped by capability (fal.ai + ElevenLabs).
 * No secrets or API keys are included — the catalog is fully public metadata.
 */
export function listModels(): ListModelsResult {
  const grouped: ListModelsResult = {
    text_to_image: [],
    image_edit: [],
    text_to_video: [],
    image_to_video: [],
    text_to_speech: [],
    voice_cloning: [],
    speech_to_speech: [],
    music_generation: [],
  };
  for (const model of AI_MODELS) {
    grouped[model.capability].push(model);
  }
  return grouped;
}
