/**
 * Unit tests for the `listAssets` handler and its query-string Zod schema
 * (`listAssetsQuerySchema`) in `assets.controller.ts`.
 *
 * The asset-list service is mocked via `vi.hoisted` so no DB or S3 client
 * is touched. Covers:
 *   - schema accepts valid `type` / `cursor` / `limit` inputs and applies defaults
 *   - schema rejects out-of-range / invalid inputs
 *   - handler throws ValidationError (delegated to next) on bad query
 *   - handler forwards userId, parsed params, and constructed baseUrl to the service
 *   - handler passes downstream service errors to next()
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

import { ValidationError } from '@/lib/errors.js';

const { mockListForUser } = vi.hoisted(() => ({ mockListForUser: vi.fn() }));

vi.mock('@/services/asset.list.service.js', () => ({
  listForUser: mockListForUser,
}));

import { listAssets, listAssetsQuerySchema } from './assets.controller.js';

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    query: {},
    user: { userId: 'user-001', email: 'a@b.com', displayName: 'A' },
    protocol: 'http',
    get: vi.fn().mockReturnValue('localhost:3001'),
    ...overrides,
  } as unknown as Request;
}

function mockRes(): Response {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
  };
  return res as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Schema ───────────────────────────────────────────────────────────────────

describe('listAssetsQuerySchema', () => {
  describe('type', () => {
    it.each(['video', 'image', 'audio', 'all'] as const)('accepts type=%s', (type) => {
      const result = listAssetsQuerySchema.safeParse({ type });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.type).toBe(type);
    });

    it('defaults type to "all" when missing', () => {
      const result = listAssetsQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.type).toBe('all');
    });

    it('rejects an unknown type', () => {
      const result = listAssetsQuerySchema.safeParse({ type: 'unknown' });
      expect(result.success).toBe(false);
    });
  });

  describe('limit', () => {
    it('coerces a numeric string to a number', () => {
      const result = listAssetsQuerySchema.safeParse({ limit: '24' });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.limit).toBe(24);
    });

    it('defaults limit to 24 when missing', () => {
      const result = listAssetsQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.limit).toBe(24);
    });

    it('rejects a limit below 1', () => {
      const result = listAssetsQuerySchema.safeParse({ limit: '0' });
      expect(result.success).toBe(false);
    });

    it('rejects a limit above 100', () => {
      const result = listAssetsQuerySchema.safeParse({ limit: '101' });
      expect(result.success).toBe(false);
    });

    it('rejects a non-integer limit', () => {
      const result = listAssetsQuerySchema.safeParse({ limit: '24.5' });
      expect(result.success).toBe(false);
    });

    it('rejects a non-numeric limit string', () => {
      const result = listAssetsQuerySchema.safeParse({ limit: 'abc' });
      expect(result.success).toBe(false);
    });
  });

  describe('cursor', () => {
    it('accepts an opaque string cursor', () => {
      const result = listAssetsQuerySchema.safeParse({ cursor: 'opaque-token' });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.cursor).toBe('opaque-token');
    });

    it('treats a missing cursor as undefined', () => {
      const result = listAssetsQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.cursor).toBeUndefined();
    });
  });
});

// ── Handler ──────────────────────────────────────────────────────────────────

describe('listAssets handler', () => {
  const serviceResult = {
    items: [],
    nextCursor: null,
    totals: { videos: 0, images: 0, audio: 0, bytesUsed: 0 },
  };

  it('forwards parsed query params, userId, and constructed baseUrl to the service', async () => {
    mockListForUser.mockResolvedValueOnce(serviceResult);
    const req = mockReq({
      query: { type: 'video', limit: '10', cursor: 'abc' },
    });
    const res = mockRes();
    const next: NextFunction = vi.fn();

    await listAssets(req, res, next);

    expect(mockListForUser).toHaveBeenCalledWith({
      userId: 'user-001',
      type: 'video',
      cursor: 'abc',
      limit: 10,
      baseUrl: 'http://localhost:3001',
    });
    expect(res.json).toHaveBeenCalledWith(serviceResult);
    expect(next).not.toHaveBeenCalled();
  });

  it('applies schema defaults (type=all, limit=24) when query is empty', async () => {
    mockListForUser.mockResolvedValueOnce(serviceResult);
    const req = mockReq({ query: {} });
    const res = mockRes();
    const next: NextFunction = vi.fn();

    await listAssets(req, res, next);

    expect(mockListForUser).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'all', limit: 24, cursor: undefined }),
    );
  });

  it('constructs the baseUrl from req.protocol and the Host header', async () => {
    mockListForUser.mockResolvedValueOnce(serviceResult);
    const req = mockReq({
      protocol: 'https',
      get: vi.fn().mockReturnValue('api.example.com'),
    });
    const res = mockRes();
    const next: NextFunction = vi.fn();

    await listAssets(req, res, next);

    expect(mockListForUser).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: 'https://api.example.com' }),
    );
  });

  it('delegates a ValidationError to next() when the type enum is invalid', async () => {
    const req = mockReq({ query: { type: 'bogus' } });
    const res = mockRes();
    const next = vi.fn();

    await listAssets(req, res, next);

    expect(mockListForUser).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0]![0]).toBeInstanceOf(ValidationError);
  });

  it('delegates a ValidationError to next() when the limit is out of range', async () => {
    const req = mockReq({ query: { limit: '999' } });
    const res = mockRes();
    const next = vi.fn();

    await listAssets(req, res, next);

    expect(mockListForUser).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0]![0]).toBeInstanceOf(ValidationError);
  });

  it('passes downstream service errors to next()', async () => {
    const err = new Error('boom');
    mockListForUser.mockRejectedValueOnce(err);
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    await listAssets(req, res, next);

    expect(next).toHaveBeenCalledWith(err);
  });
});
