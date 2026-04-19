import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MediaIngestJobPayload } from '@ai-video-editor/project-schema';

import { processAiGenerateJob } from './ai-generate.job.js';
import {
  BUCKET,
  IMAGE_OUTPUT,
  VIDEO_OUTPUT,
  findInsertParams,
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

  it('text_to_image: uploads image, inserts asset row, enqueues ingest, marks completed', async () => {
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

    // Asset row: [assetId, projectId, userId, filename, contentType, size, storageUri, width, height]
    const params = findInsertParams(m.execute);
    expect(params[1]).toBe('proj-1');
    expect(params[2]).toBe('user-1');
    expect(params[3]).toMatch(/^ai-text_to_image-\d+\.png$/);
    expect(params[4]).toBe('image/png');
    expect(params[5]).toBe(4);
    expect(params[6]).toMatch(
      new RegExp(`^s3://${BUCKET}/ai-generations/proj-1/[0-9a-f-]+\\.png$`),
    );
    expect(params[7]).toBe(1024);
    expect(params[8]).toBe(1024);

    // Ingest enqueue with idempotent jobId = fileId (which is the local assetId UUID)
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

    // Terminal update → completed with s3:// URI
    expect(m.execute).toHaveBeenCalledWith(
      expect.stringContaining("status = 'completed'"),
      [expect.stringMatching(new RegExp(`^s3://${BUCKET}/`)), expect.any(String), 'job-1'],
    );
  });

  it('image_edit: parses the image output shape and writes image/png asset', async () => {
    const m = makeMocks(IMAGE_OUTPUT);
    installFetch(m);

    await processAiGenerateJob(
      makeJob({ modelId: 'fal-ai/nano-banana-2/edit', capability: 'image_edit' }),
      makeDeps(m),
    );

    const params = findInsertParams(m.execute);
    expect(params[3]).toMatch(/^ai-image_edit-\d+\.png$/);
    expect(params[4]).toBe('image/png');
    expect(params[6]).toMatch(new RegExp(`^s3://${BUCKET}/`));
    expect(m.ingestAdd).toHaveBeenCalledTimes(1);
  });

  it('text_to_video: writes video/mp4 asset with .mp4 filename and s3:// URI', async () => {
    const m = makeMocks(VIDEO_OUTPUT);
    installFetch(m);

    await processAiGenerateJob(
      makeJob({
        modelId: 'fal-ai/kling-video/v2.5-turbo/pro/text-to-video',
        capability: 'text_to_video',
      }),
      makeDeps(m),
    );

    const params = findInsertParams(m.execute);
    expect(params[3]).toMatch(/^ai-text_to_video-\d+\.mp4$/);
    expect(params[4]).toBe('video/mp4');
    expect(params[6]).toMatch(
      new RegExp(`^s3://${BUCKET}/ai-generations/proj-1/[0-9a-f-]+\\.mp4$`),
    );
    expect(params[7]).toBeNull();
    expect(params[8]).toBeNull();
  });

  it('image_to_video: reuses video output shape', async () => {
    const m = makeMocks(VIDEO_OUTPUT);
    installFetch(m);

    await processAiGenerateJob(
      makeJob({
        modelId: 'fal-ai/pixverse/v6/image-to-video',
        capability: 'image_to_video',
      }),
      makeDeps(m),
    );

    const params = findInsertParams(m.execute);
    expect(params[4]).toBe('video/mp4');
    expect(params[6]).toMatch(new RegExp(`^s3://${BUCKET}/`));
    expect(m.ingestAdd).toHaveBeenCalledTimes(1);
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

  it('text_to_speech: calls elevenlabs.textToSpeech, skips fal, uploads audio to S3', async () => {
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

    // DB must be marked completed
    expect(m.execute).toHaveBeenCalledWith(
      expect.stringContaining("status = 'completed'"),
      expect.arrayContaining(['job-1']),
    );
  });

  it('music_generation: calls elevenlabs.musicGeneration, skips fal, uploads audio to S3', async () => {
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
  });
});
