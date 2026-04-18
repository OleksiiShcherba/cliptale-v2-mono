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

// Mock fluent-ffmpeg: ffprobe + screenshot + pipe
// vi.mock factories are hoisted above variable declarations, so any variable
// referenced inside a factory must itself be hoisted via vi.hoisted().
const { mockPipeStream, mockFfprobeData } = vi.hoisted(() => {
  const mockPipeStream = {
    on: vi.fn().mockImplementation(function (this: unknown, event: string, cb: (...args: unknown[]) => void) {
      if (event === 'end') setTimeout(() => cb(), 0);
      return this;
    }),
  };

  const mockFfprobeData = {
    streams: [
      { codec_type: 'video', r_frame_rate: '30/1', width: 1920, height: 1080 } as never,
      { codec_type: 'audio' } as never,
    ],
    format: { duration: '10' } as never,
    chapters: [] as never[],
  };

  return { mockPipeStream, mockFfprobeData };
});

vi.mock('fluent-ffmpeg', () => {
  const mockFfmpeg = vi.fn().mockReturnValue({
    screenshots: vi.fn().mockReturnValue({
      on: vi.fn().mockImplementation(function (this: unknown, event: string, cb: () => void) {
        if (event === 'end') setTimeout(cb, 0);
        return this;
      }),
    }),
    noVideo: vi.fn().mockReturnThis(),
    audioChannels: vi.fn().mockReturnThis(),
    audioFrequency: vi.fn().mockReturnThis(),
    format: vi.fn().mockReturnThis(),
    pipe: vi.fn().mockReturnValue(mockPipeStream),
  });
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
      assetId: 'asset-123',
      storageUri: 's3://bucket/projects/p/assets/a/video.mp4',
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

    it('marks asset ready with extracted metadata on happy path', async () => {
      await processIngestJob(makeJob(), deps);

      expect(mockDbExecute).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'ready'"),
        expect.arrayContaining(['asset-123']),
      );
    });

    it('marks asset error and re-throws when S3 download fails', async () => {
      const s3Err = new Error('S3 network error');
      mockS3Send.mockRejectedValueOnce(s3Err);

      await expect(processIngestJob(makeJob(), deps)).rejects.toBe(s3Err);

      expect(mockDbExecute).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'error'"),
        expect.arrayContaining(['S3 network error', 'asset-123']),
      );
    });

    it('skips thumbnail and waveform for image assets', async () => {
      const ffmpegMod = await import('fluent-ffmpeg');
      const mockFfprobe = vi.mocked(ffmpegMod.default as never as { ffprobe: (...args: unknown[]) => void });

      // Image: no video/audio streams, no duration.
      const imageProbe = { streams: [], format: { duration: undefined }, chapters: [] };
      mockFfprobe.ffprobe.mockImplementationOnce(
        (_input, cb: (err: null, data: typeof imageProbe) => void) => cb(null, imageProbe),
      );

      await processIngestJob(makeJob({ contentType: 'image/jpeg' }), deps);

      // waveform_json column should be null (no audio stream).
      const call = mockDbExecute.mock.calls[0]!;
      const params = call[1] as (string | null | number)[];
      // thumbnailUri (index 4) and waveformJson (index 5) are null for images.
      expect(params[4]).toBeNull();
      expect(params[5]).toBeNull();
    });

    it('stores correct durationFrames for audio-only assets using AUDIO_FPS_FALLBACK=30', async () => {
      const ffmpegMod = await import('fluent-ffmpeg');
      const mockFfprobe = vi.mocked(ffmpegMod.default as never as { ffprobe: (...args: unknown[]) => void });

      // Audio-only: no video stream, one audio stream, 107 seconds duration.
      const audioProbe = {
        streams: [{ codec_type: 'audio' } as never],
        format: { duration: '107' } as never,
        chapters: [] as never[],
      };
      mockFfprobe.ffprobe.mockImplementationOnce(
        (_input, cb: (err: null, data: typeof audioProbe) => void) => cb(null, audioProbe),
      );

      await processIngestJob(makeJob({ contentType: 'audio/mpeg' }), deps);

      const call = mockDbExecute.mock.calls[0]!;
      const params = call[1] as (string | null | number)[];
      // setAssetReady params: [durationFrames, width, height, fps, thumbnailUri, waveformJson, assetId]
      // 107s * 30fps = 3210 frames
      expect(params[0]).toBe(3210);        // durationFrames
      expect(params[1]).toBeNull();        // width (no video)
      expect(params[2]).toBeNull();        // height (no video)
      expect(params[3]).toBe(30);          // fps = AUDIO_FPS_FALLBACK
      expect(params[4]).toBeNull();        // thumbnailUri (no video)
    });

    it('stores null durationFrames for audio-only assets with zero duration', async () => {
      const ffmpegMod = await import('fluent-ffmpeg');
      const mockFfprobe = vi.mocked(ffmpegMod.default as never as { ffprobe: (...args: unknown[]) => void });

      // Audio-only: duration is 0 (unknown/unreadable).
      const audioProbe = {
        streams: [{ codec_type: 'audio' } as never],
        format: { duration: '0' } as never,
        chapters: [] as never[],
      };
      mockFfprobe.ffprobe.mockImplementationOnce(
        (_input, cb: (err: null, data: typeof audioProbe) => void) => cb(null, audioProbe),
      );

      await processIngestJob(makeJob({ contentType: 'audio/wav' }), deps);

      const call = mockDbExecute.mock.calls[0]!;
      const params = call[1] as (string | null | number)[];
      // durationSec=0 means durationFrames stays null (fps && durationSec is falsy when durationSec=0)
      expect(params[0]).toBeNull();        // durationFrames = null
      expect(params[3]).toBe(30);          // fps still set to AUDIO_FPS_FALLBACK
    });

    it('does not apply audio fallback fps to video assets', async () => {
      // Default mock ffprobe returns a video stream with r_frame_rate='30/1'.
      await processIngestJob(makeJob({ contentType: 'video/mp4' }), deps);

      const call = mockDbExecute.mock.calls[0]!;
      const params = call[1] as (string | null | number)[];
      // Video: fps comes from the video stream, not the fallback.
      expect(params[3]).toBe(30);          // fps=30 from the actual video stream
      expect(params[0]).toBe(300);         // durationFrames = 10s * 30fps = 300
    });

    // ── fileId branch tests ───────────────────────────────────────────────────

    it('calls setFileReady (not setAssetReady) when fileId is present — happy path', async () => {
      await processIngestJob(
        makeJob({ fileId: 'file-abc', contentType: 'video/mp4' }),
        deps,
      );

      // setFileReady issues an UPDATE against `files`; setAssetReady targets `project_assets_current`.
      const call = mockDbExecute.mock.calls[0]!;
      const sql = call[0] as string;
      expect(sql).toContain('UPDATE files');
      expect(sql).not.toContain('project_assets_current');
      // The last bind parameter must be the fileId, not assetId.
      const params = call[1] as (string | null | number)[];
      expect(params[params.length - 1]).toBe('file-abc');
    });

    it('converts durationSec to durationMs via Math.round(durationSec * 1000) and writes bytes=null', async () => {
      // Default ffprobe mock returns format.duration='10' → durationSec=10.
      await processIngestJob(
        makeJob({ fileId: 'file-abc', contentType: 'video/mp4' }),
        deps,
      );

      // setFileReady params: [durationMs, width, height, bytes, fileId]
      const params = mockDbExecute.mock.calls[0]![1] as (string | null | number)[];
      expect(params[0]).toBe(10_000);      // durationMs = Math.round(10 * 1000)
      expect(params[1]).toBe(1920);        // width from ffprobe
      expect(params[2]).toBe(1080);        // height from ffprobe
      expect(params[3]).toBeNull();        // bytes intentionally null (S3 HEAD not available)
      expect(params[4]).toBe('file-abc');  // fileId as row identifier
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

      await processIngestJob(
        makeJob({ fileId: 'file-zero', contentType: 'video/mp4' }),
        deps,
      );

      // durationSec=0 → durationMs must be null (condition: durationSec > 0).
      const params = mockDbExecute.mock.calls[0]![1] as (string | null | number)[];
      expect(params[0]).toBeNull();        // durationMs = null
    });

    it('calls setFileError (not setAssetError) when fileId is present and ingest fails', async () => {
      const s3Err = new Error('S3 file network error');
      mockS3Send.mockRejectedValueOnce(s3Err);

      await expect(
        processIngestJob(makeJob({ fileId: 'file-err', contentType: 'video/mp4' }), deps),
      ).rejects.toBe(s3Err);

      // setFileError targets `files`; setAssetError targets `project_assets_current`.
      const call = mockDbExecute.mock.calls[0]!;
      const sql = call[0] as string;
      expect(sql).toContain('UPDATE files');
      expect(sql).toContain("status = 'error'");
      expect(sql).not.toContain('project_assets_current');
      // Error params: [errorMessage, fileId]
      const params = call[1] as (string | null | number)[];
      expect(params[0]).toBe('S3 file network error');
      expect(params[1]).toBe('file-err');
    });
  });
});
