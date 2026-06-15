/**
 * storyboardPipeline.routes — Express router for the storyboard-generation-pipeline
 * (backend-owned, resumable Step-2 state machine).
 *
 * Every route requires auth (authMiddleware) + the 'editor' ACL. Ownership /
 * existence-hiding is enforced in the service layer FIRST (assertDraftOwner →
 * NotFoundError → opaque 404, AC-13), before any prerequisite/order guard.
 *
 * NOTE: this router is intentionally NOT mounted in index.ts here — that wiring is
 * T14's responsibility (alongside the realtime publish + reaper registration).
 *
 * Route map (per docs/features/storyboard-generation-pipeline/contracts/openapi.yaml):
 *   GET  /storyboards/:draftId/pipeline                         → getPipelineState (AC-05, AC-13)
 *   POST /storyboards/:draftId/pipeline/confirm-cast            → confirmCast      (AC-03, AC-13)
 *   POST /storyboards/:draftId/pipeline/phases/:phase/trigger   → triggerPhase     (AC-04/06/08/13/14/15)
 *   POST /storyboards/:draftId/pipeline/phases/:phase/cancel    → cancelPhase      (AC-06, AC-13)
 *   POST /storyboards/:draftId/pipeline/phases/:phase/skip      → skipPhase        (AC-07, AC-13)
 */
import { Router } from 'express';

import { authMiddleware } from '@/middleware/auth.middleware.js';
import { aclMiddleware } from '@/middleware/acl.middleware.js';
import * as pipelineController from '@/controllers/storyboardPipeline.controller.js';

const router = Router();

// GET /storyboards/:draftId/pipeline
// Resume read: the single authoritative pipeline state for the draft. Lazily creates
// the row + auto-starts scene generation on a fresh draft; releases stuck phases.
router.get(
  '/storyboards/:draftId/pipeline',
  authMiddleware,
  aclMiddleware('editor'),
  pipelineController.getPipelineState,
);

// POST /storyboards/:draftId/pipeline/confirm-cast
// Accept the cast proposal: re-validate the estimate server-side, create reference
// blocks below music, claim the reference_image run. Idempotent. Returns 200.
router.post(
  '/storyboards/:draftId/pipeline/confirm-cast',
  authMiddleware,
  aclMiddleware('editor'),
  pipelineController.confirmCast,
);

// POST /storyboards/:draftId/pipeline/phases/:phase/trigger
// Start / re-trigger a phase (accept scene-image offer, manual trigger, incremental
// re-trigger). 422 on phase_out_of_order / scenes_required. Returns 200.
router.post(
  '/storyboards/:draftId/pipeline/phases/:phase/trigger',
  authMiddleware,
  aclMiddleware('editor'),
  pipelineController.triggerPhase,
);

// POST /storyboards/:draftId/pipeline/phases/:phase/cancel
// Cancel a running phase, keeping produced results. Idempotent no-op when not running.
router.post(
  '/storyboards/:draftId/pipeline/phases/:phase/cancel',
  authMiddleware,
  aclMiddleware('editor'),
  pipelineController.cancelPhase,
);

// POST /storyboards/:draftId/pipeline/phases/:phase/skip
// Skip a pending review modal: record the phase as `skipped` (distinct from idle).
// 422 pipeline.not_awaiting_review when nothing to skip.
router.post(
  '/storyboards/:draftId/pipeline/phases/:phase/skip',
  authMiddleware,
  aclMiddleware('editor'),
  pipelineController.skipPhase,
);

export { router as storyboardPipelineRouter };
