import { Router } from 'express';

import { authMiddleware } from '@/middleware/auth.middleware.js';
import * as projectsController from '@/controllers/projects.controller.js';

const router = Router();

// POST /projects
// Creates a new empty project record and returns { projectId }.
router.post('/projects', authMiddleware, projectsController.createProject);

export { router as projectsRouter };
