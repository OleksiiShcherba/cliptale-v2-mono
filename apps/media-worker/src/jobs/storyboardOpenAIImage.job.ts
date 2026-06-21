import { randomUUID } from 'node:crypto';

import { PutObjectCommand } from '@aws-sdk/client-s3';
import type { Job } from 'bullmq';
import type OpenAI from 'openai';
import type {
  StoryboardOpenAIImageJobPayload,
  StoryboardOpenAIImageSize,
} from '@ai-video-editor/project-schema';

import { publishAiGenerationJobStatus } from '@/lib/realtime.js';
import { setJobProgress, setJobStatus } from '@/jobs/ai-generate.utils.js';
import { refreshActiveRunHeartbeat } from '@/jobs/storyboardPipelineHooks.js';
import type { CreateFileParams } from '@/jobs/ai-generate.job.js';
import {
  buildImageInputs,
  resolveSceneInputs,
  type StoryboardOpenAIImageJobDeps,
} from '@/jobs/storyboardOpenAIImage.inputs.js';

// Re-export public DI types so callers can import them from this file unchanged.
export type {
  StoryboardImageFileReadRepo,
  StoryboardSceneRepo,
  SceneReferenceSelectionRepo,
  StoryboardOpenAIImageJobDeps,
} from '@/jobs/storyboardOpenAIImage.inputs.js';

const OPENAI_STORYBOARD_IMAGE_MODEL = 'gpt-image-2';
const OUTPUT_CONTENT_TYPE = 'image/png';
const OUTPUT_EXTENSION = 'png';
const PROGRESS_OPENAI_DONE = 80;

function sanitizeStoryboardImageError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const withoutUrls = raw.replace(/\b(?:https?|s3|r2):\/\/\S+/gi, '[redacted-url]');
  const withoutTokenValues = withoutUrls.replace(
    /\b[A-Z0-9_-]*(?:api[_-]?key|secret|token|authorization)\s*[:=]\s*\S+/gi,
    '[redacted]',
  );
  const withoutKeys = withoutTokenValues.replace(/\b(?:sk|pk|rk|sess|secret|token|key)_[A-Za-z0-9_-]{8,}\b/g, '[redacted]');
  const singleLine = withoutKeys
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return (singleLine ?? 'Storyboard image generation failed').slice(0, 512);
}

function normalizeSize(size: StoryboardOpenAIImageSize | undefined): StoryboardOpenAIImageSize {
  return size ?? 'auto';
}

function isFinalBullMqAttempt(job: Job<StoryboardOpenAIImageJobPayload>): boolean {
  const configuredAttempts = typeof job.opts?.attempts === 'number' && job.opts.attempts > 0
    ? job.opts.attempts
    : 1;
  const attemptsMade = typeof job.attemptsMade === 'number' && job.attemptsMade >= 0
    ? job.attemptsMade
    : 0;

  return attemptsMade + 1 >= configuredAttempts;
}

function extractImageBuffer(response: Awaited<ReturnType<OpenAI['images']['generate']>>): Buffer | null {
  const image = response.data?.[0];
  if (!image) {
    return null;
  }
  if (image.b64_json) {
    return Buffer.from(image.b64_json, 'base64');
  }
  return null;
}

