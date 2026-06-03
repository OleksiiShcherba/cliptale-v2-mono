/**
 * generation-flows.routes — Express router for the Flow resource (T14).
 *
 * Registers the 6 Flow CRUD endpoints behind authMiddleware.
 * T15 will add estimate + generate routes to this same router.
 *
 * Route map (per contracts/openapi.yaml):
 *   GET    /generation-flows                      → listFlows
 *   POST   /generation-flows                      → createFlow
 *   GET    /generation-flows/:flowId              → getFlow
 *   PATCH  /generation-flows/:flowId              → renameFlow
 *   DELETE /generation-flows/:flowId              → deleteFlow
 *   PUT    /generation-flows/:flowId/canvas       → saveCanvas
 *
 * T15 generate surface:
 *   POST   /generation-flows/:flowId/blocks/:blockId/estimate  → estimateCost
 *   POST   /generation-flows/:flowId/blocks/:blockId/generate  → generateBlock
 */
import { Router } from 'express';

import { authMiddleware } from '@/middleware/auth.middleware.js';
import * as flowController from '@/controllers/generation-flow.controller.js';

const router = Router();

// GET /generation-flows — list owner's flows, newest first
router.get('/generation-flows', authMiddleware, flowController.listFlows);

// POST /generation-flows — create a new empty flow
router.post('/generation-flows', authMiddleware, flowController.createFlow);

// GET /generation-flows/:flowId — open a flow (canvas + job states)
router.get('/generation-flows/:flowId', authMiddleware, flowController.getFlow);

// PATCH /generation-flows/:flowId — rename a flow
router.patch('/generation-flows/:flowId', authMiddleware, flowController.renameFlow);

// DELETE /generation-flows/:flowId — soft-delete a flow
router.delete('/generation-flows/:flowId', authMiddleware, flowController.deleteFlow);

// PUT /generation-flows/:flowId/canvas — autosave canvas (optimistic-lock)
// Registered BEFORE /:flowId to avoid Express path shadowing for sub-paths.
router.put('/generation-flows/:flowId/canvas', authMiddleware, flowController.saveCanvas);

// POST /generation-flows/:flowId/blocks/:blockId/estimate — pre-flight cost estimate
router.post(
  '/generation-flows/:flowId/blocks/:blockId/estimate',
  authMiddleware,
  flowController.estimateCost,
);

// POST /generation-flows/:flowId/blocks/:blockId/generate — the spend path (requires Idempotency-Key)
router.post(
  '/generation-flows/:flowId/blocks/:blockId/generate',
  authMiddleware,
  flowController.generateBlock,
);

export { router as generationFlowsRouter };
