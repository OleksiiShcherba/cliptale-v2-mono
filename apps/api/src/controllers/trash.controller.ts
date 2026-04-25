/**
 * Controller for the /trash endpoints.
 *
 * GET /trash?type=file|project|draft&limit=<n>&cursor=<cursor>
 *   Returns soft-deleted items owned by the authenticated user.
 *   `cursor` is an opaque keyset cursor from a previous response's `nextCursor`.
 */
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import * as trashService from '@/services/trash.service.js';

/** Zod schema for GET /trash query params. Exported for use with validateQuery. */
export const trashQuerySchema = z.object({
  type: z.enum(['file', 'project', 'draft']),
  limit: z.coerce.number().int().min(1).max(50).default(50),
  cursor: z.string().optional(),
});

/**
 * GET /trash
 * Returns up to `limit` soft-deleted items of the given `type` owned by the caller.
 * When `cursor` is present, returns the next page after that cursor position.
 * Response: { items: TrashItem[], nextCursor?: string }
 */
export async function listTrash(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = trashQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Invalid query' });
      return;
    }

    const { type, limit, cursor } = parsed.data;
    const userId = req.user!.userId;
    const result = await trashService.listTrash(userId, type, limit, cursor);
    res.json(result);
  } catch (err) {
    next(err);
  }
}