async function fetchImageUrl(url: string): Promise<Buffer> {
  const response = await globalThis.fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download OpenAI image output: HTTP ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function resolveOutputBuffer(response: Awaited<ReturnType<OpenAI['images']['generate']>>): Promise<Buffer> {
  const b64Buffer = extractImageBuffer(response);
  if (b64Buffer) {
    return b64Buffer;
  }
  const url = response.data?.[0]?.url;
  if (url) {
    return fetchImageUrl(url);
  }
  throw new Error('OpenAI Images response did not include image data');
}

export async function processStoryboardOpenAIImageJob(
  job: Job<StoryboardOpenAIImageJobPayload>,
  deps: StoryboardOpenAIImageJobDeps,
): Promise<void> {
  const payload = job.data;

  await setJobStatus(deps.pool, payload.jobId, 'processing');
  await publishAiGenerationJobStatus({ pool: deps.pool, jobId: payload.jobId });

  try {
    const { referenceFileIds: effectiveReferenceFileIds, prompt: effectivePrompt } =
      await resolveSceneInputs(payload, deps);
    const effectivePayload: StoryboardOpenAIImageJobPayload = {
      ...payload,
      referenceFileIds: effectiveReferenceFileIds,
      prompt: effectivePrompt,
    };
    const imageInputs = await buildImageInputs({ payload: effectivePayload, deps });
    const size = normalizeSize(payload.size);
    // Observability: record exactly which inputs reach OpenAI for this scene so
    // edit-vs-generate and the resolved reference/attached file ids are auditable
    // from the worker log (no inference needed when diagnosing reference usage).
    console.log(
      `[media-worker] storyboard-openai-image job ${payload.jobId} block=${payload.blockId ?? 'n/a'} ` +
        `mode=${imageInputs.length ? 'images.edit' : 'images.generate'} ` +
        `inputCount=${imageInputs.length} resolvedFileIds=${JSON.stringify(effectiveReferenceFileIds)}`,
    );
    const response = imageInputs.length
      ? await deps.openai.images.edit({
          model: OPENAI_STORYBOARD_IMAGE_MODEL,
          image: imageInputs.length === 1 ? imageInputs[0]! : imageInputs,
          prompt: effectivePrompt,
          n: 1,
          size,
          quality: 'auto',
        })
      : await deps.openai.images.generate({
          model: OPENAI_STORYBOARD_IMAGE_MODEL,
          prompt: effectivePrompt,
          n: 1,
          size,
          quality: 'auto',
          output_format: OUTPUT_EXTENSION,
        });

    await setJobProgress(deps.pool, payload.jobId, PROGRESS_OPENAI_DONE);
    await publishAiGenerationJobStatus({ pool: deps.pool, jobId: payload.jobId });

    const body = await resolveOutputBuffer(response);
    const storageKey = `storyboard-openai-images/${payload.userId}/${randomUUID()}.${OUTPUT_EXTENSION}`;
    await deps.s3.send(
      new PutObjectCommand({
        Bucket: deps.bucket,
        Key: storageKey,
        Body: body,
        ContentType: OUTPUT_CONTENT_TYPE,
      }),
    );

    const fileId = randomUUID();
    const storageUri = `s3://${deps.bucket}/${storageKey}`;
    const fileParams: CreateFileParams = {
      fileId,
      userId: payload.userId,
      kind: 'image',
      storageUri,
      mimeType: OUTPUT_CONTENT_TYPE,
      bytes: body.length,
      width: null,
      height: null,
      displayName: `storyboard-${payload.kind}-${Date.now()}.${OUTPUT_EXTENSION}`,
    };
    await deps.filesRepo.createFile(fileParams);
    await deps.filesRepo.markReady?.(fileId);
    await deps.aiGenerationJobRepo.setOutputFile(payload.jobId, fileId);
    await deps.storyboardSceneRepo?.attachOutputToBlock({
      id: randomUUID(),
      aiJobId: payload.jobId,
      outputFileId: fileId,
    });
    await publishAiGenerationJobStatus({ pool: deps.pool, jobId: payload.jobId });

    // AC-04: scene-image phase-completion. Best-effort — once every scene-illustration
    // job is terminal, advance scene_image → completed. Never fails the job.
    await maybeAdvanceSceneImagePhase(payload, deps);
  } catch (error) {
    const message = sanitizeStoryboardImageError(error);
    if (isFinalBullMqAttempt(job)) {
      if (deps.aiGenerationJobRepo.markFailed) {
        await deps.aiGenerationJobRepo.markFailed(payload.jobId, message);
      } else {
        await setJobStatus(deps.pool, payload.jobId, 'failed', message);
      }
      await deps.storyboardSceneRepo?.markFailed(payload.jobId, message);
      await publishAiGenerationJobStatus({ pool: deps.pool, jobId: payload.jobId });

      // AC-04: a failed scene is terminal — the phase still completes when this was
      // the last non-terminal scene. Best-effort, only on the final attempt.
      await maybeAdvanceSceneImagePhase(payload, deps);
    }
    throw error;
  }
}

/**
 * Best-effort scene-image phase-completion (AC-04). For scene jobs only: invokes the
 * wired phase-completion hook, which advances scene_image → completed once every
 * scene-illustration job for the draft is terminal. Swallows hook errors so the
 * outcome of the scene job itself is never affected by a phase-advance failure.
 */
async function maybeAdvanceSceneImagePhase(
  payload: StoryboardOpenAIImageJobPayload,
  deps: StoryboardOpenAIImageJobDeps,
): Promise<void> {
  if (payload.kind !== 'scene' || !deps.onSceneImagesAllTerminal) return;
  // B2 review fix (AC-12, ADR-0005): a scene image just reached a terminal result —
  // refresh the scene_image heartbeat so a HEALTHY long-running scene batch is not
  // killed by the reaper / lazy-release. Best-effort: never affects the job outcome.
  await refreshActiveRunHeartbeat(deps.pool, payload.draftId, 'scene_image');
  try {
    await deps.onSceneImagesAllTerminal({ pool: deps.pool, draftId: payload.draftId });
  } catch {
    // best-effort: the reaper (T11) owns whole-phase stalls.
  }
}
