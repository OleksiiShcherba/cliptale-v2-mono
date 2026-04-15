import { Router } from 'express';

import { authMiddleware } from '@/middleware/auth.middleware.js';
import { aclMiddleware } from '@/middleware/acl.middleware.js';
import { validateBody } from '@/middleware/validate.middleware.js';
import * as generationDraftsController from '@/controllers/generationDrafts.controller.js';

const router = Router();

// POST /generation-drafts
// Creates a new generation draft for the authenticated user.
router.post(
  '/generation-drafts',
  authMiddleware,
  aclMiddleware('editor'),
  validateBody(generationDraftsController.upsertDraftBodySchema),
  generationDraftsController.createDraft,
);

// GET /generation-drafts?mine=true
// Returns all generation drafts belonging to the authenticated user.
router.get(
  '/generation-drafts',
  authMiddleware,
  aclMiddleware('editor'),
  generationDraftsController.listDrafts,
);

// GET /generation-drafts/:id
// Returns a single generation draft. Enforces ownership in the service layer.
router.get(
  '/generation-drafts/:id',
  authMiddleware,
  aclMiddleware('editor'),
  generationDraftsController.getDraft,
);

// PUT /generation-drafts/:id
// Replaces the promptDoc of an existing draft. Enforces ownership in the service layer.
router.put(
  '/generation-drafts/:id',
  authMiddleware,
  aclMiddleware('editor'),
  validateBody(generationDraftsController.upsertDraftBodySchema),
  generationDraftsController.updateDraft,
);

// DELETE /generation-drafts/:id
// Deletes a draft. Enforces ownership in the service layer. Returns 204 No Content.
router.delete(
  '/generation-drafts/:id',
  authMiddleware,
  aclMiddleware('editor'),
  generationDraftsController.deleteDraft,
);

export { router as generationDraftsRouter };
