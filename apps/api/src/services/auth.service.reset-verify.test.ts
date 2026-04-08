import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';

const { mockUserRepo, mockPasswordResetRepo, mockEmailVerificationRepo, mockEmailService } =
  vi.hoisted(() => ({
    mockUserRepo: {
      getUserByEmail: vi.fn(),
      updatePasswordHash: vi.fn(),
      markEmailVerified: vi.fn(),
    },
    mockPasswordResetRepo: {
      createPasswordReset: vi.fn(),
      getByTokenHash: vi.fn(),
      markAsUsed: vi.fn(),
    },
    mockEmailVerificationRepo: {
      createEmailVerification: vi.fn(),
      getByTokenHash: vi.fn(),
      markAsUsed: vi.fn(),
    },
    mockEmailService: {
      sendPasswordResetEmail: vi.fn(),
      sendEmailVerificationEmail: vi.fn(),
    },
  }));

vi.mock('@/repositories/user.repository.js', () => mockUserRepo);
vi.mock('@/repositories/session.repository.js', () => ({
  createSession: vi.fn(),
  getSessionByTokenHash: vi.fn(),
  deleteSession: vi.fn(),
}));
vi.mock('@/repositories/password-reset.repository.js', () => mockPasswordResetRepo);
vi.mock('@/repositories/email-verification.repository.js', () => mockEmailVerificationRepo);
vi.mock('@/services/email.service.js', () => mockEmailService);

