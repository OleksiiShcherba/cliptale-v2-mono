import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/config.js', () => ({
  config: {
    oauth: {
      google: { clientId: 'google-id', clientSecret: 'google-secret' },
      github: { clientId: 'github-id', clientSecret: 'github-secret' },
      redirectBase: 'http://localhost:3001',
      frontendUrl: 'http://localhost:5173',
    },
  },
}));

vi.mock('@/repositories/user.repository.js', () => ({
  getUserByGoogleId: vi.fn(),
  getUserByGithubId: vi.fn(),
  getUserByEmail: vi.fn(),
  createUser: vi.fn(),
  linkGoogleId: vi.fn(),
  linkGithubId: vi.fn(),
  markEmailVerified: vi.fn(),
}));

vi.mock('@/repositories/session.repository.js', () => ({
  createSession: vi.fn(),
}));

import * as userRepo from '@/repositories/user.repository.js';
import * as sessionRepo from '@/repositories/session.repository.js';
import {
  getGoogleAuthUrl,
  getGithubAuthUrl,
  handleGoogleCallback,
  handleGithubCallback,
} from './oauth.service.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('oauth.service', () => {
  describe('getGoogleAuthUrl', () => {
    it('should return a Google OAuth URL with correct params', () => {
      const url = getGoogleAuthUrl();
      expect(url).toContain('accounts.google.com/o/oauth2/v2/auth');
      expect(url).toContain('client_id=google-id');
      expect(url).toContain('redirect_uri=');
      expect(url).toContain('scope=openid+email+profile');
    });
  });

  describe('getGithubAuthUrl', () => {
    it('should return a GitHub OAuth URL with correct params', () => {
      const url = getGithubAuthUrl();
      expect(url).toContain('github.com/login/oauth/authorize');
      expect(url).toContain('client_id=github-id');
      expect(url).toContain('scope=user%3Aemail');
    });
  });

  describe('handleGoogleCallback', () => {
    it('should exchange code, fetch user info, and create a new user', async () => {
      // Mock token exchange
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ access_token: 'goog-token', token_type: 'Bearer' }),
        })
        // Mock user info
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            sub: 'google-123',
            email: 'user@gmail.com',
            name: 'Google User',
            email_verified: true,
          }),
        });

      (userRepo.getUserByGoogleId as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (userRepo.getUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (userRepo.createUser as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (userRepo.markEmailVerified as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (sessionRepo.createSession as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const result = await handleGoogleCallback('auth-code');

      expect(result.user.email).toBe('user@gmail.com');
      expect(result.user.displayName).toBe('Google User');
      expect(result.token).toBeDefined();
      expect(userRepo.createUser).toHaveBeenCalled();
      expect(userRepo.markEmailVerified).toHaveBeenCalled();
    });

    it('should link Google ID to existing user with same email', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ access_token: 'goog-token', token_type: 'Bearer' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            sub: 'google-456',
            email: 'existing@gmail.com',
            name: 'Existing User',
            email_verified: true,
          }),
        });

      const existingUser = {
        userId: 'u-existing',
        email: 'existing@gmail.com',
        displayName: 'Existing',
        passwordHash: 'hash',
        googleId: null,
        githubId: null,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (userRepo.getUserByGoogleId as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (userRepo.getUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(existingUser);
      (userRepo.linkGoogleId as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (sessionRepo.createSession as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const result = await handleGoogleCallback('auth-code');

      expect(result.user.userId).toBe('u-existing');
      expect(userRepo.linkGoogleId).toHaveBeenCalledWith('u-existing', 'google-456');
      expect(userRepo.createUser).not.toHaveBeenCalled();
    });

    it('should throw ValidationError when code exchange fails', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 400 });

      await expect(handleGoogleCallback('bad-code')).rejects.toThrow(
        'Google OAuth code exchange failed',
      );
    });
  });

  describe('handleGithubCallback', () => {
    it('should exchange code, fetch user info, and create a new user', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ access_token: 'gh-token', token_type: 'Bearer' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            id: 789,
            login: 'ghuser',
            name: 'GitHub User',
            email: 'ghuser@example.com',
          }),
        });

      (userRepo.getUserByGithubId as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (userRepo.getUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (userRepo.createUser as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (userRepo.markEmailVerified as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (sessionRepo.createSession as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const result = await handleGithubCallback('gh-code');

      expect(result.user.email).toBe('ghuser@example.com');
      expect(result.user.displayName).toBe('GitHub User');
      expect(result.token).toBeDefined();
      expect(userRepo.createUser).toHaveBeenCalled();
    });

    it('should fetch email from /user/emails when not in profile', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ access_token: 'gh-token', token_type: 'Bearer' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 100, login: 'noemail', name: 'No Email', email: null }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([
            { email: 'secondary@example.com', primary: false, verified: true },
            { email: 'primary@example.com', primary: true, verified: true },
          ]),
        });

      (userRepo.getUserByGithubId as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (userRepo.getUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (userRepo.createUser as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (userRepo.markEmailVerified as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (sessionRepo.createSession as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const result = await handleGithubCallback('gh-code');
      expect(result.user.email).toBe('primary@example.com');
    });

    it('should throw when no email available', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ access_token: 'gh-token', token_type: 'Bearer' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 101, login: 'noemail', name: null, email: null }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([]),
        });

      await expect(handleGithubCallback('gh-code')).rejects.toThrow(
        'Could not retrieve email from GitHub',
      );
    });

    it('should throw ValidationError when code exchange fails', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 400 });

      await expect(handleGithubCallback('bad-code')).rejects.toThrow(
        'GitHub OAuth code exchange failed',
      );
    });
  });
});
