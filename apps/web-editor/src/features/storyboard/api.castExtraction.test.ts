/**
 * api.ts — reference endpoints that REQUIRE an `Idempotency-Key` header.
 *
 * Regression guard: POST /references/{extract,confirm,blocks/:id/retry} all reject
 * with 400 when the header is missing. The auto-start hook swallows that error
 * silently (0 jobs ever created); confirm/retry surface it as a failed generation.
 * apiClient.post cannot attach a custom header, so these calls use a raw fetch via
 * `postWithIdempotencyKey`; these tests assert the header is actually sent.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
  getAuthToken: () => 'tok',
}));

vi.mock('@/lib/config', () => ({
  config: { apiBaseUrl: 'http://api.test' },
}));

import { startCastExtraction, confirmCast, retryReferenceBlockGeneration } from './api';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('startCastExtraction', () => {
  it('POSTs to the extract endpoint WITH an Idempotency-Key header (AC-01)', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(202, { jobId: 'j1', status: 'queued' }));

    const out = await startCastExtraction('draft-1');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/storyboards/draft-1/references/extract');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toBeTruthy();
    expect(headers['Authorization']).toBe('Bearer tok');
    expect(out).toEqual({ jobId: 'j1', status: 'queued' });
  });

  it('sends a fresh Idempotency-Key on each call', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(202, { jobId: 'j1', status: 'queued' }));

    await startCastExtraction('draft-1');
    await startCastExtraction('draft-1');

    const key1 = (fetchSpy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    const key2 = (fetchSpy.mock.calls[1][1] as RequestInit).headers as Record<string, string>;
    expect(key1['Idempotency-Key']).not.toBe(key2['Idempotency-Key']);
  });

  it('throws when the server rejects (e.g. 400 missing header regression)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(400, { error: 'bad' }));
    await expect(startCastExtraction('draft-1')).rejects.toThrow(/failed: 400/);
  });
});

describe('confirmCast (spend path)', () => {
  it('POSTs to the confirm endpoint WITH an Idempotency-Key header + body', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(200, { blocks: [] }));

    await confirmCast('draft-1', [], 3);

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/storyboards/draft-1/references/confirm');
    const headers = init.headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toBeTruthy();
    expect(JSON.parse(init.body as string)).toEqual({
      entries: [],
      acknowledgedAggregateCredits: 3,
    });
  });
});

describe('retryReferenceBlockGeneration', () => {
  it('POSTs to the retry endpoint WITH an Idempotency-Key header', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(200, { blockId: 'b1', windowStatus: 'pending' }));

    await retryReferenceBlockGeneration('draft-1', 'b1');

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/storyboards/draft-1/references/blocks/b1/retry');
    const headers = init.headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toBeTruthy();
  });
});
