/**
 * Routes for the per-project UI state resource.
 *
 * Both routes require:
 *   - `authMiddleware`  — verifies a valid session token and attaches req.user.
 *   - `aclMiddleware('editor')` — confirms the user has at least editor-level
 *     access to the project (ownership check).
 *
 * Mounted in index.ts alongside other project-scoped routes.
 */

import { Router } from 'express';

import { authMiddleware } from '@/middleware/auth.middleware.js';
import { aclMiddleware } from '@/middleware/acl.middleware.js';
import { validateBody } from '@/middleware/validate.middleware.js';
import * as uiStateController from '@/controllers/userProjectUiState.controller.js';

const router = Router();

// GET /projects/:id/ui-state
// Returns { state: unknown | null, updatedAt: string | null }.
router.get(
  '/projects/:id/ui-state',
  authMiddleware,
  aclMiddleware('editor'),
  uiStateController.getUiState,
);

// PUT /projects/:id/ui-state
// Accepts { state: unknown }, upserts, returns 204.
router.put(
  '/projects/:id/ui-state',
  authMiddleware,
  aclMiddleware('editor'),
  validateBody(uiStateController.putUiStateSchema),
  uiStateController.putUiState,
);

export { router as userProjectUiStateRouter };
