import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { authMiddleware } from '@/middleware/auth.middleware.js';
import { aclMiddleware } from '@/middleware/acl.middleware.js';
import { validateBody } from '@/middleware/validate.middleware.js';
import * as clipsController from '@/controllers/clips.controller.js';

const router = Router();

/**
 * Per-project rate limiter for the high-frequency clip patch endpoint.
 * Allows up to 60 requests per second per project by keying on project ID.
 * The global rate limiter on the app (200 req/min) still applies on top of this.
 */
const clipPatchRateLimit = rateLimit({
  windowMs: 1_000,
  max: 60,
  // Key by project ID from the URL parameter so the limit is per-project.
  keyGenerator: (req) => `clip-patch:${req.params['id'] ?? 'unknown'}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many clip updates — please slow down' },
});

// PATCH /projects/:id/clips/:clipId
// Partially updates mutable timeline fields of a single clip without creating
// a version snapshot. Intended for high-frequency drag/trim events (≤60 req/s).
router.patch(
  '/projects/:id/clips/:clipId',
  authMiddleware,
  aclMiddleware('editor'),
  clipPatchRateLimit,
  validateBody(clipsController.patchClipSchema),
  clipsController.patchClip,
);

export { router as clipsRouter };
