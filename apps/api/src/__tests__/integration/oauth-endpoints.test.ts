/**
 * Integration tests for the OAuth endpoints.
 *
 * Verifies the full Express → middleware → service chain.
 * OAuth service is mocked to avoid real API calls to Google/GitHub.
 * Does not require external API registration.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';

// Mock the OAuth service before importing the app
vi.mock('@/services/oauth.service.js', () => ({
  getGoogleAuthUrl: vi.fn(),
  getGithubAuthUrl: vi.fn(),
  handleGoogleCallback: vi.fn(),
  handleGithubCallback: vi.fn(),
}));

// Set env vars before app is imported
Object.assign(process.env, {
  APP_DB_HOST: process.env['APP_DB_HOST'] ?? 'localhost',
  APP_DB_PORT: process.env['APP_DB_PORT'] ?? '3306',
  APP_DB_NAME: process.env['APP_DB_NAME'] ?? 'cliptale',
  APP_DB_USER: process.env['APP_DB_USER'] ?? 'cliptale',
  APP_DB_PASSWORD: process.env['APP_DB_PASSWORD'] ?? 'cliptale',
  APP_REDIS_URL: process.env['APP_REDIS_URL'] ?? 'redis://localhost:6379',
  APP_JWT_SECRET: 'test-jwt-secret-exactly-32-chars!',
  APP_DEV_AUTH_BYPASS: 'true',
  APP_OAUTH_REDIRECT_BASE: 'http://localhost:3001',
  APP_OAUTH_FRONTEND_URL: 'http://localhost:5173',
});

describe('OAuth Endpoints', () => {
  let app: Express;
  let oauthService: any;

  beforeAll(async () => {
    // Dynamic import ensures env vars above are set before config.ts is evaluated
    const mod = await import('../../index.js');
    app = mod.default;

    // Import mocked oauth service after app setup
    oauthService = await import('@/services/oauth.service.js');
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /auth/google', () => {
    it('should redirect to Google OAuth URL', async () => {
      const googleUrl = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=test';
      oauthService.getGoogleAuthUrl.mockReturnValue(googleUrl);

      const res = await request(app).get('/auth/google');

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(googleUrl);
      expect(oauthService.getGoogleAuthUrl).toHaveBeenCalled();
    });
  });

  describe('GET /auth/google/callback', () => {
    it('should exchange code and redirect to frontend with token', async () => {
      const authResult = {
        user: { userId: 'u-123', email: 'user@gmail.com', displayName: 'Test User' },
        token: 'token-abc123',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };

      oauthService.handleGoogleCallback.mockResolvedValue(authResult);

      const res = await request(app).get('/auth/google/callback?code=auth-code-123');

      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/editor?token=token-abc123');
      expect(oauthService.handleGoogleCallback).toHaveBeenCalledWith('auth-code-123');
    });

    it('should redirect to login with error when code is missing', async () => {
      const res = await request(app).get('/auth/google/callback');

      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/login?error=missing_code');
      expect(oauthService.handleGoogleCallback).not.toHaveBeenCalled();
    });

    it('should handle OAuth service errors by passing to error handler', async () => {
      oauthService.handleGoogleCallback.mockRejectedValue(
        new Error('Google OAuth code exchange failed'),
      );

      const res = await request(app).get('/auth/google/callback?code=bad-code');

      // Error should be caught and passed to next() — expect 500 or error response
      expect(res.status).toBe(500);
    });
  });

  describe('GET /auth/github', () => {
    it('should redirect to GitHub OAuth URL', async () => {
      const githubUrl = 'https://github.com/login/oauth/authorize?client_id=test';
      oauthService.getGithubAuthUrl.mockReturnValue(githubUrl);

      const res = await request(app).get('/auth/github');

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(githubUrl);
      expect(oauthService.getGithubAuthUrl).toHaveBeenCalled();
    });
  });

  describe('GET /auth/github/callback', () => {
    it('should exchange code and redirect to frontend with token', async () => {
      const authResult = {
        user: { userId: 'u-456', email: 'user@github.com', displayName: 'GitHub User' },
        token: 'token-def456',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };

      oauthService.handleGithubCallback.mockResolvedValue(authResult);

      const res = await request(app).get('/auth/github/callback?code=gh-code-123');

      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/editor?token=token-def456');
      expect(oauthService.handleGithubCallback).toHaveBeenCalledWith('gh-code-123');
    });

    it('should redirect to login with error when code is missing', async () => {
      const res = await request(app).get('/auth/github/callback');

      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/login?error=missing_code');
      expect(oauthService.handleGithubCallback).not.toHaveBeenCalled();
    });

    it('should handle OAuth service errors by passing to error handler', async () => {
      oauthService.handleGithubCallback.mockRejectedValue(
        new Error('GitHub OAuth code exchange failed'),
      );

      const res = await request(app).get('/auth/github/callback?code=bad-code');

      // Error should be caught and passed to next() — expect 500 or error response
      expect(res.status).toBe(500);
    });
  });
});
