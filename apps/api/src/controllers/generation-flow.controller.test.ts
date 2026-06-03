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

import { NotFoundError, OptimisticLockError, ValidationError } from '@/lib/errors.js';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const mockService = vi.hoisted(() => ({
  listFlows: vi.fn(),
  createFlow: vi.fn(),
  openFlow: vi.fn(),
  renameFlow: vi.fn(),
  deleteFlow: vi.fn(),
  saveCanvas: vi.fn(),
}));

vi.mock('@/services/generation-flow.service.js', () => mockService);

// Import handlers AFTER mocking
import {
  listFlows,
  createFlow,
  getFlow,
  renameFlow,
  deleteFlow,
  saveCanvas,
} from './generation-flow.controller.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const USER = { userId: 'user-001', email: 'a@b.com', displayName: 'Alice' };

function makeReq(
  opts: { params?: Record<string, string>; body?: unknown; query?: Record<string, string> } = {},
): Request {
  return {
    params: opts.params ?? {},
    body: opts.body ?? {},
    query: opts.query ?? {},
    user: USER,
    protocol: 'http',
    get: vi.fn().mockReturnValue('localhost:3001'),
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

    expect(mockService.deleteFlow).toHaveBeenCalledWith('flow-aaa', USER.userId);
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
