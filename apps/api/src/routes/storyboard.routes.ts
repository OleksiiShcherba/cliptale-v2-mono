import { Router } from 'express';

import { authMiddleware } from '@/middleware/auth.middleware.js';
import { aclMiddleware } from '@/middleware/acl.middleware.js';
import { validateBody } from '@/middleware/validate.middleware.js';
import * as storyboardController from '@/controllers/storyboard.controller.js';

const router = Router();

// IMPORTANT: sub-resource routes (/history) must be registered
// before the bare /:draftId routes to prevent Express from interpreting the
// literal sub-path strings as draftId param values.

// GET /storyboards/:draftId/history
// Returns the last 50 snapshots for the draft, newest first.
router.get(
  '/storyboards/:draftId/history',
  authMiddleware,
  aclMiddleware('editor'),
  storyboardController.getHistory,
);

// POST /storyboards/:draftId/history
// Accepts { snapshot: object }, inserts a row, prunes beyond 50. Returns 201.
router.post(
  '/storyboards/:draftId/history',
  authMiddleware,
  aclMiddleware('editor'),
  validateBody(storyboardController.pushHistoryBodySchema),
  storyboardController.postHistory,
);

// GET /storyboards/:draftId
// Returns { blocks, edges } for the authenticated user's draft.
router.get(
  '/storyboards/:draftId',
  authMiddleware,
  aclMiddleware('editor'),
  storyboardController.getStoryboard,
);

// PUT /storyboards/:draftId
// Full-replaces storyboard state in a single transaction. Returns 200 { blocks, edges }.
router.put(
  '/storyboards/:draftId',
  authMiddleware,
  aclMiddleware('editor'),
  validateBody(storyboardController.saveStoryboardBodySchema),
  storyboardController.putStoryboard,
);

export { router as storyboardRouter };
