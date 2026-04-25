import { describe, it, expect, vi, beforeEach } from 'vitest';

import { fetchCurrentUser, logoutUser, registerUser, loginUser, forgotPassword, resetPassword } from './api';

// Mock the api-client module
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import { apiClient } from '@/lib/api-client';

const mockGet = apiClient.get as ReturnType<typeof vi.fn>;
const mockPost = apiClient.post as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('auth api', () => {
  describe('fetchCurrentUser', () => {
    it('should return user on successful GET /auth/me', async () => {
      const mockUser = { userId: 'u1', email: 'test@example.com', displayName: 'Test' };
      mockGet.mockResolvedValue({ ok: true, json: () => Promise.resolve(mockUser) });

      const result = await fetchCurrentUser();
      expect(mockGet).toHaveBeenCalledWith('/auth/me');
      expect(result).toEqual(mockUser);
    });

    it('should return null on failed GET /auth/me', async () => {
      mockGet.mockResolvedValue({ ok: false });

      const result = await fetchCurrentUser();
      expect(result).toBeNull();
    });
  });

  describe('logoutUser', () => {
    it('should call POST /auth/logout', async () => {
      mockPost.mockResolvedValue({ ok: true });

      await logoutUser();
      expect(mockPost).toHaveBeenCalledWith('/auth/logout', {});
    });
  });

  describe('registerUser', () => {
    it('should call POST /auth/register and return auth result on success', async () => {
      const mockResponse = {
        user: { userId: 'u1', email: 'test@example.com', displayName: 'Test' },
        token: 'abc123',
        expiresAt: '2026-04-15T00:00:00.000Z',
      };
      mockPost.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await registerUser('test@example.com', 'password123', 'Test');

      expect(mockPost).toHaveBeenCalledWith('/auth/register', {
        email: 'test@example.com',
        password: 'password123',
        displayName: 'Test',
      });
      expect(result).toEqual(mockResponse);
    });

    it('should throw on API error with error message from response', async () => {
      mockPost.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'Email is already registered' }),
      });

      await expect(registerUser('dup@example.com', 'password123', 'Dup')).rejects.toThrow(
        'Email is already registered',
      );
    });

    it('should throw fallback message when response body is not parseable', async () => {
      mockPost.mockResolvedValue({
        ok: false,
        json: () => Promise.reject(new Error('parse error')),
      });

      await expect(registerUser('bad@example.com', 'pass', 'Name')).rejects.toThrow(
        'Registration failed',
      );
    });
  });

  describe('loginUser', () => {
    it('should call POST /auth/login and return auth result on success', async () => {
      const mockResponse = {
        user: { userId: 'u1', email: 'test@example.com', displayName: 'Test' },
        token: 'abc123',
        expiresAt: '2026-04-15T00:00:00.000Z',
      };
      mockPost.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await loginUser('test@example.com', 'password123');

      expect(mockPost).toHaveBeenCalledWith('/auth/login', {
        email: 'test@example.com',
        password: 'password123',
      });
      expect(result).toEqual(mockResponse);
    });

    it('should throw on invalid credentials', async () => {
      mockPost.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'Invalid email or password' }),
      });

      await expect(loginUser('bad@example.com', 'wrong')).rejects.toThrow(
        'Invalid email or password',
      );
    });
  });

  describe('forgotPassword', () => {
    it('should call POST /auth/forgot-password and return message on success', async () => {
      const mockResponse = { message: 'If the email is registered, a reset link has been sent.' };
      mockPost.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await forgotPassword('test@example.com');

      expect(mockPost).toHaveBeenCalledWith('/auth/forgot-password', { email: 'test@example.com' });
      expect(result).toEqual(mockResponse);
    });
  });

  describe('resetPassword', () => {
    it('should call POST /auth/reset-password and return message on success', async () => {
      const mockResponse = { message: 'Password has been reset successfully.' };
      mockPost.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await resetPassword('token123', 'newPass123');

      expect(mockPost).toHaveBeenCalledWith('/auth/reset-password', {
        token: 'token123',
        newPassword: 'newPass123',
      });
      expect(result).toEqual(mockResponse);
    });

    it('should throw on expired/invalid token', async () => {
      mockPost.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'Token expired or invalid' }),
      });

      await expect(resetPassword('bad-token', 'newPass123')).rejects.toThrow(
        'Token expired or invalid',
      );
    });
  });
});
