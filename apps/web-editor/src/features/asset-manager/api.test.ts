import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockApiClient } = vi.hoisted(() => ({
  mockApiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: mockApiClient,
}));

import { updateAsset } from './api';
import type { Asset } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: vi.fn().mockResolvedValue(typeof body === 'string' ? body : JSON.stringify(body)),
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'asset-001',
    projectId: 'proj-001',
    filename: 'clip.mp4',
    displayName: null,
    contentType: 'video/mp4',
    downloadUrl: 'https://example.com/presigned/clip.mp4',
    status: 'ready',
    durationSeconds: 10,
    width: 1920,
    height: 1080,
    fileSizeBytes: 5_000_000,
    thumbnailUri: null,
    waveformPeaks: null,
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests — updateAsset
// ---------------------------------------------------------------------------

describe('updateAsset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Happy path ─────────────────────────────────────────────────────────────

  it('returns the updated Asset on 200 success', async () => {
    const updatedAsset = makeAsset({ displayName: 'My Renamed Clip' });
    mockApiClient.patch.mockResolvedValue(makeResponse(200, updatedAsset));

    const result = await updateAsset('asset-001', 'My Renamed Clip');

    expect(result).toEqual(updatedAsset);
  });

  it('calls apiClient.patch with the correct path', async () => {
    mockApiClient.patch.mockResolvedValue(makeResponse(200, makeAsset({ displayName: 'New Name' })));

    await updateAsset('asset-abc', 'New Name');

    expect(mockApiClient.patch).toHaveBeenCalledWith(
      '/assets/asset-abc',
      expect.anything(),
    );
  });

  it('sends the display name as the "name" field in the request body', async () => {
    mockApiClient.patch.mockResolvedValue(makeResponse(200, makeAsset({ displayName: 'New Name' })));

    await updateAsset('asset-abc', 'New Name');

    expect(mockApiClient.patch).toHaveBeenCalledWith(
      expect.anything(),
      { name: 'New Name' },
    );
  });

  it('includes the status code in the error message on 400', async () => {
    mockApiClient.patch.mockResolvedValue(makeResponse(400, 'display_name too long'));

    await expect(updateAsset('asset-001', 'x'.repeat(300))).rejects.toThrow('400');
  });

  it('throws with "Failed to update asset" prefix on error', async () => {
    mockApiClient.patch.mockResolvedValue(makeResponse(400, 'validation error'));

    await expect(updateAsset('asset-001', '')).rejects.toThrow('Failed to update asset');
  });

  it('throws on 404 when asset does not exist', async () => {
    mockApiClient.patch.mockResolvedValue(makeResponse(404, 'Not Found'));

    await expect(updateAsset('asset-nonexistent', 'Name')).rejects.toThrow('404');
  });

  it('throws on 403 / ownership mismatch', async () => {
    mockApiClient.patch.mockResolvedValue(makeResponse(404, 'Not Found'));

    await expect(updateAsset('asset-other-user', 'Name')).rejects.toThrow('Failed to update asset');
  });

  it('throws on 500 server error', async () => {
    mockApiClient.patch.mockResolvedValue(makeResponse(500, 'Internal Server Error'));

    await expect(updateAsset('asset-001', 'Name')).rejects.toThrow('500');
  });

  // ── Response shape ─────────────────────────────────────────────────────────

  it('returns the displayName from the response body', async () => {
    const asset = makeAsset({ id: 'asset-001', displayName: 'My Cool Clip' });
    mockApiClient.patch.mockResolvedValue(makeResponse(200, asset));

    const result = await updateAsset('asset-001', 'My Cool Clip');

    expect(result.displayName).toBe('My Cool Clip');
  });

  it('returns null displayName when the server echoes null', async () => {
    const asset = makeAsset({ displayName: null });
    mockApiClient.patch.mockResolvedValue(makeResponse(200, asset));

    const result = await updateAsset('asset-001', 'any');

    expect(result.displayName).toBeNull();
  });
});
