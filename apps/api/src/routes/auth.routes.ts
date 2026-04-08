import { Router } from 'express';

import { authMiddleware } from '@/middleware/auth.middleware.js';
import { validateBody } from '@/middleware/validate.middleware.js';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '@/middleware/auth.schema.js';
import { registerLimiter, loginLimiter } from '@/middleware/auth.rate-limiters.js';
import * as authController from '@/controllers/auth.controller.js';
import * as oauthController from '@/controllers/oauth.controller.js';

const router = Router();

// POST /auth/register — create a new user account
router.post(
  '/auth/register',
  registerLimiter,
  validateBody(registerSchema),
  authController.register,
);

// POST /auth/login — authenticate with email/password
router.post(
  '/auth/login',
  loginLimiter,
  validateBody(loginSchema),
  authController.login,
);

// POST /auth/logout — invalidate the current session
router.post('/auth/logout', authController.logout);

// POST /auth/forgot-password — initiate password reset (always returns 200)
router.post(
  '/auth/forgot-password',
  validateBody(forgotPasswordSchema),
  authController.forgotPassword,
);

// POST /auth/reset-password — reset password with valid token
router.post(
  '/auth/reset-password',
  validateBody(resetPasswordSchema),
  authController.resetPassword,
);

// POST /auth/verify-email — verify email with token
router.post(
  '/auth/verify-email',
  validateBody(verifyEmailSchema),
  authController.verifyEmail,
);

// GET /auth/me — return current authenticated user info
router.get('/auth/me', authMiddleware, authController.getMe);

// GET /auth/google — redirect to Google OAuth consent screen
router.get('/auth/google', oauthController.googleRedirect);

// GET /auth/google/callback — handle Google OAuth callback
router.get('/auth/google/callback', oauthController.googleCallback);

// GET /auth/github — redirect to GitHub OAuth consent screen
router.get('/auth/github', oauthController.githubRedirect);

// GET /auth/github/callback — handle GitHub OAuth callback
router.get('/auth/github/callback', oauthController.githubCallback);

export { router as authRouter };
