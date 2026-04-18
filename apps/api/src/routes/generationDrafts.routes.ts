import { Router } from 'express';

import { authMiddleware } from '@/middleware/auth.middleware.js';
import { aclMiddleware } from '@/middleware/acl.middleware.js';
import { validateBody } from '@/middleware/validate.middleware.js';
import { enhancePromptLimiter } from '@/middleware/enhance.rate-limiter.js';
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

// GET /generation-drafts/cards
// Returns storyboard card summaries for the authenticated user's drafts.
// MUST be registered before /:id so Express does not interpret 'cards' as an id param.
router.get(
  '/generation-drafts/cards',
  authMiddleware,
  aclMiddleware('editor'),
  generationDraftsController.listCards,
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

// POST /generation-drafts/:id/enhance
// Enqueues an AI Enhance job for the draft. Per-user rate limit: 10/hour.
// Returns 202 { jobId } on success. Requires authMiddleware before enhancePromptLimiter
// so that req.user is available for the per-user key generator.
router.post(
  '/generation-drafts/:id/enhance',
  authMiddleware,
  aclMiddleware('editor'),
  enhancePromptLimiter,
  generationDraftsController.startEnhance,
);

// GET /generation-drafts/:id/enhance/:jobId
// Polls the status of a previously enqueued enhance job.
// Returns 200 { status, result?, error? }. No rate limit on polling.
router.get(
  '/generation-drafts/:id/enhance/:jobId',
  authMiddleware,
  aclMiddleware('editor'),
  generationDraftsController.getEnhanceStatus,
);

// POST /generation-drafts/:draftId/files
// Links a file (by fileId) to a draft. Both must be owned by the caller.
// Idempotent — double-linking the same (draft, file) pair returns 204.
router.post(
  '/generation-drafts/:draftId/files',
  authMiddleware,
  aclMiddleware('editor'),
  validateBody(generationDraftsController.linkFileToDraftSchema),
  generationDraftsController.linkFileToDraft,
);

// GET /generation-drafts/:id/assets
// Returns all files linked to the draft, serialized as AssetApiResponse[].
// Registered AFTER /:id/enhance/:jobId to avoid param collision.
router.get(
  '/generation-drafts/:id/assets',
  authMiddleware,
  aclMiddleware('editor'),
  generationDraftsController.getDraftAssets,
);

// POST /generation-drafts/:draftId/ai/generate
// Submits an AI generation request for a draft. Ownership enforced in the service.
// Returns 202 { jobId, status: 'queued' } on success.
// Registered after /:id/assets to avoid any potential param shadowing.
router.post(
  '/generation-drafts/:draftId/ai/generate',
  authMiddleware,
  aclMiddleware('editor'),
  validateBody(generationDraftsController.submitDraftAiGenerationSchema),
  generationDraftsController.submitDraftAiGeneration,
);

export { router as generationDraftsRouter };
