import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

const { mockConfig, mockAuthService } = vi.hoisted(() => ({
  mockConfig: {
    config: {
      auth: { devAuthBypass: false, jwtSecret: 'unused', jwtExpiresIn: '7d' },
    },
  },
  mockAuthService: {
    validateSession: vi.fn(),
  },
}));

vi.mock('@/config.js', () => mockConfig);
vi.mock('@/services/auth.service.js', () => mockAuthService);

import { UnauthorizedError } from '@/lib/errors.js';

const { authMiddleware } = await import('./auth.middleware.js');

function mockReq(headers: Record<string, string> = {}): Request {
  return { headers } as unknown as Request;
}

function mockNext(): NextFunction {
  return vi.fn() as unknown as NextFunction;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockConfig.config.auth.devAuthBypass = false;
});

describe('authMiddleware', () => {
  describe('dev auth bypass (DEV_AUTH_BYPASS=true)', () => {
    it('attaches hardcoded dev user and calls next() when bypass is enabled', async () => {
      mockConfig.config.auth.devAuthBypass = true;
      const req = mockReq() as Request & { user?: unknown };
      const next = mockNext();

      await authMiddleware(req, {} as Response, next);

      expect(next).toHaveBeenCalledWith();
      expect(req.user).toEqual({
        userId: 'dev-user-001',
        email: 'dev@cliptale.local',
        displayName: 'Dev User',
      });
    });

    it('skips session validation even when Authorization header is absent', async () => {
      mockConfig.config.auth.devAuthBypass = true;
      const req = mockReq() as Request & { user?: unknown };
      const next = mockNext();

      await authMiddleware(req, {} as Response, next);

      expect(mockAuthService.validateSession).not.toHaveBeenCalled();
      expect(next).not.toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('missing / malformed Authorization header', () => {
    it('calls next(UnauthorizedError) when Authorization header is absent', async () => {
      const next = mockNext();
      await authMiddleware(mockReq(), {} as Response, next);
      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });

    it('calls next(UnauthorizedError) when header does not start with "Bearer "', async () => {
      const next = mockNext();
      await authMiddleware(
        mockReq({ authorization: 'Basic dXNlcjpwYXNz' }),
        {} as Response,
        next,
      );
      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });
  });

  describe('invalid session token', () => {
    it('calls next(UnauthorizedError) when validateSession throws', async () => {
      mockAuthService.validateSession.mockRejectedValue(
        new UnauthorizedError('Invalid or expired session'),
      );
      const next = mockNext();
      await authMiddleware(
        mockReq({ authorization: 'Bearer bad-token-hex' }),
        {} as Response,
        next,
      );
      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });
  });

  describe('valid session token', () => {
    it('attaches req.user and calls next() for a valid token', async () => {
      mockAuthService.validateSession.mockResolvedValue({
        userId: 'user-abc',
        email: 'hello@world.com',
        displayName: 'Hello World',
      });
      const req = mockReq({
        authorization: 'Bearer valid-session-token-hex',
      }) as Request & { user?: unknown };
      const next = mockNext();

      await authMiddleware(req, {} as Response, next);

      expect(next).toHaveBeenCalledWith();
      expect(req.user).toEqual({
        userId: 'user-abc',
        email: 'hello@world.com',
        displayName: 'Hello World',
      });
      expect(mockAuthService.validateSession).toHaveBeenCalledWith(
        'valid-session-token-hex',
      );
    });
  });
});
