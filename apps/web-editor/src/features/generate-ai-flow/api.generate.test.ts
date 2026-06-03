/**
 * api.ts — estimate + generate client calls (T20 / AC-01, AC-11, AC-13).
 *
 * estimate: POST /generation-flows/:flowId/blocks/:blockId/estimate → CostEstimate.
 * generate: POST /generation-flows/:flowId/blocks/:blockId/generate, REQUIRES an
 * Idempotency-Key header, body { version, acknowledgedCost? } → 202 GenerateAccepted.
 *
 * Convention: mock apiClient (the repo idiom) + assert the request shape, incl. the
 * Idempotency-Key header on generate.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGet, mockPost } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: mockGet, post: mockPost },
  getAuthToken: () => 'tok',
}));

vi.mock('@/lib/config', () => ({
  config: { apiBaseUrl: 'http://api.test' },
}));

import { estimateGeneration, generateBlock, getFileUrl } from './api';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
  vi.restoreAllMocks();
});

describe('estimateGeneration', () => {
  it('POSTs to the block estimate endpoint and returns the CostEstimate', async () => {
    mockPost.mockResolvedValue(
      jsonResponse(200, {
        flowId: 'f1',
        blockId: 'b1',
        modelId: 'fal-ai/x',
        estimate: { currency: 'USD', amount: 0.42 },
        bestEffort: true,
      }),
    );

    const out = await estimateGeneration('f1', 'b1');

    expect(mockPost).toHaveBeenCalledWith('/generation-flows/f1/blocks/b1/estimate', {});
    expect(out.estimate).toEqual({ currency: 'USD', amount: 0.42 });
    expect(out.bestEffort).toBe(true);
  });
});

describe('generateBlock', () => {
  it('POSTs to the generate endpoint with the Idempotency-Key header and version body', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        jsonResponse(202, { jobId: 'j1', blockId: 'b1', status: 'queued' }),
      );

    const out = await generateBlock('f1', 'b1', {
      idempotencyKey: 'key-123',
      version: 7,
      acknowledgedCost: { currency: 'USD', amount: 0.42 },
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/generation-flows/f1/blocks/b1/generate');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toBe('key-123');
    expect(JSON.parse(init.body as string)).toEqual({
      version: 7,
      acknowledgedCost: { currency: 'USD', amount: 0.42 },
    });
    expect(out.jobId).toBe('j1');
    expect(out.status).toBe('queued');
  });
});

describe('getFileUrl', () => {
  it('GETs the file STREAM endpoint and returns the presigned url (result preview AC-08)', async () => {
    mockGet.mockResolvedValue(jsonResponse(200, { url: 'https://cdn.test/result.png' }));

    const url = await getFileUrl('file-9');

    expect(mockGet).toHaveBeenCalledWith('/files/file-9/stream');
    expect(url).toBe('https://cdn.test/result.png');
  });

  it('returns null when the file is not resolvable', async () => {
    mockGet.mockResolvedValue(jsonResponse(404, {}));
    expect(await getFileUrl('missing')).toBeNull();
  });
});
