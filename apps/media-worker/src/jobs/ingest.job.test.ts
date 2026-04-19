import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job } from 'bullmq';
import type { S3Client } from '@aws-sdk/client-s3';
import type { Pool } from 'mysql2/promise';

import type { MediaIngestJobPayload } from '@ai-video-editor/project-schema';

import {
  parseStorageUri,
  parseFps,
  computeRmsPeaks,
  processIngestJob,
  type IngestJobDeps,
} from './ingest.job.js';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('node:fs/promises', () => ({
  default: {
    mkdtemp: vi.fn().mockResolvedValue('/tmp/ingest-test'),
    readFile: vi.fn().mockResolvedValue(Buffer.from('thumb')),
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

// Mock fluent-ffmpeg: ffprobe only (thumbnail / waveform generation removed).
// vi.mock factories are hoisted above variable declarations, so any variable
// referenced inside a factory must itself be hoisted via vi.hoisted().
const { mockFfprobeData } = vi.hoisted(() => {
  const mockFfprobeData = {
    streams: [
      { codec_type: 'video', r_frame_rate: '30/1', width: 1920, height: 1080 } as never,
      { codec_type: 'audio' } as never,
    ],
    format: { duration: '10' } as never,
    chapters: [] as never[],
  };

  return { mockFfprobeData };
});

vi.mock('fluent-ffmpeg', () => {
  const mockFfmpeg = vi.fn().mockReturnValue({});
  (mockFfmpeg as never as { ffprobe: unknown }).ffprobe = vi.fn(
    (_input: string, cb: (err: null, data: typeof mockFfprobeData) => void) => cb(null, mockFfprobeData),
  );
  return { default: mockFfmpeg };
});

// ── Test helpers ──────────────────────────────────────────────────────────────

const mockS3Send = vi.fn().mockResolvedValue({ Body: { pipe: vi.fn() } });
const mockS3 = { send: mockS3Send } as unknown as S3Client;

const mockDbExecute = vi.fn().mockResolvedValue([]);
const mockPool = { execute: mockDbExecute } as unknown as Pool;

const deps: IngestJobDeps = { s3: mockS3, pool: mockPool };

function makeJob(payload: Partial<MediaIngestJobPayload> = {}): Job<MediaIngestJobPayload> {
  return {
    data: {
      fileId: 'file-123',
      storageUri: 's3://bucket/files/file-123/video.mp4',
      contentType: 'video/mp4',
      ...payload,
    },
  } as Job<MediaIngestJobPayload>;
}

// ── Pure helper tests ─────────────────────────────────────────────────────────

describe('ingest.job', () => {
  describe('parseStorageUri', () => {
    it('extracts bucket and key from a valid s3:// URI', () => {
      const result = parseStorageUri('s3://my-bucket/projects/p1/assets/a1/file.mp4');
      expect(result).toEqual({ bucket: 'my-bucket', key: 'projects/p1/assets/a1/file.mp4' });
    });

    it('handles a key with no subdirectories', () => {
      const result = parseStorageUri('s3://bucket/file.mp4');
      expect(result).toEqual({ bucket: 'bucket', key: 'file.mp4' });
    });
  });

  describe('parseFps', () => {
    it('parses integer fps (30/1)', () => {
      expect(parseFps('30/1')).toBe(30);
    });

    it('parses fractional fps (30000/1001 = 29.97)', () => {
      expect(parseFps('30000/1001')).toBeCloseTo(29.97, 2);
    });

    it('returns null for zero denominator', () => {
      expect(parseFps('30/0')).toBeNull();
    });

    it('returns null for zero numerator', () => {
      expect(parseFps('0/1')).toBeNull();
    });
  });

  describe('computeRmsPeaks', () => {
    it('returns the requested number of peaks', () => {
      // 1 second of silence at 8 kHz mono s16le = 16000 bytes
      const silence = Buffer.alloc(16_000, 0);
      const peaks = computeRmsPeaks(silence, 200);
      expect(peaks).toHaveLength(200);
    });

    it('returns all zeros for a silent buffer', () => {
      const silence = Buffer.alloc(8_000, 0);
      const peaks = computeRmsPeaks(silence, 100);
      expect(peaks.every(p => p === 0)).toBe(true);
    });

    it('returns values in range [0, 1] for non-silent audio', () => {
      // Fill with max-amplitude s16le samples (0x7FFF = 32767)
      const buf = Buffer.alloc(8_000);
      for (let i = 0; i < buf.length; i += 2) buf.writeInt16LE(32767, i);
      const peaks = computeRmsPeaks(buf, 100);
      expect(peaks.every(p => p >= 0 && p <= 1)).toBe(true);
      expect(peaks.some(p => p > 0)).toBe(true);
    });

    it('handles a buffer smaller than numPeaks * 2 bytes without throwing', () => {
      const tiny = Buffer.alloc(10);
      expect(() => computeRmsPeaks(tiny, 200)).not.toThrow();
    });
  });

  // ── processIngestJob flow tests ───────────────────────────────────────────

  describe('processIngestJob', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockS3Send.mockResolvedValue({ Body: { pipe: vi.fn() } });
      mockDbExecute.mockResolvedValue([]);
    });

    it('writes to the files table (not project_assets_current) on happy path', async () => {
      await processIngestJob(makeJob(), deps);

      const call = mockDbExecute.mock.calls[0]!;
      const sql = call[0] as string;
      expect(sql).toContain('UPDATE files');
      expect(sql).not.toContain('project_assets_current');
      expect(sql).toContain("SET status = 'ready'");
      // Last bind param must be the fileId.
      const params = call[1] as (string | null | number)[];
      expect(params[params.length - 1]).toBe('file-123');
    });

    it('converts durationSec to durationMs via Math.round(durationSec * 1000)', async () => {
      // Default ffprobe mock returns format.duration='10' → durationSec=10.
      await processIngestJob(makeJob(), deps);

      // setFileReady params: [durationMs, width, height, bytes, fileId]
      const params = mockDbExecute.mock.calls[0]![1] as (string | null | number)[];
      expect(params[0]).toBe(10_000);      // durationMs = Math.round(10 * 1000)
      expect(params[1]).toBe(1920);        // width from ffprobe
      expect(params[2]).toBe(1080);        // height from ffprobe
      expect(params[3]).toBeNull();        // bytes intentionally null (S3 HEAD not available)
      expect(params[4]).toBe('file-123'); // fileId as row identifier
    });

    it('produces null durationMs when durationSec is 0', async () => {
      const ffmpegMod = await import('fluent-ffmpeg');
      const mockFfprobe = vi.mocked(ffmpegMod.default as never as { ffprobe: (...args: unknown[]) => void });

      const zeroDurationProbe = {
        streams: [
          { codec_type: 'video', r_frame_rate: '30/1', width: 1920, height: 1080 } as never,
          { codec_type: 'audio' } as never,
        ],
        format: { duration: '0' } as never,
        chapters: [] as never[],
      };
      mockFfprobe.ffprobe.mockImplementationOnce(
        (_input, cb: (err: null, data: typeof zeroDurationProbe) => void) => cb(null, zeroDurationProbe),
      );

      await processIngestJob(makeJob({ fileId: 'file-zero', contentType: 'video/mp4' }), deps);

      // durationSec=0 → durationMs must be null (condition: durationSec > 0).
      const params = mockDbExecute.mock.calls[0]![1] as (string | null | number)[];
      expect(params[0]).toBeNull();        // durationMs = null
    });

    it('sets width and height to null for audio-only assets (no video stream)', async () => {
      const ffmpegMod = await import('fluent-ffmpeg');
      const mockFfprobe = vi.mocked(ffmpegMod.default as never as { ffprobe: (...args: unknown[]) => void });

      const audioProbe = {
        streams: [{ codec_type: 'audio' } as never],
        format: { duration: '107' } as never,
        chapters: [] as never[],
      };
      mockFfprobe.ffprobe.mockImplementationOnce(
        (_input, cb: (err: null, data: typeof audioProbe) => void) => cb(null, audioProbe),
      );

      await processIngestJob(makeJob({ contentType: 'audio/mpeg' }), deps);

      const params = mockDbExecute.mock.calls[0]![1] as (string | null | number)[];
      expect(params[1]).toBeNull();  // width = null (no video stream)
      expect(params[2]).toBeNull();  // height = null (no video stream)
      expect(params[0]).toBe(107_000); // durationMs = 107 * 1000
    });

    it('marks error in files table and re-throws when S3 download fails', async () => {
      const s3Err = new Error('S3 network error');
      mockS3Send.mockRejectedValueOnce(s3Err);

      await expect(processIngestJob(makeJob(), deps)).rejects.toBe(s3Err);

      const call = mockDbExecute.mock.calls[0]!;
      const sql = call[0] as string;
      expect(sql).toContain('UPDATE files');
      expect(sql).toContain("status = 'error'");
      expect(sql).not.toContain('project_assets_current');
      // Error params: [errorMessage, fileId]
      const params = call[1] as (string | null | number)[];
      expect(params[0]).toBe('S3 network error');
      expect(params[1]).toBe('file-123');
    });

    it('uses fileId in the tmp directory name', async () => {
      const fsMod = await import('node:fs/promises');
      const mkdtempSpy = vi.mocked(fsMod.default.mkdtemp);

      await processIngestJob(makeJob({ fileId: 'file-abc' }), deps);

      expect(mkdtempSpy).toHaveBeenCalledWith(
        expect.stringContaining('ingest-file-abc-'),
      );
    });

    it('cleans up the tmp directory in the finally block on success', async () => {
      const fsMod = await import('node:fs/promises');
      const rmSpy = vi.mocked(fsMod.default.rm);

      await processIngestJob(makeJob(), deps);

      expect(rmSpy).toHaveBeenCalledWith('/tmp/ingest-test', { recursive: true, force: true });
    });

    it('cleans up the tmp directory in the finally block on error', async () => {
      const fsMod = await import('node:fs/promises');
      const rmSpy = vi.mocked(fsMod.default.rm);
      mockS3Send.mockRejectedValueOnce(new Error('fail'));

      await expect(processIngestJob(makeJob(), deps)).rejects.toThrow();

      expect(rmSpy).toHaveBeenCalledWith('/tmp/ingest-test', { recursive: true, force: true });
    });
  });
});
