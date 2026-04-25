import { Router } from 'express';

import { authMiddleware } from '@/middleware/auth.middleware.js';
import * as trashController from '@/controllers/trash.controller.js';

const router = Router();

// GET /trash?type=file|project|draft&limit=50
// Returns soft-deleted items owned by the authenticated user.
router.get('/trash', authMiddleware, trashController.listTrash);

export { router as trashRouter };
