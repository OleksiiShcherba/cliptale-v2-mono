import { describe, it, expect } from 'vitest';

import type { MediaIngestJobPayload, TranscriptionJobPayload } from './job-payloads.js';

describe('TranscriptionJobPayload', () => {
  it('should accept a valid payload with all required fields and no language', () => {
    const payload: TranscriptionJobPayload = {
      assetId: 'asset-001',
      storageUri: 's3://bucket/path/to/file.mp4',
      contentType: 'video/mp4',
    };

    expect(payload.assetId).toBe('asset-001');
    expect(payload.storageUri).toBe('s3://bucket/path/to/file.mp4');
    expect(payload.contentType).toBe('video/mp4');
    expect(payload.language).toBeUndefined();
  });

  it('should accept a payload with an explicit language', () => {
    const payload: TranscriptionJobPayload = {
      assetId: 'asset-002',
      storageUri: 's3://bucket/path/to/audio.mp3',
      contentType: 'audio/mpeg',
      language: 'fr',
    };

    expect(payload.language).toBe('fr');
  });

  it('should accept language as undefined explicitly', () => {
    const payload: TranscriptionJobPayload = {
      assetId: 'asset-003',
      storageUri: 's3://bucket/audio.wav',
      contentType: 'audio/wav',
      language: undefined,
    };

    expect(payload.language).toBeUndefined();
  });
});

describe('MediaIngestJobPayload (regression)', () => {
  it('should still be exported correctly and have the expected shape', () => {
    const payload: MediaIngestJobPayload = {
      assetId: 'asset-100',
      storageUri: 's3://bucket/video.mp4',
      contentType: 'video/mp4',
    };

    expect(payload.assetId).toBe('asset-100');
    expect(payload.storageUri).toBe('s3://bucket/video.mp4');
    expect(payload.contentType).toBe('video/mp4');
  });
});
