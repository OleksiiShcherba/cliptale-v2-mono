import type { RowDataPacket } from 'mysql2/promise';

import { pool } from '@/db/connection.js';

/** User record as stored in the `users` table. */
export type User = {
  userId: string;
  email: string;
  displayName: string;
  passwordHash: string | null;
  googleId: string | null;
  githubId: string | null;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type UserRow = RowDataPacket & {
  user_id: string;
  email: string;
  display_name: string;
  password_hash: string | null;
  google_id: string | null;
  github_id: string | null;
  email_verified: number;
  created_at: Date;
  updated_at: Date;
};

function mapRowToUser(row: UserRow): User {
  return {
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    passwordHash: row.password_hash,
    googleId: row.google_id,
    githubId: row.github_id,
    emailVerified: row.email_verified === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Parameters for inserting a new user. */
export type CreateUserParams = {
  userId: string;
  email: string;
  displayName: string;
  passwordHash?: string | null;
  googleId?: string | null;
  githubId?: string | null;
};

/** Inserts a new user row. */
export async function createUser(params: CreateUserParams): Promise<void> {
  await pool.execute(
    `INSERT INTO users (user_id, email, display_name, password_hash, google_id, github_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      params.userId,
      params.email,
      params.displayName,
      params.passwordHash ?? null,
      params.googleId ?? null,
      params.githubId ?? null,
    ],
  );
}

/** Returns a user by primary key, or null if not found. */
export async function getUserById(userId: string): Promise<User | null> {
  const [rows] = await pool.execute<UserRow[]>(
    'SELECT * FROM users WHERE user_id = ?',
    [userId],
  );
  return rows.length ? mapRowToUser(rows[0]!) : null;
}

/** Returns a user by email address, or null if not found. */
export async function getUserByEmail(email: string): Promise<User | null> {
  const [rows] = await pool.execute<UserRow[]>(
    'SELECT * FROM users WHERE email = ?',
    [email],
  );
  return rows.length ? mapRowToUser(rows[0]!) : null;
}

/** Returns a user by Google OAuth ID, or null if not found. */
export async function getUserByGoogleId(googleId: string): Promise<User | null> {
  const [rows] = await pool.execute<UserRow[]>(
    'SELECT * FROM users WHERE google_id = ?',
    [googleId],
  );
  return rows.length ? mapRowToUser(rows[0]!) : null;
}

/** Returns a user by GitHub OAuth ID, or null if not found. */
export async function getUserByGithubId(githubId: string): Promise<User | null> {
  const [rows] = await pool.execute<UserRow[]>(
    'SELECT * FROM users WHERE github_id = ?',
    [githubId],
  );
  return rows.length ? mapRowToUser(rows[0]!) : null;
}

/** Links a Google OAuth ID to an existing user. */
export async function linkGoogleId(userId: string, googleId: string): Promise<void> {
  await pool.execute(
    'UPDATE users SET google_id = ? WHERE user_id = ?',
    [googleId, userId],
  );
}

/** Links a GitHub OAuth ID to an existing user. */
export async function linkGithubId(userId: string, githubId: string): Promise<void> {
  await pool.execute(
    'UPDATE users SET github_id = ? WHERE user_id = ?',
    [githubId, userId],
  );
}

/** Updates the password hash for an existing user. */
export async function updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
  await pool.execute(
    'UPDATE users SET password_hash = ? WHERE user_id = ?',
    [passwordHash, userId],
  );
}

/** Marks a user's email as verified. */
export async function markEmailVerified(userId: string): Promise<void> {
  await pool.execute(
    'UPDATE users SET email_verified = 1 WHERE user_id = ?',
    [userId],
  );
}
