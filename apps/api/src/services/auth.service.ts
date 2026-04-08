import { randomUUID, randomBytes, createHash } from 'node:crypto';

import bcrypt from 'bcryptjs';

import * as userRepository from '@/repositories/user.repository.js';
import * as sessionRepository from '@/repositories/session.repository.js';
import * as passwordResetRepository from '@/repositories/password-reset.repository.js';
import * as emailVerificationRepository from '@/repositories/email-verification.repository.js';
import * as emailService from '@/services/email.service.js';
import { ConflictError, UnauthorizedError, ValidationError } from '@/lib/errors.js';

/** Cost factor for bcrypt hashing — 12 per spec. */
const BCRYPT_ROUNDS = 12;

/** Session token validity — 7 days. */
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Password reset token validity — 1 hour. */
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

/** Email verification token validity — 24 hours. */
const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/** Generates a cryptographically random 32-byte hex token. */
function generateToken(): string {
  return randomBytes(32).toString('hex');
}

/** Hashes a raw token with SHA-256 for DB storage. */
function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

/** Result returned to the controller after register or login. */
export type AuthResult = {
  user: {
    userId: string;
    email: string;
    displayName: string;
  };
  token: string;
  expiresAt: Date;
};

/**
 * Registers a new user with email/password.
 * Creates the user row and an initial session.
 *
 * @throws ConflictError if the email is already registered.
 */
export async function register(
  email: string,
  password: string,
  displayName: string,
): Promise<AuthResult> {
  const existing = await userRepository.getUserByEmail(email);
  if (existing) {
    throw new ConflictError('Email is already registered');
  }

  const userId = randomUUID();
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  await userRepository.createUser({
    userId,
    email,
    displayName,
    passwordHash,
  });

  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await sessionRepository.createSession({
    sessionId: randomUUID(),
    userId,
    tokenHash,
    expiresAt,
  });

  // Send verification email asynchronously — do not block registration
  sendVerificationEmail(userId, email).catch((err) => {
    console.error('[auth] Failed to send verification email:', err);
  });

  return {
    user: { userId, email, displayName },
    token: rawToken,
    expiresAt,
  };
}

/**
 * Authenticates a user with email/password.
 * Creates a new session on success.
 *
 * @throws UnauthorizedError if credentials are invalid.
 */
export async function login(email: string, password: string): Promise<AuthResult> {
  const user = await userRepository.getUserByEmail(email);
  if (!user || !user.passwordHash) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    throw new UnauthorizedError('Invalid email or password');
  }

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
    user: {
      userId: user.userId,
      email: user.email,
      displayName: user.displayName,
    },
    token: rawToken,
    expiresAt,
  };
}

/**
 * Logs out by deleting the session identified by the raw token.
 * Silent no-op if the session does not exist.
 */
export async function logout(rawToken: string): Promise<void> {
  const tokenHash = hashToken(rawToken);
  const session = await sessionRepository.getSessionByTokenHash(tokenHash);
  if (session) {
    await sessionRepository.deleteSession(session.sessionId);
  }
}

/**
 * Validates a raw session token and returns the associated user.
 * Used by auth middleware to authenticate requests.
 *
 * @throws UnauthorizedError if the token is invalid or expired.
 */
export async function validateSession(rawToken: string): Promise<{
  userId: string;
  email: string;
  displayName: string;
}> {
  const tokenHash = hashToken(rawToken);
  const session = await sessionRepository.getSessionByTokenHash(tokenHash);

  if (!session || session.expiresAt < new Date()) {
    throw new UnauthorizedError('Invalid or expired session');
  }

  const user = await userRepository.getUserById(session.userId);
  if (!user) {
    throw new UnauthorizedError('User not found');
  }

  return {
    userId: user.userId,
    email: user.email,
    displayName: user.displayName,
  };
}

/**
 * Initiates a password reset flow. Always returns 200 to prevent email enumeration.
 * If the email exists, creates a reset token and sends an email (stub).
 */
export async function forgotPassword(email: string): Promise<void> {
  const user = await userRepository.getUserByEmail(email);
  if (!user) {
    return; // Silent — no email enumeration
  }

  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

  await passwordResetRepository.createPasswordReset({
    resetId: randomUUID(),
    userId: user.userId,
    tokenHash,
    expiresAt,
  });

  await emailService.sendPasswordResetEmail(user.email, rawToken);
}

/**
 * Resets a user's password using a valid, unused reset token.
 *
 * @throws ValidationError if the token is invalid, expired, or already used.
 */
export async function resetPassword(
  token: string,
  newPassword: string,
): Promise<void> {
  const tokenHash = hashToken(token);
  const reset = await passwordResetRepository.getByTokenHash(tokenHash);

  if (!reset || reset.expiresAt < new Date() || reset.usedAt !== null) {
    throw new ValidationError('Invalid or expired reset token');
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await userRepository.updatePasswordHash(reset.userId, passwordHash);
  await passwordResetRepository.markAsUsed(reset.resetId);
}

/**
 * Verifies a user's email using a valid, unused verification token.
 *
 * @throws ValidationError if the token is invalid, expired, or already used.
 */
export async function verifyEmail(token: string): Promise<void> {
  const tokenHash = hashToken(token);
  const verification = await emailVerificationRepository.getByTokenHash(tokenHash);

  if (!verification || verification.expiresAt < new Date() || verification.usedAt !== null) {
    throw new ValidationError('Invalid or expired verification token');
  }

  await userRepository.markEmailVerified(verification.userId);
  await emailVerificationRepository.markAsUsed(verification.verificationId);
}

/**
 * Creates and sends an email verification token for a newly registered user.
 * Called internally after registration.
 */
export async function sendVerificationEmail(
  userId: string,
  email: string,
): Promise<void> {
  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);

  await emailVerificationRepository.createEmailVerification({
    verificationId: randomUUID(),
    userId,
    tokenHash,
    expiresAt,
  });

  await emailService.sendEmailVerificationEmail(email, rawToken);
}
