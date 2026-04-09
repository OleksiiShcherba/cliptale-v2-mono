import { Router } from 'express';

import { authMiddleware } from '@/middleware/auth.middleware.js';
import { validateBody } from '@/middleware/validate.middleware.js';
import * as aiProvidersController from '@/controllers/aiProviders.controller.js';

const router = Router();

// POST /user/ai-providers — add a new provider config with an encrypted API key.
router.post(
  '/user/ai-providers',
  authMiddleware,
  validateBody(aiProvidersController.addProviderSchema),
  aiProvidersController.addProvider,
);

// GET /user/ai-providers — list all configured providers (no keys returned).
router.get(
  '/user/ai-providers',
  authMiddleware,
  aiProvidersController.listProviders,
);

// PATCH /user/ai-providers/:provider — update API key or active status.
router.patch(
  '/user/ai-providers/:provider',
  authMiddleware,
  validateBody(aiProvidersController.updateProviderSchema),
  aiProvidersController.updateProvider,
);

// DELETE /user/ai-providers/:provider — remove a provider config.
router.delete(
  '/user/ai-providers/:provider',
  authMiddleware,
  aiProvidersController.deleteProvider,
);

export { router as aiProvidersRouter };
