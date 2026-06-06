/**
 * Routes for the per-account settings resource (storyboard-autosave-checkpoints).
 *
 * Both routes require `authMiddleware` only — the resource is account-scoped
 * (/users/me/…), so owner-scoping is structural (AC-11c): no project ACL
 * applies, the authenticated user can only ever address their own row.
 *
 * Mounted in index.ts alongside the other routers.
 */

import { Router } from 'express';

import { authMiddleware } from '@/middleware/auth.middleware.js';
import { validateBody } from '@/middleware/validate.middleware.js';
import * as settingsController from '@/controllers/settings.controller.js';

const router = Router();

// GET /users/me/settings
// Returns the effective settings (stored, or defaults when no row yet).
router.get('/users/me/settings', authMiddleware, settingsController.getMySettings);

// PUT /users/me/settings
// Accepts { autosaveIntervalSeconds: 30|60|120|300|600 }, upserts lazily,
// returns the persisted settings.
router.put(
  '/users/me/settings',
  authMiddleware,
  validateBody(settingsController.putSettingsSchema),
  settingsController.putMySettings,
);

export { router as settingsRouter };
