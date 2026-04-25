import { Router } from 'express';

import { authMiddleware } from '@/middleware/auth.middleware.js';
import { validateBody } from '@/middleware/validate.middleware.js';
import * as sceneTemplateController from '@/controllers/sceneTemplate.controller.js';

const router = Router();

// IMPORTANT: sub-resource routes (/:id/add-to-storyboard) must be registered
// before the bare /:id routes to prevent Express from interpreting the literal
// sub-path strings as id param values.

// GET /scene-templates
// Returns { items: SceneTemplate[] } scoped to the authenticated user.
router.get(
  '/scene-templates',
  authMiddleware,
  sceneTemplateController.listTemplates,
);

// POST /scene-templates
// Creates a scene template. Returns 201 with the created template.
router.post(
  '/scene-templates',
  authMiddleware,
  validateBody(sceneTemplateController.createTemplateBodySchema),
  sceneTemplateController.createTemplate,
);

// POST /scene-templates/:id/add-to-storyboard
// Creates a storyboard block from a template. Returns 201 with the new block.
router.post(
  '/scene-templates/:id/add-to-storyboard',
  authMiddleware,
  validateBody(sceneTemplateController.addToStoryboardBodySchema),
  sceneTemplateController.addToStoryboard,
);

// GET /scene-templates/:id
// Returns the template. 404 if not found or not owned by caller.
router.get(
  '/scene-templates/:id',
  authMiddleware,
  sceneTemplateController.getTemplate,
);

// PUT /scene-templates/:id
// Updates fields + replaces media list atomically. Returns 200 with the updated template.
router.put(
  '/scene-templates/:id',
  authMiddleware,
  validateBody(sceneTemplateController.updateTemplateBodySchema),
  sceneTemplateController.updateTemplate,
);

// DELETE /scene-templates/:id
// Soft-deletes the template. Returns 204.
router.delete(
  '/scene-templates/:id',
  authMiddleware,
  sceneTemplateController.deleteTemplate,
);

export { router as sceneTemplateRouter };
