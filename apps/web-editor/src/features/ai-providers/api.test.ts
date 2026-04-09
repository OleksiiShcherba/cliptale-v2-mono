import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockApiClient } = vi.hoisted(() => ({
  mockApiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: mockApiClient,
}));

import { listProviders, addProvider, updateProvider, deleteProvider } from './api';

function okResponse(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as unknown as Response;
}

function errorResponse(status: number, body: string): Response {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(body),
  } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ai-providers/api', () => {
  describe('listProviders', () => {
    it('calls GET /user/ai-providers and returns parsed data', async () => {
      const data = [
        { provider: 'openai', isActive: true, isConfigured: true, createdAt: '2026-01-01' },
      ];
      mockApiClient.get.mockResolvedValue(okResponse(data));

      const result = await listProviders();

      expect(mockApiClient.get).toHaveBeenCalledWith('/user/ai-providers');
      expect(result).toEqual(data);
    });

    it('throws on non-ok response', async () => {
      mockApiClient.get.mockResolvedValue(errorResponse(500, 'Internal error'));

      await expect(listProviders()).rejects.toThrow(
        'Failed to list AI providers (500): Internal error',
      );
    });
  });

  describe('addProvider', () => {
    it('calls POST /user/ai-providers with provider and apiKey', async () => {
      mockApiClient.post.mockResolvedValue(okResponse(undefined));

      await addProvider('openai', 'sk-test-key');

      expect(mockApiClient.post).toHaveBeenCalledWith('/user/ai-providers', {
        provider: 'openai',
        apiKey: 'sk-test-key',
      });
    });

    it('throws on non-ok response', async () => {
      mockApiClient.post.mockResolvedValue(errorResponse(400, 'Invalid key'));

      await expect(addProvider('openai', 'bad-key')).rejects.toThrow(
        'Failed to add AI provider (400): Invalid key',
      );
    });
  });

  describe('updateProvider', () => {
    it('calls PATCH /user/ai-providers/:provider with updates', async () => {
      mockApiClient.patch.mockResolvedValue(okResponse(undefined));

      await updateProvider('stability_ai', { isActive: false });

      expect(mockApiClient.patch).toHaveBeenCalledWith(
        '/user/ai-providers/stability_ai',
        { isActive: false },
      );
    });

    it('sends apiKey when updating key', async () => {
      mockApiClient.patch.mockResolvedValue(okResponse(undefined));

      await updateProvider('openai', { apiKey: 'sk-new-key' });

      expect(mockApiClient.patch).toHaveBeenCalledWith(
        '/user/ai-providers/openai',
        { apiKey: 'sk-new-key' },
      );
    });

    it('throws on non-ok response', async () => {
      mockApiClient.patch.mockResolvedValue(errorResponse(404, 'Not found'));

      await expect(
        updateProvider('runway', { isActive: true }),
      ).rejects.toThrow('Failed to update AI provider (404): Not found');
    });
  });

  describe('deleteProvider', () => {
    it('calls DELETE /user/ai-providers/:provider', async () => {
      mockApiClient.delete.mockResolvedValue(okResponse(undefined));

      await deleteProvider('elevenlabs');

      expect(mockApiClient.delete).toHaveBeenCalledWith(
        '/user/ai-providers/elevenlabs',
      );
    });

    it('throws on non-ok response', async () => {
      mockApiClient.delete.mockResolvedValue(errorResponse(403, 'Forbidden'));

      await expect(deleteProvider('suno')).rejects.toThrow(
        'Failed to delete AI provider (403): Forbidden',
      );
    });
  });
});
