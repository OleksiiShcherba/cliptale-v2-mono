import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import * as storyboardService from '@/services/storyboard.service.js';
import { saveStoryboardBodySchema, pushHistoryBodySchema } from '@/controllers/storyboard.controller.schemas.js';

export { saveStoryboardBodySchema, pushHistoryBodySchema } from '@/controllers/storyboard.controller.schemas.js';

type SaveBody = z.infer<typeof saveStoryboardBodySchema>;
type PushHistoryBody = z.infer<typeof pushHistoryBodySchema>;

/**
 * GET /storyboards/:draftId
 * Returns { blocks, edges } for the authenticated user's draft.
 * Throws 404 when the draft does not exist, 403 when it belongs to another user.
 */
export async function getStoryboard(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const state = await storyboardService.loadStoryboard(
      req.user!.userId,
      req.params['draftId']!,
    );
    res.json(state);
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /storyboards/:draftId
 * Full-replaces all blocks and edges in a single DB transaction.
 * Body is pre-validated by validateBody(saveStoryboardBodySchema).
 * Returns 200 with the saved state.
 */
export async function putStoryboard(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as SaveBody;
    const state = await storyboardService.saveStoryboard(
      req.user!.userId,
      req.params['draftId']!,
      body.blocks,
      body.edges,
    );
    res.json(state);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /storyboards/:draftId/history
 * Returns the last 50 snapshots ordered newest-first.
 */
export async function getHistory(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const entries = await storyboardService.listHistory(
      req.user!.userId,
      req.params['draftId']!,
    );
    res.json(entries);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /storyboards/:draftId/history
 * Accepts { snapshot: object }, inserts it, prunes beyond 50 rows.
 * Returns 201.
 * Body is pre-validated by validateBody(pushHistoryBodySchema).
 */
export async function postHistory(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { snapshot } = req.body as PushHistoryBody;
    const id = await storyboardService.pushHistory(
      req.user!.userId,
      req.params['draftId']!,
      snapshot,
    );
    res.status(201).json({ id });
  } catch (err) {
    next(err);
  }
}
