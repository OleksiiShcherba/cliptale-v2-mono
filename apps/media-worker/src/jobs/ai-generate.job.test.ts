import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MediaIngestJobPayload } from '@ai-video-editor/project-schema';

import { processAiGenerateJob } from './ai-generate.job.js';
import {
  BUCKET,
  IMAGE_OUTPUT,
  VIDEO_OUTPUT,
  findCreateFileParams,
  installFetch,
  makeDeps,
  makeJob,
  makeMocks,
} from './ai-generate.job.fixtures.js';

describe('processAiGenerateJob — happy paths by capability', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it('text_to_image: uploads image, creates files row, enqueues ingest, calls setOutputFile', async () => {
    const m = makeMocks(IMAGE_OUTPUT);
    installFetch(m);

    await processAiGenerateJob(
      makeJob({ modelId: 'fal-ai/nano-banana-2', capability: 'text_to_image' }),
      makeDeps(m),
    );

    // Initial status update → processing
    expect(m.execute).toHaveBeenCalledWith(
      expect.stringContaining('SET status = ?, error_message = ?'),
      ['processing', null, 'job-1'],
    );

    // Fal input forwards `options` verbatim — prompt is already folded in by the API.
    expect(m.submitFalJob).toHaveBeenCalledWith({
      modelId: 'fal-ai/nano-banana-2',
      input: { prompt: 'a cat' },
      apiKey: 'fal-key',
    });

    // filesRepo.createFile called with correct kind, mimeType, storageUri
    const fileParams = findCreateFileParams(m);
    expect(fileParams.userId).toBe('user-1');
    expect(fileParams.kind).toBe('image');
    expect(fileParams.mimeType).toBe('image/png');
    expect(fileParams.storageUri).toMatch(
      new RegExp(`^s3://${BUCKET}/ai-generations/proj-1/[0-9a-f-]+\\.png$`),
    );
    expect(fileParams.bytes).toBe(4);
    expect(fileParams.width).toBe(1024);
    expect(fileParams.height).toBe(1024);
    expect(fileParams.displayName).toMatch(/^ai-text_to_image-\d+\.png$/);

    // Ingest enqueue with idempotent jobId = fileId
    expect(m.ingestAdd).toHaveBeenCalledTimes(1);
    const [name, payload, opts] = m.ingestAdd.mock.calls[0] as [
      string,
      MediaIngestJobPayload,
      { jobId?: string },
    ];
    expect(name).toBe('ingest');
    expect(payload.fileId).toMatch(/^[0-9a-f-]+$/);
    expect(payload.contentType).toBe('image/png');
    expect(payload.storageUri).toMatch(new RegExp(`^s3://${BUCKET}/`));
    expect(opts.jobId).toBe(payload.fileId);

    // setOutputFile called with jobId and the new fileId
    expect(m.aiGenerationJobRepoSetOutputFile).toHaveBeenCalledOnce();
    const [calledJobId, calledFileId] = m.aiGenerationJobRepoSetOutputFile.mock.calls[0]!;
    expect(calledJobId).toBe('job-1');
    expect(calledFileId).toBe(payload.fileId);
  });

  it('image_edit: creates files row with kind=image and mime=image/png', async () => {
    const m = makeMocks(IMAGE_OUTPUT);
    installFetch(m);

    await processAiGenerateJob(
      makeJob({ modelId: 'fal-ai/nano-banana-2/edit', capability: 'image_edit' }),
      makeDeps(m),
    );

    const fileParams = findCreateFileParams(m);
    expect(fileParams.kind).toBe('image');
    expect(fileParams.mimeType).toBe('image/png');
    expect(fileParams.displayName).toMatch(/^ai-image_edit-\d+\.png$/);
    expect(m.ingestAdd).toHaveBeenCalledTimes(1);
    expect(m.aiGenerationJobRepoSetOutputFile).toHaveBeenCalledOnce();
  });

  it('text_to_video: creates files row with kind=video, mime=video/mp4, and .mp4 URI', async () => {
    const m = makeMocks(VIDEO_OUTPUT);
    installFetch(m);

    await processAiGenerateJob(
      makeJob({
        modelId: 'fal-ai/kling-video/v2.5-turbo/pro/text-to-video',
        capability: 'text_to_video',
      }),
      makeDeps(m),
    );

    const fileParams = findCreateFileParams(m);
    expect(fileParams.kind).toBe('video');
    expect(fileParams.mimeType).toBe('video/mp4');
    expect(fileParams.displayName).toMatch(/^ai-text_to_video-\d+\.mp4$/);
    expect(fileParams.storageUri).toMatch(
      new RegExp(`^s3://${BUCKET}/ai-generations/proj-1/[0-9a-f-]+\\.mp4$`),
    );
    expect(fileParams.width).toBeNull();
    expect(fileParams.height).toBeNull();
    expect(m.aiGenerationJobRepoSetOutputFile).toHaveBeenCalledOnce();
  });

  it('image_to_video: creates files row with kind=video and enqueues ingest', async () => {
    const m = makeMocks(VIDEO_OUTPUT);
    installFetch(m);

    await processAiGenerateJob(
      makeJob({
        modelId: 'fal-ai/pixverse/v6/image-to-video',
        capability: 'image_to_video',
      }),
      makeDeps(m),
    );

    const fileParams = findCreateFileParams(m);
    expect(fileParams.kind).toBe('video');
    expect(fileParams.mimeType).toBe('video/mp4');
    expect(m.ingestAdd).toHaveBeenCalledTimes(1);
    expect(m.aiGenerationJobRepoSetOutputFile).toHaveBeenCalledOnce();
  });
});

