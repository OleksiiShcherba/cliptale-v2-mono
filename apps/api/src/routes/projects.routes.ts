import { Router } from 'express';

import { authMiddleware } from '@/middleware/auth.middleware.js';
import { aclMiddleware } from '@/middleware/acl.middleware.js';
import { validateBody } from '@/middleware/validate.middleware.js';
import * as projectsController from '@/controllers/projects.controller.js';

const router = Router();

// GET /projects
// Returns all projects owned by the authenticated user.
router.get('/projects', authMiddleware, aclMiddleware('editor'), projectsController.listProjects);

// POST /projects
// Creates a new empty project record and returns { projectId }.
router.post('/projects', authMiddleware, aclMiddleware('editor'), projectsController.createProject);

// DELETE /projects/:id
// Soft-deletes a project owned by the authenticated user. Returns 204 No Content.
router.delete(
  '/projects/:id',
  authMiddleware,
  aclMiddleware('editor'),
  projectsController.deleteProject,
);

// POST /projects/:id/restore
// Restores a soft-deleted project. Returns 200 with the restored project.
// Registered BEFORE /:projectId/files to avoid param confusion.
router.post(
  '/projects/:id/restore',
  authMiddleware,
  aclMiddleware('editor'),
  projectsController.restoreProject,
);

// POST /projects/:projectId/files
// Links a file (by fileId) to a project. Both must be owned by the caller.
// Idempotent — double-linking the same (project, file) pair returns 204.
router.post(
  '/projects/:projectId/files',
  authMiddleware,
  aclMiddleware('editor'),
  validateBody(projectsController.linkFileToProjectSchema),
  projectsController.linkFileToProject,
);

export { router as projectsRouter };
