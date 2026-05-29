import { randomUUID } from 'node:crypto';

import { GetObjectCommand, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import type { Job } from 'bullmq';
import type OpenAI from 'openai';
import { toFile } from 'openai/uploads';
import type { Pool } from 'mysql2/promise';
import type {
  StoryboardOpenAIImageJobPayload,
  StoryboardOpenAIImageSize,
} from '@ai-video-editor/project-schema';

import { parseStorageUri } from '@/lib/storage-uri.js';
import { publishAiGenerationJobStatus } from '@/lib/realtime.js';
import { setJobProgress, setJobStatus } from '@/jobs/ai-generate.utils.js';
import type { CreateFileParams, FilesRepo, AiGenerationJobRepo } from '@/jobs/ai-generate.job.js';

const OPENAI_STORYBOARD_IMAGE_MODEL = 'gpt-image-2';
const OUTPUT_CONTENT_TYPE = 'image/png';
const OUTPUT_EXTENSION = 'png';
const PROGRESS_OPENAI_DONE = 80;

type ReferenceFile = {
  fileId: string;
  storageUri: string;
  mimeType: string;
  displayName: string | null;
};

export type StoryboardImageFileReadRepo = {
  findFilesByIds: (params: {
    userId: string;
    fileIds: string[];
  }) => Promise<ReferenceFile[]>;
};

export type StoryboardReferenceRepo = {
  setOutput: (params: { aiJobId: string; outputFileId: string }) => Promise<void>;
  markFailed: (aiJobId: string, errorMessage: string) => Promise<void>;
};

export type StoryboardSceneRepo = {
  attachOutputToBlock: (params: {
    id: string;
    aiJobId: string;
    outputFileId: string;
  }) => Promise<void>;
  markFailed: (aiJobId: string, errorMessage: string) => Promise<void>;
};

export type StoryboardOpenAIImageJobDeps = {
  openai: OpenAI;
  s3: S3Client;
  pool: Pool;
  bucket: string;
  filesRepo: FilesRepo;
  fileReadRepo: StoryboardImageFileReadRepo;
  aiGenerationJobRepo: AiGenerationJobRepo & {
    markFailed?: (jobId: string, errorMessage: string) => Promise<void>;
  };
  storyboardReferenceRepo?: StoryboardReferenceRepo;
  storyboardSceneRepo?: StoryboardSceneRepo;
};

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

async function readS3ObjectToBuffer(s3: S3Client, storageUri: string): Promise<Buffer> {
  const { bucket, key } = parseStorageUri(storageUri);
  const result = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!result.Body) {
    throw new Error(`Reference file ${storageUri} has no readable body`);
  }
  const bytes = await result.Body.transformToByteArray();
  return Buffer.from(bytes);
}

async function buildImageInputs(params: {
  payload: StoryboardOpenAIImageJobPayload;
  deps: StoryboardOpenAIImageJobDeps;
}): Promise<Array<Awaited<ReturnType<typeof toFile>>>> {
  const fileIds = [
    ...params.payload.referenceFileIds,
    ...(params.payload.previousSceneFileId ? [params.payload.previousSceneFileId] : []),
  ];
  const uniqueFileIds = [...new Set(fileIds)];
  if (!uniqueFileIds.length) {
    return [];
  }

  const rows = await params.deps.fileReadRepo.findFilesByIds({
    userId: params.payload.userId,
    fileIds: uniqueFileIds,
  });
  const byId = new Map(rows.map((row) => [row.fileId, row]));
  const missing = uniqueFileIds.filter((fileId) => !byId.has(fileId));
  if (missing.length) {
    throw new Error(`Reference image file is unavailable: ${missing[0]}`);
  }

  return Promise.all(
    uniqueFileIds.map(async (fileId) => {
      const row = byId.get(fileId)!;
      const body = await readS3ObjectToBuffer(params.deps.s3, row.storageUri);
      return toFile(body, row.displayName ?? `${fileId}.png`, { type: row.mimeType });
    }),
  );
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
    const imageInputs = await buildImageInputs({ payload, deps });
    const size = normalizeSize(payload.size);
    const response = imageInputs.length
      ? await deps.openai.images.edit({
          model: OPENAI_STORYBOARD_IMAGE_MODEL,
          image: imageInputs.length === 1 ? imageInputs[0]! : imageInputs,
          prompt: payload.prompt,
          n: 1,
          size,
          quality: 'auto',
        })
      : await deps.openai.images.generate({
          model: OPENAI_STORYBOARD_IMAGE_MODEL,
          prompt: payload.prompt,
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
    if (payload.kind === 'style_reference') {
      await deps.storyboardReferenceRepo?.setOutput({
        aiJobId: payload.jobId,
        outputFileId: fileId,
      });
    } else {
      await deps.storyboardSceneRepo?.attachOutputToBlock({
        id: randomUUID(),
        aiJobId: payload.jobId,
        outputFileId: fileId,
      });
    }
    await publishAiGenerationJobStatus({ pool: deps.pool, jobId: payload.jobId });
  } catch (error) {
    const message = sanitizeStoryboardImageError(error);
    if (isFinalBullMqAttempt(job)) {
      if (deps.aiGenerationJobRepo.markFailed) {
        await deps.aiGenerationJobRepo.markFailed(payload.jobId, message);
      } else {
        await setJobStatus(deps.pool, payload.jobId, 'failed', message);
      }
      if (payload.kind === 'style_reference') {
        await deps.storyboardReferenceRepo?.markFailed(payload.jobId, message);
      } else {
        await deps.storyboardSceneRepo?.markFailed(payload.jobId, message);
      }
      await publishAiGenerationJobStatus({ pool: deps.pool, jobId: payload.jobId });
    }
    throw error;
  }
}
