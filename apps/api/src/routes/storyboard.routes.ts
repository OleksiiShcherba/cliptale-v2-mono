import { Router } from 'express';

import { authMiddleware } from '@/middleware/auth.middleware.js';
import { aclMiddleware } from '@/middleware/acl.middleware.js';
import { validateBody } from '@/middleware/validate.middleware.js';
import * as storyboardController from '@/controllers/storyboard.controller.js';
import * as storyboardIllustrationController from '@/controllers/storyboardIllustration.controller.js';
import * as storyboardProjectController from '@/controllers/storyboardProject.controller.js';

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

// POST /storyboards/:draftId/apply-latest-plan
// Replaces storyboard blocks/edges from the latest completed storyboard plan.
router.post(
  '/storyboards/:draftId/apply-latest-plan',
  authMiddleware,
  aclMiddleware('editor'),
  storyboardController.applyLatestPlan,
);

// POST /storyboards/:draftId/project
// Creates or returns the editor project assembled from a ready storyboard.
router.post(
  '/storyboards/:draftId/project',
  authMiddleware,
  aclMiddleware('editor'),
  storyboardProjectController.createProjectFromStoryboard,
);

// GET /storyboards/:draftId/illustrations
// Returns scene illustration status for all scene blocks in storyboard order.
router.get(
  '/storyboards/:draftId/illustrations',
  authMiddleware,
  aclMiddleware('editor'),
  storyboardIllustrationController.listStoryboardIllustrations,
);

// POST /storyboards/:draftId/illustrations
// Enqueues missing/failed scene illustration jobs without duplicating active jobs.
router.post(
  '/storyboards/:draftId/illustrations',
  authMiddleware,
  aclMiddleware('editor'),
  storyboardIllustrationController.startStoryboardIllustrations,
);

// POST /storyboards/:draftId/illustrations/principal-image/approve
// Approves the ready principal image so scene illustration jobs may start.
router.post(
  '/storyboards/:draftId/illustrations/principal-image/approve',
  authMiddleware,
  aclMiddleware('editor'),
  storyboardIllustrationController.approveStoryboardPrincipalImage,
);

router.post(
  '/storyboards/:draftId/illustrations/principal-image/edit',
  authMiddleware,
  aclMiddleware('editor'),
  validateBody(storyboardIllustrationController.editPrincipalImageBodySchema),
  storyboardIllustrationController.editStoryboardPrincipalImage,
);

router.post(
  '/storyboards/:draftId/illustrations/principal-image/replace',
  authMiddleware,
  aclMiddleware('editor'),
  validateBody(storyboardIllustrationController.replacePrincipalImageBodySchema),
  storyboardIllustrationController.replaceStoryboardPrincipalImage,
);

router.put(
  '/storyboards/:draftId/illustrations/principal-image/references',
  authMiddleware,
  aclMiddleware('editor'),
  validateBody(storyboardIllustrationController.setPrincipalImageReferencesBodySchema),
  storyboardIllustrationController.setStoryboardPrincipalImageReferences,
);

// POST /storyboards/:draftId/blocks/:blockId/illustration
// Retries or starts one scene illustration job.
router.post(
  '/storyboards/:draftId/blocks/:blockId/illustration',
  authMiddleware,
  aclMiddleware('editor'),
  storyboardIllustrationController.startStoryboardBlockIllustration,
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
