/**
 * storyboard-references.routes — Express router for the storyboard reference-flows domain.
 *
 * All routes are scoped under /storyboards/:draftId/references and require auth.
 * Ownership / existence hiding is enforced in the service layer (AC-13).
 *
 * Route map (per docs/features/storyboard-reference-flows/contracts/openapi.yaml):
 *
 * T13 operations:
 *   POST /storyboards/:draftId/references/extract                               → startCastExtraction (AC-01, AC-01b, AC-13)
 *   GET  /storyboards/:draftId/references/extraction                            → getCastExtraction   (AC-01, AC-13)
 *   POST /storyboards/:draftId/references/confirm                               → confirmCast         (AC-03, AC-13)
 *
 * T14 operations:
 *   GET    /storyboards/:draftId/references/blocks                              → listReferenceBlocks          (AC-11, AC-13)
 *   POST   /storyboards/:draftId/references/blocks                              → createReferenceBlock         (AC-11, AC-13)
 *   PATCH  /storyboards/:draftId/references/blocks/:blockId                     → updateReferenceBlock         (AC-14, AC-13)
 *   DELETE /storyboards/:draftId/references/blocks/:blockId                     → deleteReferenceBlock         (AC-14, AC-13)
 *   POST   /storyboards/:draftId/references/blocks/:blockId/retry               → retryReferenceBlockGeneration (AC-04, AC-13)
 *   PUT    /storyboards/:draftId/references/blocks/:blockId/scene-links         → saveSceneLinks               (AC-10, AC-13)
 *   PUT    /storyboards/:draftId/references/blocks/:blockId/stars/:fileId       → starReferenceResult          (AC-06, AC-13)
 *   DELETE /storyboards/:draftId/references/blocks/:blockId/stars/:fileId       → unstarReferenceResult        (AC-06, AC-13)
 */
import { Router } from 'express';

import { authMiddleware } from '@/middleware/auth.middleware.js';
import * as referenceController from '@/controllers/storyboardReference.controller.js';

const router = Router();

// ── T13 routes ────────────────────────────────────────────────────────────────

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

// ── T14 routes ────────────────────────────────────────────────────────────────

// GET /storyboards/:draftId/references/blocks
// Returns 200 ReferenceBlockList { items: [...] }.
router.get(
  '/storyboards/:draftId/references/blocks',
  authMiddleware,
  referenceController.listReferenceBlocks,
);

// POST /storyboards/:draftId/references/blocks
// Manually adds a new reference block. Returns 201 ReferenceBlock (windowStatus null).
router.post(
  '/storyboards/:draftId/references/blocks',
  authMiddleware,
  referenceController.createReferenceBlock,
);

// PATCH /storyboards/:draftId/references/blocks/:blockId
// Versionless commutative XY position update. Returns 200 ReferenceBlock.
router.patch(
  '/storyboards/:draftId/references/blocks/:blockId',
  authMiddleware,
  referenceController.updateReferenceBlock,
);

// DELETE /storyboards/:draftId/references/blocks/:blockId
// Removes a reference block (flow survives). Returns 204 No Content.
router.delete(
  '/storyboards/:draftId/references/blocks/:blockId',
  authMiddleware,
  referenceController.deleteReferenceBlock,
);

// POST /storyboards/:draftId/references/blocks/:blockId/retry
// Re-enqueues generation for a failed block. Requires Idempotency-Key header.
// Returns 202 { blockId, windowStatus:'pending' }. 409 when block is not failed.
router.post(
  '/storyboards/:draftId/references/blocks/:blockId/retry',
  authMiddleware,
  referenceController.retryReferenceBlockGeneration,
);

// PUT /storyboards/:draftId/references/blocks/:blockId/scene-links
// Versioned save of scene-block associations. Returns 200 { sceneBlockIds, version }.
// 409 references.version_conflict on stale version.
router.put(
  '/storyboards/:draftId/references/blocks/:blockId/scene-links',
  authMiddleware,
  referenceController.saveSceneLinks,
);

// PUT /storyboards/:draftId/references/blocks/:blockId/stars/:fileId
// Stars (favourites) a generation result. Returns 200 BlockStarsState.
router.put(
  '/storyboards/:draftId/references/blocks/:blockId/stars/:fileId',
  authMiddleware,
  referenceController.starReferenceResult,
);

// DELETE /storyboards/:draftId/references/blocks/:blockId/stars/:fileId
// Unstars a generation result. Returns 200 BlockStarsState.
router.delete(
  '/storyboards/:draftId/references/blocks/:blockId/stars/:fileId',
  authMiddleware,
  referenceController.unstarReferenceResult,
);

export { router as storyboardReferencesRouter };
