import type { RowDataPacket } from 'mysql2/promise';

import { pool } from '@/db/connection.js';

/** Email verification record as stored in the `email_verifications` table. */
export type EmailVerification = {
  verificationId: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
};

type EmailVerificationRow = RowDataPacket & {
  verification_id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  used_at: Date | null;
  created_at: Date;
};

function mapRow(row: EmailVerificationRow): EmailVerification {
  return {
    verificationId: row.verification_id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    createdAt: row.created_at,
  };
}

/** Inserts a new email verification row. */
export async function createEmailVerification(params: {
  verificationId: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}): Promise<void> {
  await pool.execute(
    `INSERT INTO email_verifications (verification_id, user_id, token_hash, expires_at)
     VALUES (?, ?, ?, ?)`,
    [params.verificationId, params.userId, params.tokenHash, params.expiresAt],
  );
}

/** Returns an email verification by token hash, or null if not found. */
export async function getByTokenHash(tokenHash: string): Promise<EmailVerification | null> {
  const [rows] = await pool.execute<EmailVerificationRow[]>(
    'SELECT * FROM email_verifications WHERE token_hash = ?',
    [tokenHash],
  );
  return rows.length ? mapRow(rows[0]!) : null;
}

/** Marks an email verification as used. */
export async function markAsUsed(verificationId: string): Promise<void> {
  await pool.execute(
    'UPDATE email_verifications SET used_at = NOW(3) WHERE verification_id = ?',
    [verificationId],
  );
}
