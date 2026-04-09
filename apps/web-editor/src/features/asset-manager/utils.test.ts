import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { buildClipForAsset, computeClipDurationFrames, getAssetPreviewUrl } from './utils';
import type { Asset } from './types';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

// Minimal asset fixture for getAssetPreviewUrl tests
function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'asset-001',
    projectId: 'proj-001',
    filename: 'file.mp4',
    contentType: 'video/mp4',
    downloadUrl: 'https://example.com/presigned',
    status: 'ready',
    durationSeconds: 10,
    width: 1920,
    height: 1080,
    fileSizeBytes: 5_000_000,
    thumbnailUri: null,
    waveformPeaks: null,
    createdAt: '2026-04-06T00:00:00.000Z',
    updatedAt: '2026-04-06T00:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// getAssetPreviewUrl
// ---------------------------------------------------------------------------

describe('getAssetPreviewUrl', () => {
  const API_BASE = 'http://localhost:3001';

  it('returns thumbnailUri when set (regardless of content type)', () => {
    const asset = makeAsset({ thumbnailUri: 'http://api/assets/asset-001/thumbnail', contentType: 'video/mp4' });
    expect(getAssetPreviewUrl(asset, API_BASE)).toBe('http://api/assets/asset-001/thumbnail');
  });

  it('returns the stream URL for a ready image asset with no thumbnailUri', () => {
    const asset = makeAsset({ contentType: 'image/png', thumbnailUri: null, status: 'ready' });
    expect(getAssetPreviewUrl(asset, API_BASE)).toBe('http://localhost:3001/assets/asset-001/stream');
  });

  it('returns the stream URL for image/jpeg ready asset', () => {
    const asset = makeAsset({ contentType: 'image/jpeg', thumbnailUri: null, status: 'ready' });
    expect(getAssetPreviewUrl(asset, API_BASE)).toBe('http://localhost:3001/assets/asset-001/stream');
  });

  it('returns null for a processing image asset (stream may not be ready)', () => {
    const asset = makeAsset({ contentType: 'image/png', thumbnailUri: null, status: 'processing' });
    expect(getAssetPreviewUrl(asset, API_BASE)).toBeNull();
  });

  it('returns null for a pending image asset', () => {
    const asset = makeAsset({ contentType: 'image/png', thumbnailUri: null, status: 'pending' });
    expect(getAssetPreviewUrl(asset, API_BASE)).toBeNull();
  });

  it('returns null for a ready audio asset with no thumbnailUri', () => {
    const asset = makeAsset({ contentType: 'audio/mpeg', thumbnailUri: null, status: 'ready' });
    expect(getAssetPreviewUrl(asset, API_BASE)).toBeNull();
  });

  it('returns null for a ready video asset with no thumbnailUri (no fallback for video)', () => {
    const asset = makeAsset({ contentType: 'video/mp4', thumbnailUri: null, status: 'ready' });
    expect(getAssetPreviewUrl(asset, API_BASE)).toBeNull();
  });

  it('returns null for unknown content type', () => {
    const asset = makeAsset({ contentType: 'application/pdf', thumbnailUri: null, status: 'ready' });
    expect(getAssetPreviewUrl(asset, API_BASE)).toBeNull();
  });

  it('uses the provided apiBaseUrl correctly', () => {
    const asset = makeAsset({ id: 'img-999', contentType: 'image/png', thumbnailUri: null, status: 'ready' });
    expect(getAssetPreviewUrl(asset, 'https://api.example.com')).toBe('https://api.example.com/assets/img-999/stream');
  });

  it('appends auth token to thumbnailUri when token is in localStorage', () => {
    localStorage.setItem('auth_token', 'test-token-123');
    const asset = makeAsset({ thumbnailUri: 'http://api/assets/asset-001/thumbnail', contentType: 'video/mp4' });
    const result = getAssetPreviewUrl(asset, 'http://localhost:3001');
    expect(result).toBe('http://api/assets/asset-001/thumbnail?token=test-token-123');
  });

  it('appends auth token to stream URL for image assets when token is in localStorage', () => {
    localStorage.setItem('auth_token', 'my-secure-token');
    const asset = makeAsset({ id: 'img-456', contentType: 'image/png', thumbnailUri: null, status: 'ready' });
    const result = getAssetPreviewUrl(asset, 'http://localhost:3001');
    expect(result).toBe('http://localhost:3001/assets/img-456/stream?token=my-secure-token');
  });

  it('handles special characters in token by URL-encoding them', () => {
    localStorage.setItem('auth_token', 'token+with/special=chars');
    const asset = makeAsset({ id: 'img-789', contentType: 'image/jpeg', thumbnailUri: null, status: 'ready' });
    const result = getAssetPreviewUrl(asset, 'http://localhost:3001');
    // Token should be URL-encoded
    expect(result).toContain('token=');
    expect(result).not.toContain('+with/special=chars'); // Raw form should not appear
  });

  it('does not append token if URL already has query parameters', () => {
    localStorage.setItem('auth_token', 'token123');
    const asset = makeAsset({ thumbnailUri: 'http://api/assets/asset-001/thumbnail?v=1', contentType: 'video/mp4' });
    const result = getAssetPreviewUrl(asset, 'http://localhost:3001');
    // Should use & separator when URL already has query params
    expect(result).toContain('?v=1&token=token123');
  });
});

