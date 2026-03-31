import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// NOTE: vi.mock is hoisted — the factory must NOT reference module-level variables.
vi.mock('@/config.js', () => ({
  config: { auth: { jwtSecret: 'unit-test-jwt-secret-must-be-32-chars!!' } },
}));

const TEST_SECRET = 'unit-test-jwt-secret-must-be-32-chars!!';

import { authMiddleware } from './auth.middleware.js';
import { UnauthorizedError } from '@/lib/errors.js';

function mockReq(headers: Record<string, string> = {}): Request {
  return { headers } as unknown as Request;
}

function mockNext(): NextFunction {
  return vi.fn() as unknown as NextFunction;
}

describe('authMiddleware', () => {
  describe('missing / malformed Authorization header', () => {
    it('calls next(UnauthorizedError) when Authorization header is absent', () => {
      const next = mockNext();
      authMiddleware(mockReq(), {} as Response, next);
      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });

    it('calls next(UnauthorizedError) when header does not start with "Bearer "', () => {
      const next = mockNext();
      authMiddleware(
        mockReq({ authorization: 'Basic dXNlcjpwYXNz' }),
        {} as Response,
        next,
      );
      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });
  });

  describe('invalid token', () => {
    it('calls next(UnauthorizedError) for a garbage token string', () => {
      const next = mockNext();
      authMiddleware(
        mockReq({ authorization: 'Bearer not.a.valid.jwt' }),
        {} as Response,
        next,
      );
      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });

    it('calls next(UnauthorizedError) for an expired token', () => {
      const token = jwt.sign(
        { sub: 'user-1', email: 'a@b.com' },
        TEST_SECRET,
        { expiresIn: -10 },
      );
      const next = mockNext();
      authMiddleware(
        mockReq({ authorization: `Bearer ${token}` }),
        {} as Response,
        next,
      );
      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });

    it('calls next(UnauthorizedError) for a token signed with a different secret', () => {
      const token = jwt.sign(
        { sub: 'user-1', email: 'a@b.com' },
        'wrong-secret-also-32-chars-long!!',
      );
      const next = mockNext();
      authMiddleware(
        mockReq({ authorization: `Bearer ${token}` }),
        {} as Response,
        next,
      );
      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });
  });

  describe('valid token', () => {
    it('attaches req.user and calls next() with no arguments for a valid token', () => {
      const token = jwt.sign(
        { sub: 'user-abc', email: 'hello@world.com' },
        TEST_SECRET,
      );
      const req = mockReq({
        authorization: `Bearer ${token}`,
      }) as Request & { user?: { id: string; email: string } };
      const next = mockNext();

      authMiddleware(req, {} as Response, next);

      expect(next).toHaveBeenCalledWith(); // no args = no error passed
      expect(req.user).toEqual({ id: 'user-abc', email: 'hello@world.com' });
    });
  });
});
