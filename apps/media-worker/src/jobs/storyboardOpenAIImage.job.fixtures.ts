/**
 * Shared test fixtures for storyboardOpenAIImage.job tests.
 * Imported by storyboardOpenAIImage.job.test.ts and
 * storyboardOpenAIImage.job.attached-image.test.ts.
 */

import { vi } from 'vitest';
import type { Job } from 'bullmq';
import type { Pool } from 'mysql2/promise';
import type { S3Client } from '@aws-sdk/client-s3';
import type OpenAI from 'openai';
import type { StoryboardOpenAIImageJobPayload } from '@ai-video-editor/project-schema';
import type { StoryboardOpenAIImageJobDeps } from './storyboardOpenAIImage.inputs.js';

// ── Shared buffer constants ───────────────────────────────────────────────────

export const PNG_BODY = Buffer.from([1, 2, 3, 4]);
export const B64_IMAGE = Buffer.from([9, 8, 7, 6]).toString('base64');

// ── Job factory ───────────────────────────────────────────────────────────────

/** Build a minimal scene-kind job payload. Callers supply overrides; jobId defaults to 'job-1'. */
export function makeJob(
  overrides: Partial<StoryboardOpenAIImageJobPayload> = {},
): Job<StoryboardOpenAIImageJobPayload> {
  return {
    data: {
      jobId: 'job-1',
      userId: 'user-1',
      draftId: 'draft-1',
      kind: 'scene',
      prompt: 'Create the canonical visual style.',
      referenceFileIds: [],
      ...overrides,
    },
    attemptsMade: 0,
    opts: { attempts: 1 },
  } as Job<StoryboardOpenAIImageJobPayload>;
}

// ── Deps factory ──────────────────────────────────────────────────────────────

/** All named mocks exposed on the return value so tests can inspect/reconfigure them. */
export type MakeDepsResult = StoryboardOpenAIImageJobDeps & {
  execute: ReturnType<typeof vi.fn>;
  s3Send: ReturnType<typeof vi.fn>;
  imagesGenerate: ReturnType<typeof vi.fn>;
  imagesEdit: ReturnType<typeof vi.fn>;
  filesCreate: ReturnType<typeof vi.fn>;
  filesMarkReady: ReturnType<typeof vi.fn>;
  setOutputFile: ReturnType<typeof vi.fn>;
  markFailed: ReturnType<typeof vi.fn>;
  findFilesByIds: ReturnType<typeof vi.fn>;
  sceneAttachOutputToBlock: ReturnType<typeof vi.fn>;
  sceneMarkFailed: ReturnType<typeof vi.fn>;
};

/**
 * Builds a fully-wired deps object with all collaborators stubbed via vi.fn().
 * S3 reads for any key return PNG_BODY; OpenAI calls return B64_IMAGE.
 * Callers can override individual fields before passing to the job.
 */
export function makeDeps(
  overrides: Partial<StoryboardOpenAIImageJobDeps> = {},
): MakeDepsResult {
  const execute = vi.fn().mockResolvedValue([]);
  const s3Send = vi.fn().mockImplementation(async (command: { input?: { Key?: string } }) => {
    if (command.input?.Key) {
      return { Body: { transformToByteArray: async () => PNG_BODY } };
    }
    return {};
  });
  const imagesGenerate = vi.fn().mockResolvedValue({ data: [{ b64_json: B64_IMAGE }] });
  const imagesEdit = vi.fn().mockResolvedValue({ data: [{ b64_json: B64_IMAGE }] });
  const filesCreate = vi.fn().mockImplementation(async (params: { fileId: string }) => params.fileId);
  const filesMarkReady = vi.fn().mockResolvedValue(undefined);
  const setOutputFile = vi.fn().mockResolvedValue(undefined);
  const markFailed = vi.fn().mockResolvedValue(undefined);
  const findFilesByIds = vi.fn().mockResolvedValue([
    {
      fileId: 'file-ref-1',
      storageUri: 's3://test-bucket/refs/source.png',
      mimeType: 'image/png',
      displayName: 'source.png',
    },
  ]);
  const sceneAttachOutputToBlock = vi.fn().mockResolvedValue(undefined);
  const sceneMarkFailed = vi.fn().mockResolvedValue(undefined);

  return {
    openai: { images: { generate: imagesGenerate, edit: imagesEdit } } as unknown as OpenAI,
    s3: { send: s3Send } as unknown as S3Client,
    pool: { execute } as unknown as Pool,
    bucket: 'test-bucket',
    filesRepo: { createFile: filesCreate, markReady: filesMarkReady },
    fileReadRepo: { findFilesByIds },
    aiGenerationJobRepo: { setOutputFile, markFailed },
    storyboardSceneRepo: {
      attachOutputToBlock: sceneAttachOutputToBlock,
      markFailed: sceneMarkFailed,
    },
    execute,
    s3Send,
    imagesGenerate,
    imagesEdit,
    filesCreate,
    filesMarkReady,
    setOutputFile,
    markFailed,
    findFilesByIds,
    sceneAttachOutputToBlock,
    sceneMarkFailed,
    ...overrides,
  };
}
