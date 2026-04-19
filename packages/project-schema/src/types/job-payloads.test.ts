import { describe, it, expect } from 'vitest';

import type {
  MediaIngestJobPayload,
  TranscriptionJobPayload,
  CaptionWord,
  CaptionSegment,
  RenderPreset,
  RenderVideoJobPayload,
} from './job-payloads.js';

describe('TranscriptionJobPayload', () => {
  it('should accept a valid payload with all required fields and no language', () => {
    const payload: TranscriptionJobPayload = {
      fileId: 'asset-001',
      storageUri: 's3://bucket/path/to/file.mp4',
      contentType: 'video/mp4',
    };

    expect(payload.fileId).toBe('asset-001');
    expect(payload.storageUri).toBe('s3://bucket/path/to/file.mp4');
    expect(payload.contentType).toBe('video/mp4');
    expect(payload.language).toBeUndefined();
  });

  it('should accept a payload with an explicit language', () => {
    const payload: TranscriptionJobPayload = {
      fileId: 'asset-002',
      storageUri: 's3://bucket/path/to/audio.mp3',
      contentType: 'audio/mpeg',
      language: 'fr',
    };

    expect(payload.language).toBe('fr');
  });

  it('should accept language as undefined explicitly', () => {
    const payload: TranscriptionJobPayload = {
      fileId: 'asset-003',
      storageUri: 's3://bucket/audio.wav',
      contentType: 'audio/wav',
      language: undefined,
    };

    expect(payload.language).toBeUndefined();
  });
});

describe('RenderVideoJobPayload', () => {
  it('should accept a valid payload with all required fields', () => {
    const preset: RenderPreset = {
      key: '1080p',
      width: 1920,
      height: 1080,
      fps: 30,
      format: 'mp4',
      codec: 'h264',
    };

    const payload: RenderVideoJobPayload = {
      jobId: 'job-001',
      projectId: 'proj-abc',
      versionId: 42,
      requestedBy: 'user-001',
      preset,
    };

    expect(payload.jobId).toBe('job-001');
    expect(payload.projectId).toBe('proj-abc');
    expect(payload.versionId).toBe(42);
    expect(payload.requestedBy).toBe('user-001');
    expect(payload.preset.key).toBe('1080p');
    expect(payload.preset.width).toBe(1920);
    expect(payload.preset.codec).toBe('h264');
  });

  it('should accept null requestedBy for anonymous render', () => {
    const preset: RenderPreset = {
      key: 'webm',
      width: 1920,
      height: 1080,
      fps: 30,
      format: 'webm',
      codec: 'vp8',
    };

    const payload: RenderVideoJobPayload = {
      jobId: 'job-002',
      projectId: 'proj-xyz',
      versionId: 1,
      requestedBy: null,
      preset,
    };

    expect(payload.requestedBy).toBeNull();
    expect(payload.preset.format).toBe('webm');
  });

  it('should accept vertical preset key', () => {
    const preset: RenderPreset = {
      key: 'vertical',
      width: 1080,
      height: 1920,
      fps: 30,
      format: 'mp4',
      codec: 'h264',
    };

    const payload: RenderVideoJobPayload = {
      jobId: 'job-003',
      projectId: 'proj-vert',
      versionId: 5,
      requestedBy: 'user-002',
      preset,
    };

    expect(payload.preset.key).toBe('vertical');
    expect(payload.preset.height).toBeGreaterThan(payload.preset.width);
  });
});

describe('CaptionSegment', () => {
  it('should accept a segment without words (backward-compatible with existing DB rows)', () => {
    const segment: CaptionSegment = {
      start: 0.0,
      end: 2.5,
      text: 'Hello world',
    };

    expect(segment.start).toBe(0.0);
    expect(segment.end).toBe(2.5);
    expect(segment.text).toBe('Hello world');
    expect(segment.words).toBeUndefined();
  });

  it('should accept a segment with an empty words array', () => {
    const segment: CaptionSegment = {
      start: 0.0,
      end: 2.5,
      text: 'Hello world',
      words: [],
    };

    expect(segment.words).toEqual([]);
  });

  it('should accept a segment with word-level timestamps', () => {
    const words: CaptionWord[] = [
      { word: 'Hello', start: 0.0, end: 0.5 },
      { word: 'world', start: 0.6, end: 1.1 },
    ];

    const segment: CaptionSegment = {
      start: 0.0,
      end: 1.1,
      text: 'Hello world',
      words,
    };

    expect(segment.words).toHaveLength(2);
    expect(segment.words![0].word).toBe('Hello');
    expect(segment.words![0].start).toBe(0.0);
    expect(segment.words![0].end).toBe(0.5);
    expect(segment.words![1].word).toBe('world');
  });

  it('should accept words with floating-point timestamps', () => {
    const segment: CaptionSegment = {
      start: 1.234,
      end: 3.567,
      text: 'The quick brown',
      words: [
        { word: 'The', start: 1.234, end: 1.456 },
        { word: 'quick', start: 1.5, end: 1.8 },
        { word: 'brown', start: 1.9, end: 3.567 },
      ],
    };

    expect(segment.words).toHaveLength(3);
    expect(segment.words![2].word).toBe('brown');
    expect(segment.words![2].end).toBe(3.567);
  });
});

describe('CaptionWord', () => {
  it('should represent a single word with start and end timestamps', () => {
    const word: CaptionWord = { word: 'fox', start: 2.1, end: 2.4 };

    expect(word.word).toBe('fox');
    expect(word.start).toBe(2.1);
    expect(word.end).toBe(2.4);
  });
});

describe('MediaIngestJobPayload (regression)', () => {
  it('accepts a new-path payload with fileId', () => {
    const payload: MediaIngestJobPayload = {
      fileId: 'file-100',
      storageUri: 's3://bucket/video.mp4',
      contentType: 'video/mp4',
    };

    expect(payload.fileId).toBe('file-100');
    expect(payload.storageUri).toBe('s3://bucket/video.mp4');
    expect(payload.contentType).toBe('video/mp4');
  });

  it('accepts a legacy-path payload with assetId only', () => {
    const payload: MediaIngestJobPayload = {
      assetId: 'asset-100',
      storageUri: 's3://bucket/video.mp4',
      contentType: 'video/mp4',
    };

    expect(payload.assetId).toBe('asset-100');
    expect(payload.fileId).toBeUndefined();
  });
});
