import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

const { mockConfig } = vi.hoisted(() => ({
  mockConfig: {
    config: {
      auth: { devAuthBypass: false },
    },
  },
}));

vi.mock('@/config.js', () => mockConfig);

import { UnauthorizedError } from '@/lib/errors.js';

import { aclMiddleware } from './acl.middleware.js';

function mockNext(): NextFunction {
  return vi.fn() as unknown as NextFunction;
}

function reqWithUser(user?: { userId: string; email: string; displayName: string }): Request {
  return { user } as unknown as Request;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockConfig.config.auth.devAuthBypass = false;
});

describe('aclMiddleware (stub)', () => {
  describe('dev auth bypass (DEV_AUTH_BYPASS=true)', () => {
    it('calls next() with no arguments even when req.user is absent', () => {
      mockConfig.config.auth.devAuthBypass = true;
      const next = mockNext();
      aclMiddleware('editor')(reqWithUser(undefined), {} as Response, next);
      expect(next).toHaveBeenCalledWith();
    });

    it('calls next() with no arguments for any role when req.user is present', () => {
      mockConfig.config.auth.devAuthBypass = true;
      const next = mockNext();
      aclMiddleware('owner')(
        reqWithUser({ userId: 'user-1', email: 'a@b.com', displayName: 'A' }),
        {} as Response,
        next,
      );
      expect(next).toHaveBeenCalledWith();
    });
  });

  it('calls next(UnauthorizedError) when req.user is not set', () => {
    const next = mockNext();
    aclMiddleware('editor')(reqWithUser(undefined), {} as Response, next);
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it('calls next() with no arguments when req.user is set (any authenticated user passes stub)', () => {
    const next = mockNext();
    aclMiddleware('editor')(
      reqWithUser({ userId: 'user-1', email: 'a@b.com', displayName: 'A' }),
      {} as Response,
      next,
    );
    expect(next).toHaveBeenCalledWith();
  });

  it('allows all role values through the stub without error (viewer)', () => {
    const next = mockNext();
    aclMiddleware('viewer')(
      reqWithUser({ userId: 'user-2', email: 'b@c.com', displayName: 'B' }),
      {} as Response,
      next,
    );
    expect(next).toHaveBeenCalledWith();
  });

  it('allows all role values through the stub without error (owner)', () => {
    const next = mockNext();
    aclMiddleware('owner')(
      reqWithUser({ userId: 'user-3', email: 'c@d.com', displayName: 'C' }),
      {} as Response,
      next,
    );
    expect(next).toHaveBeenCalledWith();
  });
});