// ---------------------------------------------------------------------------
// buildClipForAsset
// ---------------------------------------------------------------------------

describe('buildClipForAsset', () => {
  const ASSET_ID = 'asset-001';
  const TRACK_ID = 'track-001';
  const START_FRAME = 10;
  const DURATION_FRAMES = 90;

  it('builds a VideoClip for video/* content type', () => {
    const clip = buildClipForAsset('video/mp4', ASSET_ID, TRACK_ID, START_FRAME, DURATION_FRAMES);
    expect(clip).not.toBeNull();
    expect(clip!.type).toBe('video');
    expect(clip!.assetId).toBe(ASSET_ID);
    expect(clip!.trackId).toBe(TRACK_ID);
    expect(clip!.startFrame).toBe(START_FRAME);
    expect(clip!.durationFrames).toBe(DURATION_FRAMES);
  });

  it('sets trimInFrame=0 and volume=1 and opacity=1 on VideoClip', () => {
    const clip = buildClipForAsset('video/mp4', ASSET_ID, TRACK_ID, 0, 30);
    expect(clip).not.toBeNull();
    expect((clip as { trimInFrame: number }).trimInFrame).toBe(0);
    expect((clip as { volume: number }).volume).toBe(1);
    expect((clip as { opacity: number }).opacity).toBe(1);
  });

  it('builds an AudioClip for audio/* content type', () => {
    const clip = buildClipForAsset('audio/mpeg', ASSET_ID, TRACK_ID, START_FRAME, DURATION_FRAMES);
    expect(clip).not.toBeNull();
    expect(clip!.type).toBe('audio');
    expect(clip!.assetId).toBe(ASSET_ID);
    expect(clip!.trackId).toBe(TRACK_ID);
    expect(clip!.startFrame).toBe(START_FRAME);
    expect(clip!.durationFrames).toBe(DURATION_FRAMES);
  });

  it('builds an ImageClip for image/* content type', () => {
    const clip = buildClipForAsset('image/png', ASSET_ID, TRACK_ID, START_FRAME, DURATION_FRAMES);
    expect(clip).not.toBeNull();
    expect(clip!.type).toBe('image');
    expect(clip!.assetId).toBe(ASSET_ID);
    expect(clip!.trackId).toBe(TRACK_ID);
    expect(clip!.startFrame).toBe(START_FRAME);
    expect(clip!.durationFrames).toBe(DURATION_FRAMES);
  });

  it('sets opacity=1 on ImageClip (no volume field)', () => {
    const clip = buildClipForAsset('image/jpeg', ASSET_ID, TRACK_ID, 0, 30);
    expect(clip).not.toBeNull();
    expect((clip as { opacity: number }).opacity).toBe(1);
    expect('volume' in clip!).toBe(false);
  });

  it('returns null for unsupported content types', () => {
    expect(buildClipForAsset('application/pdf', ASSET_ID, TRACK_ID, 0, 30)).toBeNull();
    expect(buildClipForAsset('text/plain', ASSET_ID, TRACK_ID, 0, 30)).toBeNull();
    expect(buildClipForAsset('application/zip', ASSET_ID, TRACK_ID, 0, 30)).toBeNull();
  });

  it('generates a unique id on each call', () => {
    const a = buildClipForAsset('video/mp4', ASSET_ID, TRACK_ID, 0, 30);
    const b = buildClipForAsset('video/mp4', ASSET_ID, TRACK_ID, 0, 30);
    expect(a!.id).not.toBe(b!.id);
  });
});

// ---------------------------------------------------------------------------
// computeClipDurationFrames
// ---------------------------------------------------------------------------

describe('computeClipDurationFrames', () => {
  it('converts durationSeconds to frames at 30fps', () => {
    expect(computeClipDurationFrames(5, 30)).toBe(150);
  });

  it('rounds fractional seconds * fps to the nearest frame', () => {
    // 1.5s * 30fps = 45 frames (exact)
    expect(computeClipDurationFrames(1.5, 30)).toBe(45);
  });

  it('returns fps*5 when durationSeconds is null (image fallback)', () => {
    expect(computeClipDurationFrames(null, 30)).toBe(150);
    expect(computeClipDurationFrames(null, 24)).toBe(120);
  });

  it('returns fps*5 when durationSeconds is 0', () => {
    expect(computeClipDurationFrames(0, 30)).toBe(150);
  });

  it('ensures minimum of 1 frame for very short clips', () => {
    // 0.001s * 30fps = 0.03 → rounds to 0 → clamped to 1
    expect(computeClipDurationFrames(0.001, 30)).toBeGreaterThanOrEqual(1);
  });
});
