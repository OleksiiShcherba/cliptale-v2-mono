import type { Request, Response, NextFunction } from 'express';

import * as authService from '@/services/auth.service.js';
import type {
  RegisterBody,
  LoginBody,
  ForgotPasswordBody,
  ResetPasswordBody,
  VerifyEmailBody,
} from '@/middleware/auth.schema.js';

/**
 * POST /auth/register
 * Body is pre-validated by `validateBody(registerSchema)` in the route.
 */
export async function register(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as RegisterBody;
    const result = await authService.register(
      body.email,
      body.password,
      body.displayName,
    );
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /auth/login
 * Body is pre-validated by `validateBody(loginSchema)` in the route.
 */
export async function login(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as LoginBody;
    const result = await authService.login(body.email, body.password);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /auth/logout
 * Requires a valid Bearer token in the Authorization header.
 */
export async function logout(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    const rawToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : '';
    await authService.logout(rawToken);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

/**
 * POST /auth/forgot-password
 * Always returns 200 — does not reveal whether the email exists.
 */
export async function forgotPassword(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as ForgotPasswordBody;
    await authService.forgotPassword(body.email);
    res.json({ message: 'If the email is registered, a reset link has been sent.' });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /auth/reset-password
 * Resets the password using a valid reset token.
 */
export async function resetPassword(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as ResetPasswordBody;
    await authService.resetPassword(body.token, body.newPassword);
    res.json({ message: 'Password has been reset successfully.' });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /auth/verify-email
 * Verifies the user's email using a verification token.
 */
export async function verifyEmail(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as VerifyEmailBody;
    await authService.verifyEmail(body.token);
    res.json({ message: 'Email verified successfully.' });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /auth/me
 * Returns the currently authenticated user's info.
 * Requires auth middleware to have attached req.user.
 */
export async function getMe(
  req: Request,
  res: Response,
  _next: NextFunction,
): Promise<void> {
  res.json({
    userId: req.user!.userId,
    email: req.user!.email,
    displayName: req.user!.displayName,
  });
}
