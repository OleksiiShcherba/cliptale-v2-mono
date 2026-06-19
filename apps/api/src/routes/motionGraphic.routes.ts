/**
 * motionGraphic.routes — T10
 *
 * Express router for the AI Motion Graphic non-streaming CRUD surface. Every route
 * requires auth (authMiddleware); the acting Creator comes from `req.user.userId`.
 * Ownership / existence-hiding (AC-07) is enforced in the service layer (T6) — a
 * non-owner / absent graphic answers as a uniform NotFoundError → opaque 404.
 *
 * Route map (per docs/features/ai-motion-graphic/contracts/openapi.yaml):
 *   GET    /motion-graphics                  → listMotionGraphics      (AC-13)
 *   POST   /motion-graphics                  → createMotionGraphic     (AC-01/AC-06)
 *   GET    /motion-graphics/:id              → getMotionGraphic        (AC-02/AC-07)
 *   PATCH  /motion-graphics/:id              → renameMotionGraphic     (AC-07)
 *   POST   /motion-graphics/:id/turns        → appendMotionGraphicTurn (AC-03/AC-14)
 *   POST   /motion-graphics/:id/duplicate    → duplicateMotionGraphic  (AC-12)
 *
 * NOTE: the SSE generate/refine endpoints (POST /motion-graphics/generate,
 * POST /motion-graphics/:id/refine) are T11; the storyboard attach endpoint is T12 —
 * neither is mounted here.
 */
import { Router } from 'express';

import { authMiddleware } from '@/middleware/auth.middleware.js';
import * as motionGraphicController from '@/controllers/motionGraphic.controller.js';

const router = Router();

// GET /motion-graphics — owner-scoped list, newest-first, cursor-paged (AC-13).
router.get('/motion-graphics', authMiddleware, motionGraphicController.listMotionGraphics);

// POST /motion-graphics — persist a generated graphic from the browser verdict
// (ready → status ready + code stored; failed → status failed + null code, AC-06).
router.post('/motion-graphics', authMiddleware, motionGraphicController.createMotionGraphic);

// GET /motion-graphics/:id — full graphic + chat history (AC-02). Non-owner → 404 (AC-07).
router.get('/motion-graphics/:id', authMiddleware, motionGraphicController.getMotionGraphic);

// PATCH /motion-graphics/:id — rename (metadata-only). Non-owner → 404 (AC-07).
router.patch('/motion-graphics/:id', authMiddleware, motionGraphicController.renameMotionGraphic);

// POST /motion-graphics/:id/turns — persist a refine exchange. ready → update code +
// bump version (AC-03); failed → keep last working version (AC-14). Non-owner → 404.
router.post(
  '/motion-graphics/:id/turns',
  authMiddleware,
  motionGraphicController.appendMotionGraphicTurn,
);

// POST /motion-graphics/:id/duplicate — independent copy with copied turns (AC-12).
router.post(
  '/motion-graphics/:id/duplicate',
  authMiddleware,
  motionGraphicController.duplicateMotionGraphic,
);

export { router as motionGraphicRouter };
