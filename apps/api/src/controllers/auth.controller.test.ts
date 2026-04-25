import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

const { mockAuthService } = vi.hoisted(() => ({
  mockAuthService: {
    register: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
    verifyEmail: vi.fn(),
  },
}));

vi.mock('@/services/auth.service.js', () => mockAuthService);

const { register, login, logout, getMe, forgotPassword, resetPassword, verifyEmail } =
  await import('./auth.controller.js');

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    body: {},
    headers: {},
    user: undefined,
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

const next: NextFunction = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

describe('auth.controller', () => {
  describe('register', () => {
    it('should call authService.register and return 201', async () => {
      const result = {
        user: { userId: 'u1', email: 'a@b.com', displayName: 'A' },
        token: 'tok',
        expiresAt: new Date(),
      };
      mockAuthService.register.mockResolvedValue(result);
      const req = mockReq({
        body: { email: 'a@b.com', password: 'password1', displayName: 'A' },
      });
      const res = mockRes();

      await register(req, res, next);

      expect(mockAuthService.register).toHaveBeenCalledWith('a@b.com', 'password1', 'A');
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    it('should pass errors to next()', async () => {
      const err = new Error('conflict');
      mockAuthService.register.mockRejectedValue(err);
      const req = mockReq({
        body: { email: 'a@b.com', password: 'p', displayName: 'A' },
      });
      const res = mockRes();

      await register(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('login', () => {
    it('should call authService.login and return 200', async () => {
      const result = {
        user: { userId: 'u1', email: 'a@b.com', displayName: 'A' },
        token: 'tok',
        expiresAt: new Date(),
      };
      mockAuthService.login.mockResolvedValue(result);
      const req = mockReq({ body: { email: 'a@b.com', password: 'p' } });
      const res = mockRes();

      await login(req, res, next);

      expect(mockAuthService.login).toHaveBeenCalledWith('a@b.com', 'p');
      expect(res.json).toHaveBeenCalledWith(result);
    });

    it('should pass errors to next()', async () => {
      const err = new Error('unauthorized');
      mockAuthService.login.mockRejectedValue(err);
      const req = mockReq({ body: { email: 'a@b.com', password: 'p' } });
      const res = mockRes();

      await login(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('logout', () => {
    it('should extract Bearer token and call authService.logout', async () => {
      mockAuthService.logout.mockResolvedValue(undefined);
      const req = mockReq({
        headers: { authorization: 'Bearer my-token-123' } as Record<string, string>,
      });
      const res = mockRes();

      await logout(req, res, next);

      expect(mockAuthService.logout).toHaveBeenCalledWith('my-token-123');
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.end).toHaveBeenCalled();
    });

    it('should pass empty string when no auth header', async () => {
      mockAuthService.logout.mockResolvedValue(undefined);
      const req = mockReq({ headers: {} });
      const res = mockRes();

      await logout(req, res, next);

      expect(mockAuthService.logout).toHaveBeenCalledWith('');
      expect(res.status).toHaveBeenCalledWith(204);
    });

    it('should pass errors to next()', async () => {
      const err = new Error('service failure');
      mockAuthService.logout.mockRejectedValue(err);
      const req = mockReq({
        headers: { authorization: 'Bearer bad-token' } as Record<string, string>,
      });
      const res = mockRes();

      await logout(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('getMe', () => {
    it('should return req.user data', async () => {
      const req = mockReq({
        user: { userId: 'u1', email: 'a@b.com', displayName: 'A' },
      });
      const res = mockRes();

      await getMe(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        userId: 'u1',
        email: 'a@b.com',
        displayName: 'A',
      });
    });
  });

  describe('forgotPassword', () => {
    it('should call authService.forgotPassword and return success message', async () => {
      mockAuthService.forgotPassword.mockResolvedValue(undefined);
      const req = mockReq({ body: { email: 'user@test.com' } });
      const res = mockRes();

      await forgotPassword(req, res, next);

      expect(mockAuthService.forgotPassword).toHaveBeenCalledWith('user@test.com');
      expect(res.json).toHaveBeenCalledWith({
        message: 'If the email is registered, a reset link has been sent.',
      });
    });

    it('should pass errors to next()', async () => {
      const err = new Error('service error');
      mockAuthService.forgotPassword.mockRejectedValue(err);
      const req = mockReq({ body: { email: 'a@b.com' } });
      const res = mockRes();

      await forgotPassword(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('resetPassword', () => {
    it('should call authService.resetPassword and return success message', async () => {
      mockAuthService.resetPassword.mockResolvedValue(undefined);
      const req = mockReq({ body: { token: 'reset-tok', newPassword: 'newpass123' } });
      const res = mockRes();

      await resetPassword(req, res, next);

      expect(mockAuthService.resetPassword).toHaveBeenCalledWith('reset-tok', 'newpass123');
      expect(res.json).toHaveBeenCalledWith({
        message: 'Password has been reset successfully.',
      });
    });

    it('should pass errors to next()', async () => {
      const err = new Error('invalid token');
      mockAuthService.resetPassword.mockRejectedValue(err);
      const req = mockReq({ body: { token: 't', newPassword: 'p' } });
      const res = mockRes();

      await resetPassword(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('verifyEmail', () => {
    it('should call authService.verifyEmail and return success message', async () => {
      mockAuthService.verifyEmail.mockResolvedValue(undefined);
      const req = mockReq({ body: { token: 'verify-tok' } });
      const res = mockRes();

      await verifyEmail(req, res, next);

      expect(mockAuthService.verifyEmail).toHaveBeenCalledWith('verify-tok');
      expect(res.json).toHaveBeenCalledWith({
        message: 'Email verified successfully.',
      });
    });

    it('should pass errors to next()', async () => {
      const err = new Error('bad token');
      mockAuthService.verifyEmail.mockRejectedValue(err);
      const req = mockReq({ body: { token: 't' } });
      const res = mockRes();

      await verifyEmail(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });
});
