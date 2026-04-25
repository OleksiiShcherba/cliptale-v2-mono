import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';

import { pool } from '@/db/connection.js';

/** Session record as stored in the `sessions` table. */
export type Session = {
  sessionId: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
};

type SessionRow = RowDataPacket & {
  session_id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  created_at: Date;
};

function mapRowToSession(row: SessionRow): Session {
  return {
    sessionId: row.session_id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

/** Parameters for inserting a new session. */
export type CreateSessionParams = {
  sessionId: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
};

/** Inserts a new session row. */
export async function createSession(params: CreateSessionParams): Promise<void> {
  await pool.execute(
    `INSERT INTO sessions (session_id, user_id, token_hash, expires_at)
     VALUES (?, ?, ?, ?)`,
    [params.sessionId, params.userId, params.tokenHash, params.expiresAt],
  );
}

/** Returns a session by its token hash, or null if not found. */
export async function getSessionByTokenHash(tokenHash: string): Promise<Session | null> {
  const [rows] = await pool.execute<SessionRow[]>(
    'SELECT * FROM sessions WHERE token_hash = ?',
    [tokenHash],
  );
  return rows.length ? mapRowToSession(rows[0]!) : null;
}

/** Deletes a single session by its ID. */
export async function deleteSession(sessionId: string): Promise<void> {
  await pool.execute(
    'DELETE FROM sessions WHERE session_id = ?',
    [sessionId],
  );
}

/** Deletes all sessions for a given user. */
export async function deleteAllUserSessions(userId: string): Promise<void> {
  await pool.execute(
    'DELETE FROM sessions WHERE user_id = ?',
    [userId],
  );
}

/** Deletes all expired sessions across all users. */
export async function deleteExpiredSessions(): Promise<number> {
  const [result] = await pool.execute<ResultSetHeader>(
    'DELETE FROM sessions WHERE expires_at < NOW(3)',
  );
  return result.affectedRows;
}