describe('processAiGenerateJob — ElevenLabs provider dispatch', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it('text_to_speech: calls elevenlabs.textToSpeech, skips fal, uploads audio, calls setOutputFile', async () => {
    const m = makeMocks(IMAGE_OUTPUT);
    installFetch(m);

    await processAiGenerateJob(
      makeJob({
        capability: 'text_to_speech',
        provider: 'elevenlabs',
        options: { text: 'hello world' },
      }),
      makeDeps(m),
    );

    expect(m.elevenLabsTextToSpeech).toHaveBeenCalledTimes(1);
    expect(m.submitFalJob).not.toHaveBeenCalled();
    expect(m.s3Send).toHaveBeenCalledTimes(1);
    expect(m.ingestAdd).toHaveBeenCalledTimes(1);

    // filesRepo.createFile must have been called with kind=audio
    expect(m.filesRepoCreateFile).toHaveBeenCalledOnce();
    const fileParams = m.filesRepoCreateFile.mock.calls[0]![0] as { kind: string; mimeType: string };
    expect(fileParams.kind).toBe('audio');
    expect(fileParams.mimeType).toBe('audio/mpeg');

    // setOutputFile called (not the legacy execute UPDATE)
    expect(m.aiGenerationJobRepoSetOutputFile).toHaveBeenCalledOnce();
    const [calledJobId] = m.aiGenerationJobRepoSetOutputFile.mock.calls[0]!;
    expect(calledJobId).toBe('job-1');
  });

  it('music_generation: calls elevenlabs.musicGeneration, skips fal, creates audio files row', async () => {
    const m = makeMocks(IMAGE_OUTPUT);
    installFetch(m);

    await processAiGenerateJob(
      makeJob({
        capability: 'music_generation',
        provider: 'elevenlabs',
        options: { prompt: 'chill lo-fi beats' },
      }),
      makeDeps(m),
    );

    expect(m.elevenLabsMusicGeneration).toHaveBeenCalledTimes(1);
    expect(m.submitFalJob).not.toHaveBeenCalled();
    expect(m.s3Send).toHaveBeenCalledTimes(1);
    expect(m.ingestAdd).toHaveBeenCalledTimes(1);
    expect(m.filesRepoCreateFile).toHaveBeenCalledOnce();
    expect(m.aiGenerationJobRepoSetOutputFile).toHaveBeenCalledOnce();
  });
});
