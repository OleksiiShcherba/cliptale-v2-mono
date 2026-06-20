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
 *   POST   /motion-graphics/generate         → generateMotionGraphic   (AC-05/AC-11, SSE)
 *   POST   /motion-graphics/:id/refine       → refineMotionGraphic     (AC-07/AC-11, SSE)
 *
 * NOTE: the storyboard attach endpoint is T12 — not mounted here.
 */
import { Router } from 'express';

import { authMiddleware } from '@/middleware/auth.middleware.js';
import * as motionGraphicController from '@/controllers/motionGraphic.controller.js';

const router = Router();

// POST /motion-graphics/generate — open the SSE generation stream (Flow 1). The
// pre-stream gates (length AC-05 → cost AC-11 → guardrail) return JSON 4xx BEFORE the
// stream opens; on pass the response is text/event-stream relaying token/done frames
// (ADR-0003). Non-persisting — the browser persists via POST /motion-graphics (T16).
// Declared before '/motion-graphics/:id' is irrelevant (distinct path), but kept with
// the other POSTs for readability.
router.post('/motion-graphics/generate', authMiddleware, motionGraphicController.generateMotionGraphic);

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

// POST /motion-graphics/:id/refine — open the SSE refinement stream (Flow 3). Reads the
// graphic with the owner check (non-owner / absent → 404 BEFORE streaming, AC-07), then
// runs the cost (AC-11) + guardrail gates returning JSON 4xx before the stream opens; on
// pass the response is text/event-stream relaying token/done frames. Non-persisting — the
// browser persists via POST /motion-graphics/:id/turns (T17).
router.post('/motion-graphics/:id/refine', authMiddleware, motionGraphicController.refineMotionGraphic);

export { router as motionGraphicRouter };
