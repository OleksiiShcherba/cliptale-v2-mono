/**
 * Shared test fixtures for `ai-generate.job.test.ts` and
 * `ai-generate.job.errors.test.ts`. All mocks + payload factories live here so
 * both split test files stay under the 300-line file length cap without
 * duplicating setup code.
 */

import { vi, expect } from 'vitest';
import type { Job, Queue } from 'bullmq';
import type { S3Client } from '@aws-sdk/client-s3';
import type { Pool } from 'mysql2/promise';
import type { MediaIngestJobPayload } from '@ai-video-editor/project-schema';

import type {
  AiGenerateJobDeps,
  AiGenerateJobPayload,
  CreateFileParams,
} from './ai-generate.job.js';

export const BUCKET = 'test-bucket';

/** Canonical fal.ai output payloads used across the test suites. */
export const IMAGE_OUTPUT = {
  images: [{ url: 'https://fal.media/out.png', width: 1024, height: 1024 }],
};

export const VIDEO_OUTPUT = {
  video: { url: 'https://fal.media/clip.mp4' },
};

/** Builds a BullMQ-shaped Job with default payload values; override per case. */
export function makeJob(
  overrides: Partial<AiGenerateJobPayload> = {},
): Job<AiGenerateJobPayload> {
  return {
    data: {
      jobId: 'job-1',
      userId: 'user-1',
      projectId: 'proj-1',
      modelId: 'fal-ai/nano-banana-2',
      capability: 'text_to_image',
      provider: 'fal',
      prompt: 'a cat',
      options: { prompt: 'a cat' },
      ...overrides,
    },
  } as Job<AiGenerateJobPayload>;
}

/** Mock bundle returned by `makeMocks` — individual spies stay addressable for assertions. */
export type Mocks = {
  pool: Pool;
  s3: S3Client;
  fetchMock: ReturnType<typeof vi.fn>;
  execute: ReturnType<typeof vi.fn>;
  s3Send: ReturnType<typeof vi.fn>;
  submitFalJob: ReturnType<typeof vi.fn>;
  getFalJobStatus: ReturnType<typeof vi.fn>;
  elevenLabsTextToSpeech: ReturnType<typeof vi.fn>;
  elevenLabsVoiceClone: ReturnType<typeof vi.fn>;
  elevenLabsSpeechToSpeech: ReturnType<typeof vi.fn>;
  elevenLabsMusicGeneration: ReturnType<typeof vi.fn>;
  ingestQueue: Queue<MediaIngestJobPayload>;
  ingestAdd: ReturnType<typeof vi.fn>;
  filesRepoCreateFile: ReturnType<typeof vi.fn>;
  aiGenerationJobRepoSetOutputFile: ReturnType<typeof vi.fn>;
};

/** Constructs a fresh set of mocks wired to resolve with the given fal output. */
export function makeMocks(output: unknown): Mocks {
  const execute = vi.fn().mockResolvedValue([]);
  const pool = { execute } as unknown as Pool;

  const s3Send = vi.fn().mockResolvedValue({});
  const s3 = { send: s3Send } as unknown as S3Client;

  const submitFalJob = vi.fn().mockResolvedValue({
    requestId: 'req-123',
    statusUrl: 'https://queue.fal.run/fal-ai/nano-banana-2/requests/req-123/status',
    responseUrl: 'https://queue.fal.run/fal-ai/nano-banana-2/requests/req-123',
  });
  const getFalJobStatus = vi
    .fn()
    .mockResolvedValue({ status: 'COMPLETED', output });

  const ingestAdd = vi.fn().mockResolvedValue({ id: 'ingest-1' });
  const ingestQueue = { add: ingestAdd } as unknown as Queue<MediaIngestJobPayload>;

  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
  });

  const elevenLabsTextToSpeech = vi.fn().mockResolvedValue(Buffer.from([0x49, 0x44, 0x33]));
  const elevenLabsVoiceClone = vi.fn().mockResolvedValue({ voiceId: 'el-voice-123' });
  const elevenLabsSpeechToSpeech = vi.fn().mockResolvedValue(Buffer.from([0x49, 0x44, 0x33]));
  const elevenLabsMusicGeneration = vi.fn().mockResolvedValue(Buffer.from([0x49, 0x44, 0x33]));

  // filesRepo.createFile resolves with the fileId that was passed in
  const filesRepoCreateFile = vi.fn().mockImplementation(
    async (params: CreateFileParams) => params.fileId,
  );
  const aiGenerationJobRepoSetOutputFile = vi.fn().mockResolvedValue(undefined);

  return {
    pool,
    s3,
    fetchMock,
    execute,
    s3Send,
    submitFalJob,
    getFalJobStatus,
    elevenLabsTextToSpeech,
    elevenLabsVoiceClone,
    elevenLabsSpeechToSpeech,
    elevenLabsMusicGeneration,
    ingestQueue,
    ingestAdd,
    filesRepoCreateFile,
    aiGenerationJobRepoSetOutputFile,
  };
}

/** Turns a `Mocks` bundle into the typed `AiGenerateJobDeps` shape the handler expects. */
export function makeDeps(m: Mocks): AiGenerateJobDeps {
  return {
    s3: m.s3,
    pool: m.pool,
    bucket: BUCKET,
    falKey: 'fal-key',
    fal: {
      submitFalJob: m.submitFalJob as unknown as AiGenerateJobDeps['fal']['submitFalJob'],
      getFalJobStatus: m.getFalJobStatus as unknown as AiGenerateJobDeps['fal']['getFalJobStatus'],
    },
    elevenlabsKey: 'el-key',
    elevenlabs: {
      textToSpeech: m.elevenLabsTextToSpeech as unknown as AiGenerateJobDeps['elevenlabs']['textToSpeech'],
      voiceClone: m.elevenLabsVoiceClone as unknown as AiGenerateJobDeps['elevenlabs']['voiceClone'],
      speechToSpeech: m.elevenLabsSpeechToSpeech as unknown as AiGenerateJobDeps['elevenlabs']['speechToSpeech'],
      musicGeneration: m.elevenLabsMusicGeneration as unknown as AiGenerateJobDeps['elevenlabs']['musicGeneration'],
    },
    ingestQueue: m.ingestQueue,
    filesRepo: {
      createFile: m.filesRepoCreateFile as unknown as AiGenerateJobDeps['filesRepo']['createFile'],
    },
    aiGenerationJobRepo: {
      setOutputFile: m.aiGenerationJobRepoSetOutputFile as unknown as AiGenerateJobDeps['aiGenerationJobRepo']['setOutputFile'],
    },
  };
}

/** Installs the mocked fetch on `globalThis` so the handler's download step hits it. */
export function installFetch(m: Mocks): void {
  globalThis.fetch = m.fetchMock as unknown as typeof globalThis.fetch;
}

/**
 * Finds the `filesRepo.createFile` call and returns the params object.
 * Used in tests to assert the correct kind/mime/storageUri are passed.
 */
export function findCreateFileParams(m: Mocks): CreateFileParams {
  expect(m.filesRepoCreateFile).toHaveBeenCalledOnce();
  return m.filesRepoCreateFile.mock.calls[0]![0] as CreateFileParams;
}
