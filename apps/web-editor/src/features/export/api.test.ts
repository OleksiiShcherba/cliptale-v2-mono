import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockApiClient } = vi.hoisted(() => ({
  mockApiClient: {
    post: vi.fn(),
    get: vi.fn(),
  },
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: mockApiClient,
}));

import { createRender, CONCURRENT_RENDER_LIMIT_MESSAGE } from './api';

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

// ---------------------------------------------------------------------------
// Tests — createRender
// ---------------------------------------------------------------------------

describe('createRender', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Happy path ─────────────────────────────────────────────────────────────

  it('returns CreateRenderResponse on 201 success', async () => {
    const responseBody = { jobId: 'job-abc', status: 'queued' };
    mockApiClient.post.mockResolvedValue(makeResponse(201, responseBody));

    const result = await createRender('project-1', 7, '1080p');

    expect(result).toEqual(responseBody);
  });

  it('calls apiClient.post with the correct path and payload', async () => {
    mockApiClient.post.mockResolvedValue(makeResponse(201, { jobId: 'x', status: 'queued' }));

    await createRender('project-xyz', 42, '4k');

    expect(mockApiClient.post).toHaveBeenCalledWith('/projects/project-xyz/renders', {
      versionId: 42,
      presetKey: '4k',
    });
  });

  // ── 409 Concurrent render limit ────────────────────────────────────────────

  it('throws the user-friendly message when the API returns 409', async () => {
    mockApiClient.post.mockResolvedValue(
      makeResponse(409, 'You already have 2 active render job(s). Maximum concurrent renders per user is 2.'),
    );

    await expect(createRender('project-1', 7, '1080p')).rejects.toThrow(
      CONCURRENT_RENDER_LIMIT_MESSAGE,
    );
  });

  it('does not include raw backend text in the 409 error message', async () => {
    mockApiClient.post.mockResolvedValue(
      makeResponse(409, 'You already have 2 active render job(s). Maximum concurrent renders per user is 2.'),
    );

    let thrown: Error | undefined;
    try {
      await createRender('project-1', 7, '1080p');
    } catch (err) {
      thrown = err as Error;
    }

    expect(thrown).toBeDefined();
    expect(thrown!.message).not.toContain('Maximum concurrent renders per user');
    expect(thrown!.message).not.toContain('active render job');
  });

  it('CONCURRENT_RENDER_LIMIT_MESSAGE is exported and matches the expected user-friendly text', () => {
    expect(CONCURRENT_RENDER_LIMIT_MESSAGE).toBe(
      'You can only have 2 exports running at once. Please wait for one to finish before starting another.',
    );
  });

  // ── Other error statuses ───────────────────────────────────────────────────

  it('throws a generic error message on 400 (not user-friendly 409 message)', async () => {
    mockApiClient.post.mockResolvedValue(makeResponse(400, 'invalid preset key'));

    await expect(createRender('project-1', 7, 'invalid-preset' as never)).rejects.toThrow(
      'Failed to start render (400)',
    );
  });

  it('throws a generic error message on 500 (not user-friendly 409 message)', async () => {
    mockApiClient.post.mockResolvedValue(makeResponse(500, 'internal server error'));

    await expect(createRender('project-1', 7, '1080p')).rejects.toThrow(
      'Failed to start render (500)',
    );
  });

  it('throws a generic error message on 404 (not user-friendly 409 message)', async () => {
    mockApiClient.post.mockResolvedValue(makeResponse(404, 'project not found'));

    await expect(createRender('project-1', 7, '1080p')).rejects.toThrow(
      'Failed to start render (404)',
    );
  });

  it('generic errors include the status code in the message', async () => {
    mockApiClient.post.mockResolvedValue(makeResponse(422, 'unprocessable entity'));

    let thrown: Error | undefined;
    try {
      await createRender('project-1', 7, '1080p');
    } catch (err) {
      thrown = err as Error;
    }

    expect(thrown).toBeDefined();
    expect(thrown!.message).toContain('422');
  });

  it('generic errors do not throw CONCURRENT_RENDER_LIMIT_MESSAGE for non-409 statuses', async () => {
    mockApiClient.post.mockResolvedValue(makeResponse(503, 'service unavailable'));

    let thrown: Error | undefined;
    try {
      await createRender('project-1', 7, '1080p');
    } catch (err) {
      thrown = err as Error;
    }

    expect(thrown).toBeDefined();
    expect(thrown!.message).not.toBe(CONCURRENT_RENDER_LIMIT_MESSAGE);
  });
});
