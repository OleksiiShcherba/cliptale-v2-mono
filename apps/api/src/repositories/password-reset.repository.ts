import type { RowDataPacket } from 'mysql2/promise';

import { pool } from '@/db/connection.js';

/** Password reset record as stored in the `password_resets` table. */
export type PasswordReset = {
  resetId: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
};

type PasswordResetRow = RowDataPacket & {
  reset_id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  used_at: Date | null;
  created_at: Date;
};

function mapRow(row: PasswordResetRow): PasswordReset {
  return {
    resetId: row.reset_id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    createdAt: row.created_at,
  };
}

/** Inserts a new password reset row. */
export async function createPasswordReset(params: {
  resetId: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}): Promise<void> {
  await pool.execute(
    `INSERT INTO password_resets (reset_id, user_id, token_hash, expires_at)
     VALUES (?, ?, ?, ?)`,
    [params.resetId, params.userId, params.tokenHash, params.expiresAt],
  );
}

/** Returns a password reset by token hash, or null if not found. */
export async function getByTokenHash(tokenHash: string): Promise<PasswordReset | null> {
  const [rows] = await pool.execute<PasswordResetRow[]>(
    'SELECT * FROM password_resets WHERE token_hash = ?',
    [tokenHash],
  );
  return rows.length ? mapRow(rows[0]!) : null;
}

/** Marks a password reset as used. */
export async function markAsUsed(resetId: string): Promise<void> {
  await pool.execute(
    'UPDATE password_resets SET used_at = NOW(3) WHERE reset_id = ?',
    [resetId],
  );
}
