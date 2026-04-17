/**
 * Tests for enhance.rate-limiter.ts
 *
 * Verifies per-user (not per-IP) rate-limiting behaviour:
 * - 10 successful requests are allowed within the window.
 * - The 11th request from the same user receives 429.
 * - A different user is unaffected even when sharing the same IP.
 *
 * Uses supertest + an in-memory Express app so we exercise the real
 * express-rate-limit middleware without a running server.
 *
 * Note: express-rate-limit uses an in-memory store by default. We create
 * a fresh Express app (and therefore a fresh store instance) per test
 * describe block so tests do not bleed into each other.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import express, { type Request, type Response } from 'express';
import request from 'supertest';

import { enhancePromptLimiter } from './enhance.rate-limiter.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a minimal Express app that:
 * 1. Attaches a fake req.user so the keyGenerator can access req.user!.userId.
 * 2. Applies enhancePromptLimiter.
 * 3. Returns 200 OK.
 */
function buildApp(userId: string) {
  const app = express();
  app.use((req: Request, _res, next) => {
    // Simulate what authMiddleware would attach.
    (req as Request & { user: { userId: string; email: string; displayName: string } }).user = {
      userId,
      email: `${userId}@example.com`,
      displayName: userId,
    };
    next();
  });
  app.post('/test', enhancePromptLimiter, (_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
  });
  return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('enhancePromptLimiter', () => {
  it('should allow 10 requests within the window', async () => {
    const app = buildApp('user-allow-10');
    for (let i = 0; i < 10; i++) {
      const res = await request(app).post('/test');
      expect(res.status).toBe(200);
    }
  });

  it('should return 429 on the 11th request from the same user', async () => {
    const app = buildApp('user-exceed-limit');
    for (let i = 0; i < 10; i++) {
      await request(app).post('/test');
    }
    const res = await request(app).post('/test');
    expect(res.status).toBe(429);
    expect(res.body).toHaveProperty('error');
  });

  it('should not affect a different user when first user has exhausted its limit', async () => {
    // Both users share the same app instance (same store) to verify key isolation.
    const userId1 = 'user-exhausted-key-test';
    const userId2 = 'user-fresh-key-test';

    // Build two apps sharing an isolated store per-user via separate app instances.
    // express-rate-limit's default MemoryStore is per-app, so we need a single app
    // that can handle both users to share the same store and verify key isolation.
    const app = express();
    app.use(express.json());

    let currentUserId = userId1;

    app.use((req: Request, _res, next) => {
      (req as Request & { user: { userId: string; email: string; displayName: string } }).user = {
        userId: currentUserId,
        email: `${currentUserId}@example.com`,
        displayName: currentUserId,
      };
      next();
    });

    app.post('/test', enhancePromptLimiter, (_req: Request, res: Response) => {
      res.status(200).json({ ok: true });
    });

    // Exhaust userId1's limit.
    for (let i = 0; i < 10; i++) {
      currentUserId = userId1;
      await request(app).post('/test');
    }

    // userId1 is now at limit.
    currentUserId = userId1;
    const limitedRes = await request(app).post('/test');
    expect(limitedRes.status).toBe(429);

    // userId2 should still be under limit.
    currentUserId = userId2;
    const freshRes = await request(app).post('/test');
    expect(freshRes.status).toBe(200);
  });

  it('should include standard rate-limit headers in the response', async () => {
    const app = buildApp('user-headers-check');
    const res = await request(app).post('/test');
    expect(res.status).toBe(200);
    // standardHeaders: true adds RateLimit-* headers (draft-7 format).
    expect(res.headers).toHaveProperty('ratelimit-limit');
    expect(res.headers).toHaveProperty('ratelimit-remaining');
  });
});
