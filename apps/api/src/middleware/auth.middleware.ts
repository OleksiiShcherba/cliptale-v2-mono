import type { Request, Response, NextFunction } from 'express';

import { config } from '@/config.js';
import * as authService from '@/services/auth.service.js';
import { UnauthorizedError } from '@/lib/errors.js';

/** Hardcoded dev user attached when DEV_AUTH_BYPASS is enabled. */
const DEV_USER = {
  userId: 'dev-user-001',
  email: 'dev@cliptale.local',
  displayName: 'Dev User',
} as const;

/**
 * Validates the Bearer session token in the Authorization header and attaches `req.user`.
 * When `DEV_AUTH_BYPASS` is enabled, skips validation and attaches a hardcoded dev user.
 *
 * Also accepts a `?token=` query parameter as a fallback — this is required for browser
 * media elements (`<img>`, `<video>`, Remotion `prefetch()`) that cannot attach headers.
 */
export async function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  if (config.auth.devAuthBypass) {
    req.user = DEV_USER;
    return next();
  }

  const authHeader = req.headers.authorization;
  const rawToken = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : typeof req.query['token'] === 'string'
      ? req.query['token']
      : null;

  if (!rawToken) {
    return next(new UnauthorizedError('Missing or malformed Authorization header'));
  }

  try {
    const user = await authService.validateSession(rawToken);
    req.user = user;
    next();
  } catch {
    next(new UnauthorizedError('Invalid or expired session'));
  }
}
