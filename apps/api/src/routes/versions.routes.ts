import { Router } from 'express';

import { authMiddleware } from '@/middleware/auth.middleware.js';
import { aclMiddleware } from '@/middleware/acl.middleware.js';
import { validateBody } from '@/middleware/validate.middleware.js';
import * as versionsController from '@/controllers/versions.controller.js';

const router = Router();

// POST /projects/:id/versions
// Persists a new version snapshot with optimistic locking.
// Returns 201 { versionId, createdAt } on success.
// Returns 409 on stale parentVersionId, 422 on unsupported doc_schema_version.
router.post(
  '/projects/:id/versions',
  authMiddleware,
  aclMiddleware('editor'),
  validateBody(versionsController.saveVersionSchema),
  versionsController.saveVersion,
);

// GET /projects/:id/versions
// Returns the last 50 version summaries (newest first).
// Each entry: { versionId, createdAt, createdByUserId, durationFrames }.
router.get(
  '/projects/:id/versions',
  authMiddleware,
  aclMiddleware('viewer'),
  versionsController.listVersions,
);

// POST /projects/:id/versions/:versionId/restore
// Atomically restores project to the specified version.
// Updates latest_version_id, writes project.restore audit event.
// Returns 200 { docJson } on success; 404 when versionId not found for project.
router.post(
  '/projects/:id/versions/:versionId/restore',
  authMiddleware,
  aclMiddleware('editor'),
  versionsController.restoreVersion,
);

export { router as versionsRouter };