const { forgotPassword, resetPassword, verifyEmail, sendVerificationEmail } = await import(
  './auth.service.js'
);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('auth.service', () => {
  // ---------------------------------------------------------------------------
  // forgotPassword
  // ---------------------------------------------------------------------------

  describe('forgotPassword', () => {
    it('should create a reset token and send an email when user exists', async () => {
      mockUserRepo.getUserByEmail.mockResolvedValue({
        userId: 'user-1',
        email: 'user@test.com',
      });
      mockPasswordResetRepo.createPasswordReset.mockResolvedValue(undefined);
      mockEmailService.sendPasswordResetEmail.mockResolvedValue(undefined);

      await forgotPassword('user@test.com');

      expect(mockPasswordResetRepo.createPasswordReset).toHaveBeenCalledOnce();
      const call = mockPasswordResetRepo.createPasswordReset.mock.calls[0]![0];
      expect(call.userId).toBe('user-1');
      expect(call.tokenHash).toHaveLength(64); // SHA-256 hex
      expect(call.expiresAt).toBeInstanceOf(Date);
      expect(call.expiresAt.getTime()).toBeGreaterThan(Date.now());

      expect(mockEmailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        'user@test.com',
        expect.any(String),
      );
    });

    it('should silently return when user does not exist (no email enumeration)', async () => {
      mockUserRepo.getUserByEmail.mockResolvedValue(null);

      await forgotPassword('nobody@test.com');

      expect(mockPasswordResetRepo.createPasswordReset).not.toHaveBeenCalled();
      expect(mockEmailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // resetPassword
  // ---------------------------------------------------------------------------

  describe('resetPassword', () => {
    it('should hash new password and update user when token is valid', async () => {
      mockPasswordResetRepo.getByTokenHash.mockResolvedValue({
        resetId: 'reset-1',
        userId: 'user-1',
        expiresAt: new Date(Date.now() + 60000),
        usedAt: null,
      });
      mockUserRepo.updatePasswordHash.mockResolvedValue(undefined);
      mockPasswordResetRepo.markAsUsed.mockResolvedValue(undefined);

      await resetPassword('raw-token-hex', 'new-secure-password');

      expect(mockUserRepo.updatePasswordHash).toHaveBeenCalledOnce();
      const [userId, hash] = mockUserRepo.updatePasswordHash.mock.calls[0]!;
      expect(userId).toBe('user-1');
      const isValid = await bcrypt.compare('new-secure-password', hash);
      expect(isValid).toBe(true);

      expect(mockPasswordResetRepo.markAsUsed).toHaveBeenCalledWith('reset-1');
    });

    it('should throw ValidationError when token not found', async () => {
      mockPasswordResetRepo.getByTokenHash.mockResolvedValue(null);

      await expect(resetPassword('bad-token', 'pw')).rejects.toThrow(
        'Invalid or expired reset token',
      );
    });

    it('should throw ValidationError when token is expired', async () => {
      mockPasswordResetRepo.getByTokenHash.mockResolvedValue({
        resetId: 'reset-1',
        userId: 'user-1',
        expiresAt: new Date(Date.now() - 1000),
        usedAt: null,
      });

      await expect(resetPassword('expired-token', 'pw')).rejects.toThrow(
        'Invalid or expired reset token',
      );
    });

    it('should throw ValidationError when token is already used', async () => {
      mockPasswordResetRepo.getByTokenHash.mockResolvedValue({
        resetId: 'reset-1',
        userId: 'user-1',
        expiresAt: new Date(Date.now() + 60000),
        usedAt: new Date(),
      });

      await expect(resetPassword('used-token', 'pw')).rejects.toThrow(
        'Invalid or expired reset token',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // verifyEmail
  // ---------------------------------------------------------------------------

  describe('verifyEmail', () => {
    it('should mark email verified and token used when valid', async () => {
      mockEmailVerificationRepo.getByTokenHash.mockResolvedValue({
        verificationId: 'ver-1',
        userId: 'user-1',
        expiresAt: new Date(Date.now() + 60000),
        usedAt: null,
      });
      mockUserRepo.markEmailVerified.mockResolvedValue(undefined);
      mockEmailVerificationRepo.markAsUsed.mockResolvedValue(undefined);

      await verifyEmail('raw-verify-token');

      expect(mockUserRepo.markEmailVerified).toHaveBeenCalledWith('user-1');
      expect(mockEmailVerificationRepo.markAsUsed).toHaveBeenCalledWith('ver-1');
    });

    it('should throw ValidationError when token not found', async () => {
      mockEmailVerificationRepo.getByTokenHash.mockResolvedValue(null);

      await expect(verifyEmail('bad-token')).rejects.toThrow(
        'Invalid or expired verification token',
      );
    });

    it('should throw ValidationError when token is expired', async () => {
      mockEmailVerificationRepo.getByTokenHash.mockResolvedValue({
        verificationId: 'ver-1',
        userId: 'user-1',
        expiresAt: new Date(Date.now() - 1000),
        usedAt: null,
      });

      await expect(verifyEmail('expired-token')).rejects.toThrow(
        'Invalid or expired verification token',
      );
    });

    it('should throw ValidationError when token is already used', async () => {
      mockEmailVerificationRepo.getByTokenHash.mockResolvedValue({
        verificationId: 'ver-1',
        userId: 'user-1',
        expiresAt: new Date(Date.now() + 60000),
        usedAt: new Date(),
      });

      await expect(verifyEmail('used-token')).rejects.toThrow(
        'Invalid or expired verification token',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // sendVerificationEmail
  // ---------------------------------------------------------------------------

  describe('sendVerificationEmail', () => {
    it('should create a verification record and send an email', async () => {
      mockEmailVerificationRepo.createEmailVerification.mockResolvedValue(undefined);
      mockEmailService.sendEmailVerificationEmail.mockResolvedValue(undefined);

      await sendVerificationEmail('user-1', 'user@test.com');

      expect(mockEmailVerificationRepo.createEmailVerification).toHaveBeenCalledOnce();
      const call = mockEmailVerificationRepo.createEmailVerification.mock.calls[0]![0];
      expect(call.userId).toBe('user-1');
      expect(call.tokenHash).toHaveLength(64);
      expect(call.expiresAt).toBeInstanceOf(Date);

      expect(mockEmailService.sendEmailVerificationEmail).toHaveBeenCalledWith(
        'user@test.com',
        expect.any(String),
      );
    });
  });
});
