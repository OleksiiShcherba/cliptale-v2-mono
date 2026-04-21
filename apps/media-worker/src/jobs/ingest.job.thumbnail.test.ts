/**
 * Thumbnail-specific tests for ingest.job — covers the thumbnail extraction +
 * S3 upload + `files.thumbnail_uri` write path added in C2.
 *
 * Split from ingest.job.test.ts because that file was already near the 300-line
 * limit (architecture-rules §9.7). Shared fixtures are inlined here because
 * the mock setup differs slightly (PutObjectCommand is exercised here, not there).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job } from 'bullmq';
import type { S3Client } from '@aws-sdk/client-s3';
import type { Pool } from 'mysql2/promise';

import type { MediaIngestJobPayload } from '@ai-video-editor/project-schema';

import {
  extractThumbnail,
  processIngestJob,
  type IngestJobDeps,
} from './ingest.job.js';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('node:fs/promises', () => ({
  default: {
    mkdtemp: vi.fn().mockResolvedValue('/tmp/ingest-test'),
    readFile: vi.fn().mockResolvedValue(Buffer.from('fake-jpeg-bytes')),
    rm: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('node:fs', () => ({
  createWriteStream: vi.fn().mockReturnValue({
    on: vi.fn().mockReturnThis(),
    write: vi.fn(),
    end: vi.fn(),
  }),
}));

vi.mock('node:stream/promises', () => ({
  pipeline: vi.fn().mockResolvedValue(undefined),
}));

// Hoist the ffprobe data + the mock ffmpeg function so the factory can reference
// them safely (vi.mock factories are hoisted before variable declarations).
const { mockFfprobeData, mockFfmpegInstance } = vi.hoisted(() => {
  const mockFfprobeData = {
    streams: [
      { codec_type: 'video', r_frame_rate: '30/1', width: 1280, height: 720 } as never,
    ],
    format: { duration: '5' } as never,
    chapters: [] as never[],
  };

  // Fluent-ffmpeg builder mock — chains seekInput / outputOptions / output /
  // on('end') / run() so the extractThumbnail wrapper resolves correctly.
  const mockFfmpegInstance = {
    seekInput: vi.fn().mockReturnThis(),
    outputOptions: vi.fn().mockReturnThis(),
    output: vi.fn().mockReturnThis(),
    on: vi.fn((event: string, cb: () => void) => {
      if (event === 'end') setImmediate(cb);
      return mockFfmpegInstance;
    }),
    run: vi.fn().mockReturnThis(),
  };

  return { mockFfprobeData, mockFfmpegInstance };
});

vi.mock('fluent-ffmpeg', () => {
  // The default export is the fluent-ffmpeg factory function. When called with
  // an input path (for thumbnail extraction) it returns the builder mock.
  // When accessed as `ffmpeg.ffprobe(...)` it uses the static method mock below.
  const mockFfmpeg = vi.fn().mockReturnValue(mockFfmpegInstance);
  (mockFfmpeg as never as { ffprobe: unknown }).ffprobe = vi.fn(
    (_input: string, cb: (err: null, data: typeof mockFfprobeData) => void) =>
      cb(null, mockFfprobeData),
  );
  return { default: mockFfmpeg };
});

// ── Test helpers ──────────────────────────────────────────────────────────────

const mockS3Send = vi.fn().mockResolvedValue({ Body: { pipe: vi.fn() } });
const mockS3 = { send: mockS3Send } as unknown as S3Client;

const mockDbExecute = vi.fn().mockResolvedValue([]);
const mockPool = { execute: mockDbExecute } as unknown as Pool;

const deps: IngestJobDeps = { s3: mockS3, pool: mockPool, bucket: 'test-bucket' };

function makeJob(payload: Partial<MediaIngestJobPayload> = {}): Job<MediaIngestJobPayload> {
  return {
    data: {
      fileId: 'file-vid-001',
      storageUri: 's3://bucket/files/file-vid-001/video.mp4',
      contentType: 'video/mp4',
      ...payload,
    },
  } as Job<MediaIngestJobPayload>;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ingest.job — thumbnail', () => {
  describe('extractThumbnail', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      // Restore default 'end' behavior after each test.
      mockFfmpegInstance.on.mockImplementation((event: string, cb: () => void) => {
        if (event === 'end') setImmediate(cb);
        return mockFfmpegInstance;
      });
    });

    it('resolves when fluent-ffmpeg emits the end event', async () => {
      await expect(
        extractThumbnail('/tmp/input.mp4', '/tmp/thumb.jpg', 1),
      ).resolves.toBeUndefined();
    });

    it('calls seekInput with the provided offset', async () => {
      await extractThumbnail('/tmp/input.mp4', '/tmp/thumb.jpg', 2.5);
      expect(mockFfmpegInstance.seekInput).toHaveBeenCalledWith(2.5);
    });

    it('rejects when fluent-ffmpeg emits the error event', async () => {
      const ffmpegErr = new Error('codec not found');
      mockFfmpegInstance.on.mockImplementation((event: string, cb: (err?: Error) => void) => {
        if (event === 'error') setImmediate(() => cb(ffmpegErr));
        return mockFfmpegInstance;
      });

      await expect(
        extractThumbnail('/tmp/input.mp4', '/tmp/thumb.jpg', 1),
      ).rejects.toBe(ffmpegErr);
    });
  });

  describe('processIngestJob — thumbnail path', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockS3Send.mockResolvedValue({ Body: { pipe: vi.fn() } });
      mockDbExecute.mockResolvedValue([]);
      // Restore default 'end' behavior.
      mockFfmpegInstance.on.mockImplementation((event: string, cb: () => void) => {
        if (event === 'end') setImmediate(cb);
        return mockFfmpegInstance;
      });
    });

    it('calls setThumbnailUri (UPDATE files SET thumbnail_uri) for video content type', async () => {
      await processIngestJob(makeJob({ contentType: 'video/mp4' }), deps);

      const thumbnailCall = mockDbExecute.mock.calls.find(
        (c) => typeof c[0] === 'string' && (c[0] as string).includes('thumbnail_uri'),
      );
      expect(thumbnailCall).toBeDefined();
      const sql = thumbnailCall![0] as string;
      expect(sql).toContain('UPDATE files SET thumbnail_uri');
      // URI must be s3://test-bucket/thumbnails/<fileId>.jpg
      const params = thumbnailCall![1] as string[];
      expect(params[0]).toBe('s3://test-bucket/thumbnails/file-vid-001.jpg');
      expect(params[1]).toBe('file-vid-001');
    });

    it('uploads the thumbnail to S3 under thumbnails/<fileId>.jpg', async () => {
      await processIngestJob(makeJob({ contentType: 'video/mp4' }), deps);

      // S3 send is called twice: once for GetObject (download), once for PutObject (thumb upload).
      expect(mockS3Send).toHaveBeenCalledTimes(2);
      const putCall = mockS3Send.mock.calls[1]!;
      // The second call argument is a PutObjectCommand instance.
      const putCommand = putCall[0] as { input: { Bucket: string; Key: string; ContentType: string } };
      expect(putCommand.input.Bucket).toBe('test-bucket');
      expect(putCommand.input.Key).toBe('thumbnails/file-vid-001.jpg');
      expect(putCommand.input.ContentType).toBe('image/jpeg');
    });

    it('skips thumbnail generation for audio content types', async () => {
      const audioProbe = {
        streams: [{ codec_type: 'audio' } as never],
        format: { duration: '60' } as never,
        chapters: [] as never[],
      };
      const ffmpegMod = await import('fluent-ffmpeg');
      const mockFfprobe = vi.mocked(
        ffmpegMod.default as never as { ffprobe: (...args: unknown[]) => void },
      );
      mockFfprobe.ffprobe.mockImplementationOnce(
        (_input, cb: (err: null, data: typeof audioProbe) => void) => cb(null, audioProbe),
      );

      await processIngestJob(makeJob({ contentType: 'audio/mpeg' }), deps);

      // Only one S3 send call: GetObject for the download, no PutObject for thumbnail.
      expect(mockS3Send).toHaveBeenCalledTimes(1);
      const thumbnailCall = mockDbExecute.mock.calls.find(
        (c) => typeof c[0] === 'string' && (c[0] as string).includes('thumbnail_uri'),
      );
      expect(thumbnailCall).toBeUndefined();
    });

    it('skips thumbnail when video stream is absent (muxed audio-only video container)', async () => {
      const audioOnlyProbe = {
        // No video stream — some .mp4 containers are audio-only.
        streams: [{ codec_type: 'audio' } as never],
        format: { duration: '30' } as never,
        chapters: [] as never[],
      };
      const ffmpegMod = await import('fluent-ffmpeg');
      const mockFfprobe = vi.mocked(
        ffmpegMod.default as never as { ffprobe: (...args: unknown[]) => void },
      );
      mockFfprobe.ffprobe.mockImplementationOnce(
        (_input, cb: (err: null, data: typeof audioOnlyProbe) => void) => cb(null, audioOnlyProbe),
      );

      await processIngestJob(makeJob({ contentType: 'video/mp4' }), deps);

      // No thumbnail upload because videoStream is undefined.
      expect(mockS3Send).toHaveBeenCalledTimes(1);
      const thumbnailCall = mockDbExecute.mock.calls.find(
        (c) => typeof c[0] === 'string' && (c[0] as string).includes('thumbnail_uri'),
      );
      expect(thumbnailCall).toBeUndefined();
    });

    it('seeks to half-duration for clips shorter than 2 seconds', async () => {
      const shortProbe = {
        streams: [
          { codec_type: 'video', r_frame_rate: '30/1', width: 640, height: 360 } as never,
        ],
        format: { duration: '0.5' } as never,
        chapters: [] as never[],
      };
      const ffmpegMod = await import('fluent-ffmpeg');
      const mockFfprobe = vi.mocked(
        ffmpegMod.default as never as { ffprobe: (...args: unknown[]) => void },
      );
      mockFfprobe.ffprobe.mockImplementationOnce(
        (_input, cb: (err: null, data: typeof shortProbe) => void) => cb(null, shortProbe),
      );

      await processIngestJob(makeJob({ contentType: 'video/mp4' }), deps);

      // seekSec = Math.min(1, 0.5 / 2) = 0.25
      expect(mockFfmpegInstance.seekInput).toHaveBeenCalledWith(0.25);
    });

    it('marks file error and re-throws when thumbnail extraction fails', async () => {
      const thumbErr = new Error('ffmpeg: cannot write output');
      mockFfmpegInstance.on.mockImplementation((event: string, cb: (err?: Error) => void) => {
        if (event === 'error') setImmediate(() => cb(thumbErr));
        return mockFfmpegInstance;
      });

      await expect(processIngestJob(makeJob({ contentType: 'video/mp4' }), deps)).rejects.toBe(thumbErr);

      const errorCall = mockDbExecute.mock.calls.find(
        (c) => typeof c[0] === 'string' && (c[0] as string).includes("status = 'error'"),
      );
      expect(errorCall).toBeDefined();
      const params = errorCall![1] as string[];
      expect(params[0]).toBe('ffmpeg: cannot write output');
    });
  });
});
