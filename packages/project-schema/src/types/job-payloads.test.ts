import { describe, it, expect } from 'vitest';

import type {
  MediaIngestJobPayload,
  TranscriptionJobPayload,
  RenderPreset,
  RenderVideoJobPayload,
} from './job-payloads.js';

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
