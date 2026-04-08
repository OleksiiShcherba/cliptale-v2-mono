import { randomUUID, randomBytes, createHash } from 'node:crypto';

import { config } from '@/config.js';
import * as userRepository from '@/repositories/user.repository.js';
import * as sessionRepository from '@/repositories/session.repository.js';
import { ValidationError } from '@/lib/errors.js';
import type { AuthResult } from '@/services/auth.service.js';

/** Session token validity — 7 days. */
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Generates a cryptographically random 32-byte hex token. */
function generateToken(): string {
  return randomBytes(32).toString('hex');
}

/** Hashes a raw token with SHA-256 for DB storage. */
function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

/** Creates a session for a user and returns the auth result. */
async function createSessionForUser(user: {
  userId: string;
  email: string;
  displayName: string;
}): Promise<AuthResult> {
  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await sessionRepository.createSession({
    sessionId: randomUUID(),
    userId: user.userId,
    tokenHash,
    expiresAt,
  });

  return {
    user: { userId: user.userId, email: user.email, displayName: user.displayName },
    token: rawToken,
    expiresAt,
  };
}

// ---------------------------------------------------------------------------
// Google OAuth
// ---------------------------------------------------------------------------

/** Google OAuth token response shape. */
type GoogleTokenResponse = {
  access_token: string;
  token_type: string;
};

/** Google user info response shape. */
type GoogleUserInfo = {
  sub: string;
  email: string;
  name: string;
  email_verified: boolean;
};

/** Returns the Google OAuth authorization URL. */
export function getGoogleAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: config.oauth.google.clientId,
    redirect_uri: `${config.oauth.redirectBase}/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

/**
 * Exchanges a Google authorization code for user info and creates/finds a user.
 * Links accounts if the email already exists.
 *
 * @throws ValidationError if the code exchange fails.
 */
export async function handleGoogleCallback(code: string): Promise<AuthResult> {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.oauth.google.clientId,
      client_secret: config.oauth.google.clientSecret,
      redirect_uri: `${config.oauth.redirectBase}/auth/google/callback`,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    throw new ValidationError('Google OAuth code exchange failed');
  }

  const tokenData = (await tokenRes.json()) as GoogleTokenResponse;

  const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!userInfoRes.ok) {
    throw new ValidationError('Failed to fetch Google user info');
  }

  const googleUser = (await userInfoRes.json()) as GoogleUserInfo;
  return findOrCreateOAuthUser({
    provider: 'google',
    providerId: googleUser.sub,
    email: googleUser.email,
    displayName: googleUser.name,
  });
}

// ---------------------------------------------------------------------------
// GitHub OAuth
// ---------------------------------------------------------------------------

/** GitHub OAuth token response shape. */
type GitHubTokenResponse = {
  access_token: string;
  token_type: string;
};

/** GitHub user info response shape. */
type GitHubUserInfo = {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
};

/** GitHub email response shape. */
type GitHubEmail = {
  email: string;
  primary: boolean;
  verified: boolean;
};

/** Returns the GitHub OAuth authorization URL. */
export function getGithubAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: config.oauth.github.clientId,
    redirect_uri: `${config.oauth.redirectBase}/auth/github/callback`,
    scope: 'user:email',
  });
  return `https://github.com/login/oauth/authorize?${params}`;
}

/**
 * Exchanges a GitHub authorization code for user info and creates/finds a user.
 * Links accounts if the email already exists.
 *
 * @throws ValidationError if the code exchange fails.
 */
export async function handleGithubCallback(code: string): Promise<AuthResult> {
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: config.oauth.github.clientId,
      client_secret: config.oauth.github.clientSecret,
      code,
    }),
  });

  if (!tokenRes.ok) {
    throw new ValidationError('GitHub OAuth code exchange failed');
  }

  const tokenData = (await tokenRes.json()) as GitHubTokenResponse;

  const userInfoRes = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: 'application/json',
    },
  });

  if (!userInfoRes.ok) {
    throw new ValidationError('Failed to fetch GitHub user info');
  }

  const ghUser = (await userInfoRes.json()) as GitHubUserInfo;

  // GitHub may not return email in user profile — fetch from /user/emails
  let email = ghUser.email;
  if (!email) {
    const emailsRes = await fetch('https://api.github.com/user/emails', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: 'application/json',
      },
    });
    if (emailsRes.ok) {
      const emails = (await emailsRes.json()) as GitHubEmail[];
      const primary = emails.find((e) => e.primary && e.verified);
      email = primary?.email ?? emails[0]?.email ?? null;
    }
  }

  if (!email) {
    throw new ValidationError('Could not retrieve email from GitHub');
  }

  return findOrCreateOAuthUser({
    provider: 'github',
    providerId: String(ghUser.id),
    email,
    displayName: ghUser.name ?? ghUser.login,
  });
}

// ---------------------------------------------------------------------------
// Shared: find-or-create user by OAuth provider
// ---------------------------------------------------------------------------

type OAuthUserParams = {
  provider: 'google' | 'github';
  providerId: string;
  email: string;
  displayName: string;
};

/**
 * Finds an existing user by provider ID, links by email if found, or creates
 * a new user. Always creates a session and returns the auth result.
 */
async function findOrCreateOAuthUser(params: OAuthUserParams): Promise<AuthResult> {
  const { provider, providerId, email, displayName } = params;

  // 1. Check if a user already exists with this provider ID
  const existingByProvider =
    provider === 'google'
      ? await userRepository.getUserByGoogleId(providerId)
      : await userRepository.getUserByGithubId(providerId);

  if (existingByProvider) {
    return createSessionForUser(existingByProvider);
  }

  // 2. Check if a user exists with matching email — link the provider
  const existingByEmail = await userRepository.getUserByEmail(email);
  if (existingByEmail) {
    if (provider === 'google') {
      await userRepository.linkGoogleId(existingByEmail.userId, providerId);
    } else {
      await userRepository.linkGithubId(existingByEmail.userId, providerId);
    }
    return createSessionForUser(existingByEmail);
  }

  // 3. Create a new user with this provider
  const userId = randomUUID();
  await userRepository.createUser({
    userId,
    email,
    displayName,
    googleId: provider === 'google' ? providerId : null,
    githubId: provider === 'github' ? providerId : null,
  });

  // Mark email as verified for OAuth users
  await userRepository.markEmailVerified(userId);

  return createSessionForUser({ userId, email, displayName });
}
