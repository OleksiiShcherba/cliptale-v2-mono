import { Router } from 'express';

import { authMiddleware } from '@/middleware/auth.middleware.js';
import { aclMiddleware } from '@/middleware/acl.middleware.js';
import { validateBody } from '@/middleware/validate.middleware.js';
import * as rendersController from '@/controllers/renders.controller.js';

const router = Router();

// POST /projects/:id/renders
// Creates a new render job: validates preset, checks version ownership,
// enforces per-user 2-concurrent limit, enqueues BullMQ job.
// Returns 202 { jobId, status: 'queued' } on success.
// Returns 400 on invalid preset, 404 on missing version, 409 on concurrency limit.
router.post(
  '/projects/:id/renders',
  authMiddleware,
  aclMiddleware('editor'),
  validateBody(rendersController.createRenderSchema),
  rendersController.createRender,
);

// GET /renders/:jobId
// Returns current status, progress, and (when complete) a presigned downloadUrl.
// Returns 200 { jobId, status, progressPct, preset, downloadUrl? } on success.
// Returns 404 when job does not exist.
router.get(
  '/renders/:jobId',
  authMiddleware,
  rendersController.getRenderStatus,
);

// GET /projects/:id/renders
// Returns all render jobs for a project, newest first.
// Returns 200 { renders: [...] }.
router.get(
  '/projects/:id/renders',
  authMiddleware,
  aclMiddleware('viewer'),
  rendersController.listProjectRenders,
);

export { router as rendersRouter };
