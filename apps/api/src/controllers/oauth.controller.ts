import type { Request, Response, NextFunction } from 'express';

import { config } from '@/config.js';
import * as oauthService from '@/services/oauth.service.js';

/**
 * GET /auth/google
 * Redirects the user to Google's OAuth consent screen.
 */
export function googleRedirect(_req: Request, res: Response): void {
  const url = oauthService.getGoogleAuthUrl();
  res.redirect(url);
}

/**
 * GET /auth/google/callback
 * Handles the OAuth callback from Google. Exchanges code for token,
 * finds or creates the user, and redirects to the frontend with the session token.
 */
export async function googleCallback(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const code = req.query.code as string | undefined;
    if (!code) {
      res.redirect(`${config.oauth.frontendUrl}/login?error=missing_code`);
      return;
    }

    const result = await oauthService.handleGoogleCallback(code);
    res.redirect(`${config.oauth.frontendUrl}/editor?token=${result.token}`);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /auth/github
 * Redirects the user to GitHub's OAuth consent screen.
 */
export function githubRedirect(_req: Request, res: Response): void {
  const url = oauthService.getGithubAuthUrl();
  res.redirect(url);
}

/**
 * GET /auth/github/callback
 * Handles the OAuth callback from GitHub. Exchanges code for token,
 * finds or creates the user, and redirects to the frontend with the session token.
 */
export async function githubCallback(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const code = req.query.code as string | undefined;
    if (!code) {
      res.redirect(`${config.oauth.frontendUrl}/login?error=missing_code`);
      return;
    }

    const result = await oauthService.handleGithubCallback(code);
    res.redirect(`${config.oauth.frontendUrl}/editor?token=${result.token}`);
  } catch (err) {
    next(err);
  }
}
