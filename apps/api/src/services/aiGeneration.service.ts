import type { AiProvider } from '@/repositories/aiProvider.repository.js';
import type { AiGenerationType } from '@/repositories/aiGenerationJob.repository.js';
import * as aiGenerationJobRepo from '@/repositories/aiGenerationJob.repository.js';
import * as aiProviderService from '@/services/aiProvider.service.js';
import { enqueueAiGenerateJob } from '@/queues/jobs/enqueue-ai-generate.js';
import { NotFoundError, ValidationError } from '@/lib/errors.js';

/** Maps generation type to the providers that can handle it. */
const TYPE_PROVIDER_MAP: Record<AiGenerationType, AiProvider[]> = {
  image: ['openai', 'stability_ai', 'replicate'],
  video: ['runway', 'kling', 'pika'],
  audio: ['elevenlabs', 'suno'],
  text: ['openai'],
};

type SubmitGenerationParams = {
  type: AiGenerationType;
  prompt: string;
  options?: Record<string, unknown>;
  provider?: AiProvider;
};

type SubmitGenerationResult = {
  jobId: string;
  status: 'queued';
};

/**
 * Submits a generation request: resolves the user's provider, decrypts the API key,
 * creates a job row, enqueues a BullMQ job, and returns the job ID.
 */
export async function submitGeneration(
  userId: string,
  projectId: string,
  params: SubmitGenerationParams,
): Promise<SubmitGenerationResult> {
  const provider = await resolveProvider(userId, params.type, params.provider);
  const apiKey = await aiProviderService.getDecryptedKey(userId, provider);

  const jobId = await enqueueAiGenerateJob({
    userId,
    projectId,
    type: params.type,
    provider,
    apiKey,
    prompt: params.prompt,
    options: params.options ?? null,
  });

  await aiGenerationJobRepo.createJob({
    jobId,
    userId,
    projectId,
    type: params.type,
    provider,
    prompt: params.prompt,
    options: params.options ?? null,
  });

  return { jobId, status: 'queued' };
}

/** Returns the current status of a generation job. */
export async function getJobStatus(
  jobId: string,
  userId: string,
): Promise<{
  jobId: string;
  status: string;
  progress: number;
  resultAssetId: string | null;
  resultUrl: string | null;
  errorMessage: string | null;
}> {
  const job = await aiGenerationJobRepo.getJobById(jobId);
  if (!job || job.userId !== userId) {
    throw new NotFoundError(`Job "${jobId}" not found`);
  }
  return {
    jobId: job.jobId,
    status: job.status,
    progress: job.progress,
    resultAssetId: job.resultAssetId,
    resultUrl: job.resultUrl,
    errorMessage: job.errorMessage,
  };
}

/**
 * Resolves which provider to use for a generation request.
 * If a specific provider is requested, validates it supports the type.
 * Otherwise, picks the user's first active provider for that type.
 */
async function resolveProvider(
  userId: string,
  type: AiGenerationType,
  requestedProvider?: AiProvider,
): Promise<AiProvider> {
  const allowedProviders = TYPE_PROVIDER_MAP[type];

  if (requestedProvider) {
    if (!allowedProviders.includes(requestedProvider)) {
      throw new ValidationError(
        `Provider "${requestedProvider}" does not support type "${type}"`,
      );
    }
    return requestedProvider;
  }

  // Find the user's first active provider that supports this type
  const userProviders = await aiProviderService.listProviders(userId);
  const match = userProviders.find(
    (p) => p.isActive && allowedProviders.includes(p.provider),
  );

  if (!match) {
    throw new NotFoundError(
      `No active provider configured for type "${type}"`,
    );
  }

  return match.provider;
}
