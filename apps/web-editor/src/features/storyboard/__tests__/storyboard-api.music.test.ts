import { beforeEach, describe, expect, it, vi } from 'vitest';

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

import {
  fetchStoryboardMusic,
  generatePendingStoryboardMusic,
  generateStoryboardMusicBlock,
  updateStoryboardMusicBlock,
} from '../api';

function mockOkResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(body),
  };
}

function mockErrorResponse(status: number) {
  return {
    ok: false,
    status,
    json: vi.fn().mockResolvedValue({ error: 'failed' }),
  };
}

describe('storyboard music API helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches storyboard music blocks', async () => {
    const response = { items: [{ id: 'music-1', generationStatus: 'ready' }] };
    mockApiClient.get.mockResolvedValue(mockOkResponse(response));

    const result = await fetchStoryboardMusic('draft-abc');

    expect(mockApiClient.get).toHaveBeenCalledWith('/storyboards/draft-abc/music');
    expect(result).toEqual(response);
  });

  it('patches one storyboard music block', async () => {
    const response = { id: 'music-1', volume: 0.4 };
    mockApiClient.patch.mockResolvedValue(mockOkResponse(response));

    const result = await updateStoryboardMusicBlock('draft-abc', 'music-1', {
      volume: 0.4,
      fadeOutS: 1.5,
    });

    expect(mockApiClient.patch).toHaveBeenCalledWith(
      '/storyboards/draft-abc/music/music-1',
      { volume: 0.4, fadeOutS: 1.5 },
    );
    expect(result).toEqual(response);
  });

  it('starts generate-now music for one block', async () => {
    const response = { items: [{ id: 'music-1', generationStatus: 'queued' }] };
    mockApiClient.post.mockResolvedValue(mockOkResponse(response));

    const result = await generateStoryboardMusicBlock('draft-abc', 'music-1');

    expect(mockApiClient.post).toHaveBeenCalledWith(
      '/storyboards/draft-abc/music/music-1/generate',
      {},
    );
    expect(result).toEqual(response);
  });

  it('starts pending generate-on-step3 music', async () => {
    const response = { items: [{ id: 'music-1', generationStatus: 'queued' }] };
    mockApiClient.post.mockResolvedValue(mockOkResponse(response));

    const result = await generatePendingStoryboardMusic('draft-abc');

    expect(mockApiClient.post).toHaveBeenCalledWith(
      '/storyboards/draft-abc/music/generate-pending',
      {},
    );
    expect(result).toEqual(response);
  });

  it('throws when music helper calls fail', async () => {
    mockApiClient.get.mockResolvedValue(mockErrorResponse(404));

    await expect(fetchStoryboardMusic('draft-abc')).rejects.toThrow(
      'GET /storyboards/draft-abc/music failed: 404',
    );
  });
});
