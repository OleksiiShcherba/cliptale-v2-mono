import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';

const { mockUserRepo, mockSessionRepo } = vi.hoisted(() => ({
  mockUserRepo: {
    getUserByEmail: vi.fn(),
    getUserById: vi.fn(),
    createUser: vi.fn(),
  },
  mockSessionRepo: {
    createSession: vi.fn(),
    getSessionByTokenHash: vi.fn(),
    deleteSession: vi.fn(),
  },
}));

vi.mock('@/repositories/user.repository.js', () => mockUserRepo);
vi.mock('@/repositories/session.repository.js', () => mockSessionRepo);
vi.mock('@/repositories/password-reset.repository.js', () => ({}));
vi.mock('@/repositories/email-verification.repository.js', () => ({
  createEmailVerification: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/services/email.service.js', () => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  sendEmailVerificationEmail: vi.fn().mockResolvedValue(undefined),
}));

// Import after mocks are registered
const { register, login, logout, validateSession } = await import('./auth.service.js');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('auth.service', () => {
  // -------------------------------------------------------------------------
  // register
  // -------------------------------------------------------------------------

  describe('register', () => {
    it('should create a user and return a session token', async () => {
      mockUserRepo.getUserByEmail.mockResolvedValue(null);
      mockUserRepo.createUser.mockResolvedValue(undefined);
      mockSessionRepo.createSession.mockResolvedValue(undefined);

      const result = await register('new@test.com', 'password123', 'New User');

      expect(result.user.email).toBe('new@test.com');
      expect(result.user.displayName).toBe('New User');
      expect(result.user.userId).toBeTruthy();
      expect(result.token).toHaveLength(64); // 32 bytes hex
      expect(result.expiresAt).toBeInstanceOf(Date);

      expect(mockUserRepo.createUser).toHaveBeenCalledOnce();
      const createCall = mockUserRepo.createUser.mock.calls[0]![0];
      expect(createCall.email).toBe('new@test.com');
      expect(createCall.passwordHash).toBeTruthy();
      const isValid = await bcrypt.compare('password123', createCall.passwordHash);
      expect(isValid).toBe(true);

      expect(mockSessionRepo.createSession).toHaveBeenCalledOnce();
    });

    it('should throw ConflictError when email already exists', async () => {
      mockUserRepo.getUserByEmail.mockResolvedValue({
        userId: 'existing-id',
        email: 'taken@test.com',
      });

      await expect(
        register('taken@test.com', 'password123', 'User'),
      ).rejects.toThrow('Email is already registered');
    });
  });

  // -------------------------------------------------------------------------
  // login
  // -------------------------------------------------------------------------

  describe('login', () => {
    it('should return a session token for valid credentials', async () => {
      const hash = await bcrypt.hash('correct-password', 4);
      mockUserRepo.getUserByEmail.mockResolvedValue({
        userId: 'user-1',
        email: 'user@test.com',
        displayName: 'Test User',
        passwordHash: hash,
      });
      mockSessionRepo.createSession.mockResolvedValue(undefined);

      const result = await login('user@test.com', 'correct-password');

      expect(result.user.userId).toBe('user-1');
      expect(result.user.email).toBe('user@test.com');
      expect(result.token).toHaveLength(64);
      expect(mockSessionRepo.createSession).toHaveBeenCalledOnce();
    });

    it('should throw UnauthorizedError for non-existent email', async () => {
      mockUserRepo.getUserByEmail.mockResolvedValue(null);

      await expect(
        login('nobody@test.com', 'password'),
      ).rejects.toThrow('Invalid email or password');
    });

    it('should throw UnauthorizedError for wrong password', async () => {
      const hash = await bcrypt.hash('correct', 4);
      mockUserRepo.getUserByEmail.mockResolvedValue({
        userId: 'user-1',
        email: 'user@test.com',
        passwordHash: hash,
      });

      await expect(
        login('user@test.com', 'wrong'),
      ).rejects.toThrow('Invalid email or password');
    });

    it('should throw UnauthorizedError for OAuth-only user (no password)', async () => {
      mockUserRepo.getUserByEmail.mockResolvedValue({
        userId: 'oauth-user',
        email: 'oauth@test.com',
        passwordHash: null,
      });

      await expect(
        login('oauth@test.com', 'anything'),
      ).rejects.toThrow('Invalid email or password');
    });
  });

  // -------------------------------------------------------------------------
  // logout
  // -------------------------------------------------------------------------

  describe('logout', () => {
    it('should delete the session matching the token', async () => {
      mockSessionRepo.getSessionByTokenHash.mockResolvedValue({
        sessionId: 'sess-1',
        userId: 'user-1',
      });
      mockSessionRepo.deleteSession.mockResolvedValue(undefined);

      await logout('a'.repeat(64));

      expect(mockSessionRepo.deleteSession).toHaveBeenCalledWith('sess-1');
    });

    it('should be a no-op when session does not exist', async () => {
      mockSessionRepo.getSessionByTokenHash.mockResolvedValue(null);

      await logout('nonexistent-token');

      expect(mockSessionRepo.deleteSession).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // validateSession
  // -------------------------------------------------------------------------

  describe('validateSession', () => {
    it('should return user data for a valid non-expired session', async () => {
      mockSessionRepo.getSessionByTokenHash.mockResolvedValue({
        sessionId: 'sess-1',
        userId: 'user-1',
        expiresAt: new Date(Date.now() + 60000),
      });
      mockUserRepo.getUserById.mockResolvedValue({
        userId: 'user-1',
        email: 'user@test.com',
        displayName: 'Test User',
      });

      const result = await validateSession('some-raw-token');

      expect(result.userId).toBe('user-1');
      expect(result.email).toBe('user@test.com');
      expect(result.displayName).toBe('Test User');
    });

    it('should throw UnauthorizedError for expired session', async () => {
      mockSessionRepo.getSessionByTokenHash.mockResolvedValue({
        sessionId: 'sess-1',
        userId: 'user-1',
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(
        validateSession('expired-token'),
      ).rejects.toThrow('Invalid or expired session');
    });

    it('should throw UnauthorizedError for unknown token', async () => {
      mockSessionRepo.getSessionByTokenHash.mockResolvedValue(null);

      await expect(
        validateSession('bad-token'),
      ).rejects.toThrow('Invalid or expired session');
    });

    it('should throw UnauthorizedError when user no longer exists', async () => {
      mockSessionRepo.getSessionByTokenHash.mockResolvedValue({
        sessionId: 'sess-1',
        userId: 'deleted-user',
        expiresAt: new Date(Date.now() + 60000),
      });
      mockUserRepo.getUserById.mockResolvedValue(null);

      await expect(
        validateSession('orphan-session-token'),
      ).rejects.toThrow('User not found');
    });
  });
});
