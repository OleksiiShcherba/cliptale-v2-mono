/**
 * storyboard-references.routes — Express router for the storyboard reference-flows domain (T13).
 *
 * All routes are scoped under /storyboards/:draftId/references and require auth.
 * Ownership / existence hiding is enforced in the service layer (AC-13).
 *
 * Route map (per docs/features/storyboard-reference-flows/contracts/openapi.yaml):
 *   POST /storyboards/:draftId/references/extract      → startCastExtraction (AC-01, AC-01b, AC-13)
 *   GET  /storyboards/:draftId/references/extraction   → getCastExtraction   (AC-01, AC-13)
 *   POST /storyboards/:draftId/references/confirm      → confirmCast         (AC-03, AC-13)
 */
import { Router } from 'express';

import { authMiddleware } from '@/middleware/auth.middleware.js';
import * as referenceController from '@/controllers/storyboardReference.controller.js';

const router = Router();

// POST /storyboards/:draftId/references/extract
// Enqueues a cast-extraction AI job for the draft. Returns 202 { jobId, status:'queued' }.
// Requires Idempotency-Key header. 409 on conflict (duplicate extraction or blocks exist).
router.post(
  '/storyboards/:draftId/references/extract',
  authMiddleware,
  referenceController.startCastExtraction,
);

// GET /storyboards/:draftId/references/extraction
// Returns the latest CastExtractionJob for the draft (status + proposal).
// 404 with code references.extraction_not_found when no job exists yet.
router.get(
  '/storyboards/:draftId/references/extraction',
  authMiddleware,
  referenceController.getCastExtraction,
);

// POST /storyboards/:draftId/references/confirm
// Confirms the cast: creates K reference blocks + flows, enqueues first generation.
// Returns 201 ReferenceBlockList { items: [...] }. Requires Idempotency-Key header.
router.post(
  '/storyboards/:draftId/references/confirm',
  authMiddleware,
  referenceController.confirmCast,
);

export { router as storyboardReferencesRouter };
