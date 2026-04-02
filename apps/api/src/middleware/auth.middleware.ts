import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

import { config } from '@/config.js';
import { UnauthorizedError } from '@/lib/errors.js';

type JwtPayload = { sub: string; email: string; iat: number; exp: number };

/** Hardcoded dev user attached to every request when NODE_ENV === 'development'. */
const DEV_USER = { id: 'dev-user-001', email: 'dev@cliptale.local' } as const;

/** Validates the Bearer JWT in the Authorization header and attaches `req.user`. */
export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  if (process.env.NODE_ENV === 'development') {
    req.user = DEV_USER;
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Missing or malformed Authorization header'));
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, config.auth.jwtSecret) as JwtPayload;
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch {
    next(new UnauthorizedError('Invalid or expired token'));
  }
}
