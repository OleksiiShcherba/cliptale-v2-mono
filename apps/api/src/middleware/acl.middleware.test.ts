import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

import { aclMiddleware } from './acl.middleware.js';
import { UnauthorizedError } from '@/lib/errors.js';

// config.ts is imported indirectly via errors.ts — no mock needed here.

function mockNext(): NextFunction {
  return vi.fn() as unknown as NextFunction;
}

function reqWithUser(user?: { id: string; email: string }): Request {
  return { user } as unknown as Request;
}

describe('aclMiddleware (stub)', () => {
  it('calls next(UnauthorizedError) when req.user is not set', () => {
    const next = mockNext();
    aclMiddleware('editor')(reqWithUser(undefined), {} as Response, next);
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it('calls next() with no arguments when req.user is set (any authenticated user passes stub)', () => {
    const next = mockNext();
    aclMiddleware('editor')(
      reqWithUser({ id: 'user-1', email: 'a@b.com' }),
      {} as Response,
      next,
    );
    expect(next).toHaveBeenCalledWith(); // no error arg
  });

  it('allows all role values through the stub without error (viewer)', () => {
    const next = mockNext();
    aclMiddleware('viewer')(
      reqWithUser({ id: 'user-2', email: 'b@c.com' }),
      {} as Response,
      next,
    );
    expect(next).toHaveBeenCalledWith();
  });

  it('allows all role values through the stub without error (owner)', () => {
    const next = mockNext();
    aclMiddleware('owner')(
      reqWithUser({ id: 'user-3', email: 'c@d.com' }),
      {} as Response,
      next,
    );
    expect(next).toHaveBeenCalledWith();
  });
});
