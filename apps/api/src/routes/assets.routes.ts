import { Router } from 'express';

import { authMiddleware } from '@/middleware/auth.middleware.js';
import { aclMiddleware } from '@/middleware/acl.middleware.js';
import { validateBody } from '@/middleware/validate.middleware.js';
import * as assetsController from '@/controllers/assets.controller.js';

const router = Router();

// POST /projects/:id/assets/upload-url
// Returns a presigned S3 PUT URL and inserts a pending asset row.
router.post(
  '/projects/:id/assets/upload-url',
  authMiddleware,
  aclMiddleware('editor'),
  validateBody(assetsController.createUploadUrlSchema),
  assetsController.createUploadUrl,
);

// GET /projects/:id/assets
// Returns all assets for a project as a JSON array (empty array if none).
router.get('/projects/:id/assets', authMiddleware, assetsController.getProjectAssets);

// GET /assets/:id
// Returns the current state of an asset — used by the FE polling hook.
router.get('/assets/:id', authMiddleware, assetsController.getAsset);

// DELETE /assets/:id
// Deletes the asset if it is not referenced by any clip. Returns 204 No Content.
router.delete('/assets/:id', authMiddleware, assetsController.deleteAsset);

// POST /assets/:id/finalize
// Called by the client after the XHR PUT to S3 completes.
// Verifies storage, transitions pending → processing, enqueues media-ingest job.
router.post(
  '/assets/:id/finalize',
  authMiddleware,
  aclMiddleware('editor'),
  assetsController.finalizeAsset,
);

// GET /assets/:id/thumbnail
// Proxies the asset thumbnail image from S3 — returns 404 when no thumbnail exists.
router.get('/assets/:id/thumbnail', authMiddleware, assetsController.thumbnailAsset);

// GET /assets/:id/stream
// Proxies the S3 object to the browser so the raw s3:// URI is never exposed.
// Forwards Range headers for video byte-range seeking.
router.get('/assets/:id/stream', authMiddleware, assetsController.streamAsset);

export { router as assetsRouter };
