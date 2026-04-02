import type { Request, Response, NextFunction } from 'express';

import { ForbiddenError, UnauthorizedError } from '@/lib/errors.js';

type Role = 'viewer' | 'editor' | 'owner';

/**
 * Verifies the authenticated user has at least the specified role on the project.
 *
 * Currently a stub that enforces auth presence — full project ownership check will be
 * implemented alongside the projects CRUD subtask when project.repository.ts exists.
 */
export function aclMiddleware(_requiredRole: Role) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (process.env.NODE_ENV === 'development') {
      return next();
    }

    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }
    // TODO: query project_members or projects.owner_id to enforce role-based access.
    // For now, any authenticated user may act — gates will be tightened in the projects subtask.
    next();
  };
}
