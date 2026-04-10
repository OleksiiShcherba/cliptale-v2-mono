import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { processAiGenerateJob } from './ai-generate.job.js';
import type { AiGenerateJobPayload } from './ai-generate.job.js';
import {
  IMAGE_OUTPUT,
  installFetch,
  makeDeps,
  makeJob,
  makeMocks,
} from './ai-generate.job.fixtures.js';

const hasInsertCall = (execute: ReturnType<typeof vi.fn>): boolean =>
  execute.mock.calls.some(
    (c) =>
      typeof c[0] === 'string' && c[0].includes('INSERT INTO project_assets_current'),
  );

describe('processAiGenerateJob — failure paths', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it('marks job failed when submitFalJob throws; no INSERT and no ingest', async () => {
    const m = makeMocks(IMAGE_OUTPUT);
    installFetch(m);
    m.submitFalJob.mockRejectedValueOnce(new Error('fal submit boom'));

    await expect(processAiGenerateJob(makeJob(), makeDeps(m))).rejects.toThrow(
      'fal submit boom',
    );

    expect(m.execute).toHaveBeenCalledWith(
      expect.stringContaining('SET status = ?, error_message = ?'),
      ['failed', 'fal submit boom', 'job-1'],
    );
    expect(hasInsertCall(m.execute)).toBe(false);
    expect(m.ingestAdd).not.toHaveBeenCalled();
  });

  it('marks job failed when getFalJobStatus throws during polling', async () => {
    const m = makeMocks(IMAGE_OUTPUT);
    installFetch(m);
    m.getFalJobStatus.mockRejectedValueOnce(new Error('fal status boom'));

    await expect(processAiGenerateJob(makeJob(), makeDeps(m))).rejects.toThrow(
      'fal status boom',
    );

    expect(m.execute).toHaveBeenCalledWith(
      expect.stringContaining('SET status = ?, error_message = ?'),
      ['failed', 'fal status boom', 'job-1'],
    );
    expect(hasInsertCall(m.execute)).toBe(false);
    expect(m.ingestAdd).not.toHaveBeenCalled();
  });

  it('marks job failed when the output is missing the expected image URL', async () => {
    const m = makeMocks({ images: [] });
    installFetch(m);

    await expect(processAiGenerateJob(makeJob(), makeDeps(m))).rejects.toThrow(
      /did not contain/,
    );

    expect(m.execute).toHaveBeenCalledWith(
      expect.stringContaining('SET status = ?, error_message = ?'),
      ['failed', expect.stringContaining('did not contain'), 'job-1'],
    );
    expect(hasInsertCall(m.execute)).toBe(false);
    expect(m.ingestAdd).not.toHaveBeenCalled();
  });

  it('marks job failed for an unsupported capability', async () => {
    const m = makeMocks(IMAGE_OUTPUT);
    installFetch(m);
    const job = makeJob({
      capability: 'audio' as unknown as AiGenerateJobPayload['capability'],
    });

    await expect(processAiGenerateJob(job, makeDeps(m))).rejects.toThrow(
      /Unsupported capability: audio/,
    );

    expect(m.execute).toHaveBeenCalledWith(
      expect.stringContaining('SET status = ?, error_message = ?'),
      ['failed', expect.stringContaining('Unsupported capability'), 'job-1'],
    );
    expect(hasInsertCall(m.execute)).toBe(false);
  });

  it('marks job failed when S3 PutObject rejects', async () => {
    const m = makeMocks(IMAGE_OUTPUT);
    installFetch(m);
    m.s3Send.mockRejectedValueOnce(new Error('s3 down'));

    await expect(processAiGenerateJob(makeJob(), makeDeps(m))).rejects.toThrow('s3 down');

    expect(m.execute).toHaveBeenCalledWith(
      expect.stringContaining('SET status = ?, error_message = ?'),
      ['failed', 's3 down', 'job-1'],
    );
    expect(m.ingestAdd).not.toHaveBeenCalled();
  });

  it('marks job failed when the fal CDN fetch returns !ok', async () => {
    const m = makeMocks(IMAGE_OUTPUT);
    m.fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      arrayBuffer: async () => new ArrayBuffer(0),
    });
    installFetch(m);

    await expect(processAiGenerateJob(makeJob(), makeDeps(m))).rejects.toThrow(
      /HTTP 502/,
    );

    expect(m.execute).toHaveBeenCalledWith(
      expect.stringContaining('SET status = ?, error_message = ?'),
      ['failed', expect.stringContaining('HTTP 502'), 'job-1'],
    );
  });
});
