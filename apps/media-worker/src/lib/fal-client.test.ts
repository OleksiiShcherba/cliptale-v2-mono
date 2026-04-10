import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  submitFalJob,
  getFalJobStatus,
  pollFalJob,
} from './fal-client.js';

// ── Constants ────────────────────────────────────────────────────────────────

const MODEL_ID = 'fal-ai/nano-banana-2';
const API_KEY = 'key-xyz';
const REQUEST_ID = 'req-abc-123';

const SUBMIT_URL = `https://queue.fal.run/${MODEL_ID}`;
const STATUS_URL = `https://queue.fal.run/${MODEL_ID}/requests/${REQUEST_ID}/status`;
const RESULT_URL = `https://queue.fal.run/${MODEL_ID}/requests/${REQUEST_ID}`;
// fal.ai authoritative URLs returned in submit response — may differ from constructed URLs for sub-path models
const FAL_STATUS_URL = STATUS_URL;
const RESPONSE_URL = RESULT_URL;

// ── Helpers ──────────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('fal-client / submitFalJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('submits to the queue URL with Authorization: Key and returns the request id', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ request_id: REQUEST_ID, status_url: FAL_STATUS_URL, response_url: RESPONSE_URL }),
    );

    const result = await submitFalJob({
      modelId: MODEL_ID,
      input: { prompt: 'hi' },
      apiKey: API_KEY,
    });

    expect(result).toEqual({ requestId: REQUEST_ID, statusUrl: FAL_STATUS_URL, responseUrl: RESPONSE_URL });
    expect(fetchMock).toHaveBeenCalledOnce();

    const [calledUrl, calledInit] = fetchMock.mock.calls[0]!;
    expect(calledUrl).toBe(SUBMIT_URL);
    expect(calledInit).toBeDefined();
    expect((calledInit as RequestInit).method).toBe('POST');

    const headers = (calledInit as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Key ${API_KEY}`);
    expect(headers['Content-Type']).toBe('application/json');

    const body = JSON.parse((calledInit as RequestInit).body as string);
    expect(body).toEqual({ prompt: 'hi' });
  });

  it('throws with request_id and upstream body on non-2xx responses', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(
        { error: 'invalid input', request_id: 'req-fail' },
        { status: 400 },
      ),
    );

    await expect(
      submitFalJob({
        modelId: MODEL_ID,
        input: { prompt: 'bad' },
        apiKey: API_KEY,
      }),
    ).rejects.toThrow(/request_id.*req-fail.*invalid input/);
  });
});

describe('fal-client / getFalJobStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('returns COMPLETED with output fetched from the result URL', async () => {
    const fetchMock = vi.mocked(fetch);
    const output = { images: [{ url: 'https://v3.fal.media/files/rabbit/abc.png' }] };

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ status: 'COMPLETED' }))
      .mockResolvedValueOnce(jsonResponse(output));

    const result = await getFalJobStatus({
      modelId: MODEL_ID,
      requestId: REQUEST_ID,
      apiKey: API_KEY,
      statusUrl: FAL_STATUS_URL,
      responseUrl: RESPONSE_URL,
    });

    expect(result).toEqual({ status: 'COMPLETED', output });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]![0]).toBe(FAL_STATUS_URL);
    expect(fetchMock.mock.calls[1]![0]).toBe(RESPONSE_URL);

    const resultInit = fetchMock.mock.calls[1]![1] as RequestInit;
    expect(resultInit.method).toBe('GET');
    expect((resultInit.headers as Record<string, string>).Authorization).toBe(
      `Key ${API_KEY}`,
    );
  });

  it('returns IN_PROGRESS without calling the result URL', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'IN_PROGRESS' }));

    const result = await getFalJobStatus({
      modelId: MODEL_ID,
      requestId: REQUEST_ID,
      apiKey: API_KEY,
      statusUrl: FAL_STATUS_URL,
      responseUrl: RESPONSE_URL,
    });

    expect(result).toEqual({ status: 'IN_PROGRESS' });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe('fal-client / pollFalJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('polls until COMPLETED and returns the output payload', async () => {
    const fetchMock = vi.mocked(fetch);
    const output = { images: [{ url: 'https://v3.fal.media/files/rabbit/final.png' }] };

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ status: 'IN_QUEUE' }))
      .mockResolvedValueOnce(jsonResponse({ status: 'IN_PROGRESS' }))
      .mockResolvedValueOnce(jsonResponse({ status: 'COMPLETED' }))
      .mockResolvedValueOnce(jsonResponse(output));

    const result = await pollFalJob({
      modelId: MODEL_ID,
      requestId: REQUEST_ID,
      apiKey: API_KEY,
      statusUrl: FAL_STATUS_URL,
      responseUrl: RESPONSE_URL,
      options: { intervalMs: 1, timeoutMs: 5_000 },
    });

    expect(result).toEqual(output);
    // 3 status calls + 1 result fetch on COMPLETED
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('throws a timeout error when the deadline is exceeded', async () => {
    vi.mocked(fetch).mockImplementation(async () =>
      jsonResponse({ status: 'IN_PROGRESS' }),
    );

    await expect(
      pollFalJob({
        modelId: MODEL_ID,
        requestId: REQUEST_ID,
        apiKey: API_KEY,
        statusUrl: FAL_STATUS_URL,
        responseUrl: RESPONSE_URL,
        options: { intervalMs: 10, timeoutMs: 50 },
      }),
    ).rejects.toThrow(/timed out/);
  });

  it('throws when the status endpoint returns a non-2xx response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(
        { error: 'model crashed', request_id: REQUEST_ID },
        { status: 500 },
      ),
    );

    await expect(
      pollFalJob({
        modelId: MODEL_ID,
        requestId: REQUEST_ID,
        apiKey: API_KEY,
        statusUrl: FAL_STATUS_URL,
        responseUrl: RESPONSE_URL,
        options: { intervalMs: 1, timeoutMs: 5_000 },
      }),
    ).rejects.toThrow(/request_id.*req-abc-123.*model crashed/);
  });

  it('throws when status is reported as FAILED', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ status: 'FAILED', output: { error: 'model crashed' } }),
    );

    await expect(
      pollFalJob({
        modelId: MODEL_ID,
        requestId: REQUEST_ID,
        apiKey: API_KEY,
        statusUrl: FAL_STATUS_URL,
        responseUrl: RESPONSE_URL,
        options: { intervalMs: 1, timeoutMs: 5_000 },
      }),
    ).rejects.toThrow(/FAILED.*model crashed/);
  });
});
