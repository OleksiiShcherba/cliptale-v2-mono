/**
 * Controller tests for generation-flow.controller.ts.
 *
 * Tests are route-level (handler functions called directly) with the service
 * mocked. Covers each outcome:
 *   - list: owner-scoped, returns paginated { items, nextCursor }
 *   - create: 201 with new flow
 *   - get: owner 200 / non-owner → service throws NotFoundError → next(err)
 *   - rename: 200 with updated summary / NotFoundError → next(err)
 *   - delete: 204 / NotFoundError → next(err)
 *   - canvas save: 200 version-bump / stale → OptimisticLockError → next(err)
 *   - validation: bad body → 400 before service is called
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

import {
  NotFoundError,
  OptimisticLockError,
  ValidationError,
  RequiredInputMissingError,
  ExclusivityViolationError,
  AssetMissingError,
  ContentInvalidError,
  RateLimitedError,
} from '@/lib/errors.js';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const mockService = vi.hoisted(() => ({
  listFlows: vi.fn(),
  createFlow: vi.fn(),
  openFlow: vi.fn(),
  renameFlow: vi.fn(),
  deleteFlow: vi.fn(),
  saveCanvas: vi.fn(),
}));

const mockGenerateService = vi.hoisted(() => ({
  estimateBlockCost: vi.fn(),
  generate: vi.fn(),
}));

vi.mock('@/services/generation-flow.service.js', () => mockService);
vi.mock('@/services/flow-generate.service.js', () => mockGenerateService);

// Import handlers AFTER mocking
import {
  listFlows,
  createFlow,
  getFlow,
  renameFlow,
  deleteFlow,
  saveCanvas,
  estimateCost,
  generateBlock,
} from './generation-flow.controller.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const USER = { userId: 'user-001', email: 'a@b.com', displayName: 'Alice' };

function makeReq(
  opts: {
    params?: Record<string, string>;
    body?: unknown;
    query?: Record<string, string>;
    headers?: Record<string, string>;
  } = {},
): Request {
  const headers = opts.headers ?? {};
  // Case-insensitive header lookup mirroring Express's req.get / req.header.
  const lookup = (name: string): string | undefined => {
    const lower = name.toLowerCase();
    const found = Object.keys(headers).find((k) => k.toLowerCase() === lower);
    return found ? headers[found] : undefined;
  };
  return {
    params: opts.params ?? {},
    body: opts.body ?? {},
    query: opts.query ?? {},
    headers,
    user: USER,
    protocol: 'http',
    get: vi.fn((name: string) => (name.toLowerCase() === 'host' ? 'localhost:3001' : lookup(name))),
    header: vi.fn((name: string) => lookup(name)),
  } as unknown as Request;
}

function makeRes(): { res: Response; status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> } {
  const end = vi.fn().mockReturnThis();
  const json = vi.fn().mockReturnThis();
  const status = vi.fn().mockReturnThis();
  // Wire: res.status(n).json(body) and res.status(n).end()
  status.mockReturnValue({ json, end });
  const res = { status, json, end } as unknown as Response;
  return { res, status, json, end };
}

function makeNext(): NextFunction {
  return vi.fn() as unknown as NextFunction;
}

const FLOW_RECORD = {
  flowId: 'flow-aaa',
  userId: USER.userId,
  title: 'My flow',
  canvas: { blocks: [], edges: [] },
  version: 1,
  createdAt: new Date('2026-06-01T00:00:00Z'),
  updatedAt: new Date('2026-06-01T00:00:00Z'),
  deletedAt: null,
  // AC-12 / ADR-0010: listFlows returns FlowWithBadge (badge is derived from the link).
  draftBadge: null as { draftId: string } | null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ── listFlows ─────────────────────────────────────────────────────────────────

describe('listFlows handler', () => {
  it('returns { items, nextCursor:null } when service returns an array', async () => {
    mockService.listFlows.mockResolvedValueOnce([FLOW_RECORD]);
    const req = makeReq({ query: {} });
    const { res, json } = makeRes();
    const next = makeNext();

    await listFlows(req, res, next);

    expect(mockService.listFlows).toHaveBeenCalledWith(USER.userId);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        items: expect.arrayContaining([expect.objectContaining({ flowId: 'flow-aaa' })]),
        nextCursor: null,
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('returns empty items when user has no flows', async () => {
    mockService.listFlows.mockResolvedValueOnce([]);
    const req = makeReq();
    const { res, json } = makeRes();
    const next = makeNext();

    await listFlows(req, res, next);

    expect(json).toHaveBeenCalledWith({ items: [], nextCursor: null });
  });

  it('passes service errors to next()', async () => {
    const err = new Error('db boom');
    mockService.listFlows.mockRejectedValueOnce(err);
    const req = makeReq();
    const { res } = makeRes();
    const next = makeNext();

    await listFlows(req, res, next);

    expect(next).toHaveBeenCalledWith(err);
  });
});

// ── createFlow ────────────────────────────────────────────────────────────────

describe('createFlow handler', () => {
  it('returns 201 with the new flow when body is valid', async () => {
    mockService.createFlow.mockResolvedValueOnce(FLOW_RECORD);
    const req = makeReq({ body: { title: 'My flow' } });
    const { res, status, json } = makeRes();
    const next = makeNext();

    await createFlow(req, res, next);

    expect(mockService.createFlow).toHaveBeenCalledWith(USER.userId, 'My flow');
    expect(status).toHaveBeenCalledWith(201);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ flowId: 'flow-aaa' }));
    expect(next).not.toHaveBeenCalled();
  });

  it('uses default title "Untitled flow" when body.title is omitted', async () => {
    mockService.createFlow.mockResolvedValueOnce(FLOW_RECORD);
    const req = makeReq({ body: {} });
    const { res } = makeRes();
    const next = makeNext();

    await createFlow(req, res, next);

    expect(mockService.createFlow).toHaveBeenCalledWith(USER.userId, 'Untitled flow');
  });

  it('calls next(ValidationError) when title is too long (>255)', async () => {
    const req = makeReq({ body: { title: 'x'.repeat(256) } });
    const { res } = makeRes();
    const next = makeNext();

    await createFlow(req, res, next);

    expect(mockService.createFlow).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0]![0]).toBeInstanceOf(ValidationError);
  });

  it('passes service errors to next()', async () => {
    const err = new Error('db boom');
    mockService.createFlow.mockRejectedValueOnce(err);
    const req = makeReq({ body: {} });
    const { res } = makeRes();
    const next = makeNext();

    await createFlow(req, res, next);

    expect(next).toHaveBeenCalledWith(err);
  });
});

// ── getFlow ───────────────────────────────────────────────────────────────────

describe('getFlow handler', () => {
  it('returns 200 with the full flow on success', async () => {
    mockService.openFlow.mockResolvedValueOnce({ flow: FLOW_RECORD, jobs: [] });
    const req = makeReq({ params: { flowId: 'flow-aaa' } });
    const { res, json } = makeRes();
    const next = makeNext();

    await getFlow(req, res, next);

    expect(mockService.openFlow).toHaveBeenCalledWith('flow-aaa', USER.userId);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ flowId: 'flow-aaa', jobs: [] }));
    expect(next).not.toHaveBeenCalled();
  });

  it('forwards NotFoundError to next() for non-owner (existence hiding)', async () => {
    const err = new NotFoundError('Flow not found');
    mockService.openFlow.mockRejectedValueOnce(err);
    const req = makeReq({ params: { flowId: 'flow-xxx' } });
    const { res } = makeRes();
    const next = makeNext();

    await getFlow(req, res, next);

    expect(next).toHaveBeenCalledWith(err);
  });

  it('maps each job to a JobState carrying createdAt (so the client can pick the latest run)', async () => {
    const job = {
      jobId: 'job-1',
      blockId: 'g1',
      status: 'completed',
      progress: 100,
      outputFileId: 'file-1',
      resultUrl: null,
      errorMessage: null,
      createdAt: new Date('2026-06-02T00:00:00Z'),
    } as never;
    mockService.openFlow.mockResolvedValueOnce({ flow: FLOW_RECORD, jobs: [job] });
    const req = makeReq({ params: { flowId: 'flow-aaa' } });
    const { res, json } = makeRes();
    const next = makeNext();

    await getFlow(req, res, next);

    const arg = (json as ReturnType<typeof vi.fn>).mock.calls[0]![0] as { jobs: Array<Record<string, unknown>> };
    expect(arg.jobs[0]).toMatchObject({
      jobId: 'job-1',
      blockId: 'g1',
      createdAt: '2026-06-02T00:00:00.000Z',
    });
  });
});

// ── renameFlow ────────────────────────────────────────────────────────────────

describe('renameFlow handler', () => {
  it('returns 200 with summary on success', async () => {
    const updated = { ...FLOW_RECORD, title: 'New title' };
    mockService.renameFlow.mockResolvedValueOnce(updated);
    const req = makeReq({ params: { flowId: 'flow-aaa' }, body: { title: 'New title' } });
    const { res, json } = makeRes();
    const next = makeNext();

    await renameFlow(req, res, next);

    expect(mockService.renameFlow).toHaveBeenCalledWith('flow-aaa', USER.userId, 'New title');
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ title: 'New title' }));
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next(ValidationError) when title is missing', async () => {
    const req = makeReq({ params: { flowId: 'flow-aaa' }, body: {} });
    const { res } = makeRes();
    const next = makeNext();

    await renameFlow(req, res, next);

    expect(mockService.renameFlow).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0]![0]).toBeInstanceOf(ValidationError);
  });

  it('calls next(ValidationError) when title is empty string', async () => {
    const req = makeReq({ params: { flowId: 'flow-aaa' }, body: { title: '' } });
    const { res } = makeRes();
    const next = makeNext();

    await renameFlow(req, res, next);

    expect(mockService.renameFlow).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0]![0]).toBeInstanceOf(ValidationError);
  });

  it('forwards NotFoundError to next() for non-owner', async () => {
    const err = new NotFoundError('Flow not found');
    mockService.renameFlow.mockRejectedValueOnce(err);
    const req = makeReq({ params: { flowId: 'flow-xxx' }, body: { title: 'X' } });
    const { res } = makeRes();
    const next = makeNext();

    await renameFlow(req, res, next);

    expect(next).toHaveBeenCalledWith(err);
  });
});

// ── deleteFlow ────────────────────────────────────────────────────────────────

describe('deleteFlow handler', () => {
  it('returns 204 on success', async () => {
    mockService.deleteFlow.mockResolvedValueOnce(undefined);
    const req = makeReq({ params: { flowId: 'flow-aaa' } });
    const { res, status, end } = makeRes();
    const next = makeNext();

    await deleteFlow(req, res, next);

    // confirm defaults to false when ?confirm is absent (OpenAPI lines 681-686).
    expect(mockService.deleteFlow).toHaveBeenCalledWith('flow-aaa', USER.userId, false);
    expect(status).toHaveBeenCalledWith(204);
    expect(end).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('forwards NotFoundError to next() for non-owner', async () => {
    const err = new NotFoundError('Flow not found');
    mockService.deleteFlow.mockRejectedValueOnce(err);
    const req = makeReq({ params: { flowId: 'flow-xxx' } });
    const { res } = makeRes();
    const next = makeNext();

    await deleteFlow(req, res, next);

    expect(next).toHaveBeenCalledWith(err);
  });
});

// ── saveCanvas ────────────────────────────────────────────────────────────────

describe('saveCanvas handler', () => {
  const validBody = {
    version: 1,
    canvas: { blocks: [], edges: [] },
  };

  it('returns 200 with version bump on success', async () => {
    const saved = { ...FLOW_RECORD, version: 2, updatedAt: new Date('2026-06-03T10:00:00Z') };
    mockService.saveCanvas.mockResolvedValueOnce(saved);
    const req = makeReq({ params: { flowId: 'flow-aaa' }, body: validBody });
    const { res, json } = makeRes();
    const next = makeNext();

    await saveCanvas(req, res, next);

    expect(mockService.saveCanvas).toHaveBeenCalledWith(
      'flow-aaa',
      USER.userId,
      validBody.canvas,
      1,
    );
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ flowId: 'flow-aaa', version: 2 }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('forwards OptimisticLockError to next() on stale version (→ 409)', async () => {
    const err = new OptimisticLockError('Version conflict');
    mockService.saveCanvas.mockRejectedValueOnce(err);
    const req = makeReq({ params: { flowId: 'flow-aaa' }, body: validBody });
    const { res } = makeRes();
    const next = makeNext();

    await saveCanvas(req, res, next);

    expect(next).toHaveBeenCalledWith(err);
  });

  it('calls next(ValidationError) when version is missing', async () => {
    const req = makeReq({ params: { flowId: 'flow-aaa' }, body: { canvas: { blocks: [], edges: [] } } });
    const { res } = makeRes();
    const next = makeNext();

    await saveCanvas(req, res, next);

    expect(mockService.saveCanvas).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0]![0]).toBeInstanceOf(ValidationError);
  });

  it('calls next(ValidationError) when canvas is missing', async () => {
    const req = makeReq({ params: { flowId: 'flow-aaa' }, body: { version: 1 } });
    const { res } = makeRes();
    const next = makeNext();

    await saveCanvas(req, res, next);

    expect(mockService.saveCanvas).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0]![0]).toBeInstanceOf(ValidationError);
  });

  it('forwards NotFoundError to next() for non-owner', async () => {
    const err = new NotFoundError('Flow not found');
    mockService.saveCanvas.mockRejectedValueOnce(err);
    const req = makeReq({ params: { flowId: 'flow-xxx' }, body: validBody });
    const { res } = makeRes();
    const next = makeNext();

    await saveCanvas(req, res, next);

    expect(next).toHaveBeenCalledWith(err);
  });
});

// ── estimateCost ──────────────────────────────────────────────────────────────

describe('estimateCost handler (POST .../estimate)', () => {
  const ESTIMATE = {
    flowId: 'flow-aaa',
    blockId: 'block-bbb',
    modelId: 'fal-ai/ltx-2-19b/image-to-video',
    estimate: { currency: 'USD', amount: 0.42 },
    bestEffort: true as const,
  };

  it('returns 200 with the estimate on success', async () => {
    mockGenerateService.estimateBlockCost.mockResolvedValueOnce(ESTIMATE);
    const req = makeReq({ params: { flowId: 'flow-aaa', blockId: 'block-bbb' } });
    const { res, json } = makeRes();
    const next = makeNext();

    await estimateCost(req, res, next);

    expect(mockGenerateService.estimateBlockCost).toHaveBeenCalledWith({
      flowId: 'flow-aaa',
      blockId: 'block-bbb',
      userId: USER.userId,
    });
    expect(json).toHaveBeenCalledWith(ESTIMATE);
    expect(next).not.toHaveBeenCalled();
  });

  it('forwards NotFoundError to next() for non-owner/absent flow', async () => {
    const err = new NotFoundError('Flow not found.');
    mockGenerateService.estimateBlockCost.mockRejectedValueOnce(err);
    const req = makeReq({ params: { flowId: 'flow-xxx', blockId: 'block-bbb' } });
    const { res } = makeRes();
    const next = makeNext();

    await estimateCost(req, res, next);

    expect(next).toHaveBeenCalledWith(err);
  });
});

// ── generateBlock ─────────────────────────────────────────────────────────────

describe('generateBlock handler (POST .../generate)', () => {
  const IDEM = '99999999-9999-4999-8999-999999999999';
  const ACCEPTED = { jobId: 'job-123', blockId: 'block-bbb', status: 'queued' as const };
  const validBody = { version: 8, acknowledgedCost: { currency: 'USD', amount: 0.42 } };

  function genReq(over: Partial<Parameters<typeof makeReq>[0]> = {}) {
    return makeReq({
      params: { flowId: 'flow-aaa', blockId: 'block-bbb' },
      body: validBody,
      headers: { 'Idempotency-Key': IDEM },
      ...over,
    });
  }

  it('returns 202 with the accepted job when Idempotency-Key is present', async () => {
    mockGenerateService.generate.mockResolvedValueOnce(ACCEPTED);
    const req = genReq();
    const { res, status, json } = makeRes();
    const next = makeNext();

    await generateBlock(req, res, next);

    expect(mockGenerateService.generate).toHaveBeenCalledWith({
      flowId: 'flow-aaa',
      blockId: 'block-bbb',
      userId: USER.userId,
      version: 8,
      idempotencyKey: IDEM,
    });
    expect(status).toHaveBeenCalledWith(202);
    expect(json).toHaveBeenCalledWith(ACCEPTED);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next(ValidationError) → 400 when the Idempotency-Key header is missing', async () => {
    const req = genReq({ headers: {} });
    const { res } = makeRes();
    const next = makeNext();

    await generateBlock(req, res, next);

    expect(mockGenerateService.generate).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0]![0]).toBeInstanceOf(ValidationError);
  });

  it('calls next(ValidationError) → 400 when version is missing from the body', async () => {
    const req = genReq({ body: { acknowledgedCost: { currency: 'USD', amount: 0.42 } } });
    const { res } = makeRes();
    const next = makeNext();

    await generateBlock(req, res, next);

    expect(mockGenerateService.generate).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0]![0]).toBeInstanceOf(ValidationError);
  });

  it('forwards RequiredInputMissingError (→ 422 flow.required_input_missing)', async () => {
    const err = new RequiredInputMissingError('Connect a text input before generating.', {
      blockId: 'block-bbb',
      input: 'prompt',
    });
    mockGenerateService.generate.mockRejectedValueOnce(err);
    const { res } = makeRes();
    const next = makeNext();

    await generateBlock(genReq(), res, next);

    expect(next).toHaveBeenCalledWith(err);
    expect((next.mock.calls[0]![0] as RequiredInputMissingError).code).toBe('flow.required_input_missing');
  });

  it('forwards ExclusivityViolationError (→ 422 flow.exclusivity_violation)', async () => {
    const err = new ExclusivityViolationError('Provide exactly one of: prompt, multiPrompt.', {
      exclusiveGroup: 'prompt_mode',
      provided: ['prompt', 'multiPrompt'],
    });
    mockGenerateService.generate.mockRejectedValueOnce(err);
    const { res } = makeRes();
    const next = makeNext();

    await generateBlock(genReq(), res, next);

    expect(next).toHaveBeenCalledWith(err);
    expect((next.mock.calls[0]![0] as ExclusivityViolationError).code).toBe('flow.exclusivity_violation');
  });

  it('forwards AssetMissingError (→ 422 flow.asset_missing)', async () => {
    const err = new AssetMissingError('A library asset this block uses is missing.', {
      blockId: 'block-ccc',
    });
    mockGenerateService.generate.mockRejectedValueOnce(err);
    const { res } = makeRes();
    const next = makeNext();

    await generateBlock(genReq(), res, next);

    expect(next).toHaveBeenCalledWith(err);
    expect((next.mock.calls[0]![0] as AssetMissingError).code).toBe('flow.asset_missing');
  });

  it('forwards ContentInvalidError (→ 422 flow.content_invalid)', async () => {
    const err = new ContentInvalidError('The text content block is empty.', {
      blockId: 'block-ccc',
      reason: 'empty',
    });
    mockGenerateService.generate.mockRejectedValueOnce(err);
    const { res } = makeRes();
    const next = makeNext();

    await generateBlock(genReq(), res, next);

    expect(next).toHaveBeenCalledWith(err);
    expect((next.mock.calls[0]![0] as ContentInvalidError).code).toBe('flow.content_invalid');
  });

  it('forwards RateLimitedError (→ 429 + Retry-After) to next()', async () => {
    const err = new RateLimitedError('Too many generations. Try again in a moment.', 42, {
      limitPerMinute: 30,
    });
    mockGenerateService.generate.mockRejectedValueOnce(err);
    const { res } = makeRes();
    const next = makeNext();

    await generateBlock(genReq(), res, next);

    expect(next).toHaveBeenCalledWith(err);
    expect((next.mock.calls[0]![0] as RateLimitedError).retryAfterSeconds).toBe(42);
  });

  it('forwards OptimisticLockError (→ 409) on a stale flow version', async () => {
    const err = new OptimisticLockError('This flow changed since you opened it.');
    mockGenerateService.generate.mockRejectedValueOnce(err);
    const { res } = makeRes();
    const next = makeNext();

    await generateBlock(genReq(), res, next);

    expect(next).toHaveBeenCalledWith(err);
  });
});
