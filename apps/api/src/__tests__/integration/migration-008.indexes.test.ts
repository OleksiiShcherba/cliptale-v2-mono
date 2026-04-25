/**
 * Integration tests for migration 008 — index verification.
 *
 * Run:  APP_DB_PASSWORD=cliptale vitest run src/__tests__/integration/migration-008.indexes.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
  dbConfig,
  readMigrationSql,
  mysql,
  type Connection,
} from './migration-008.fixtures.js';

let conn: Connection;

beforeAll(async () => {
  conn = await mysql.createConnection(dbConfig());
  await conn.query(readMigrationSql());
});

afterAll(async () => {
  await conn?.end();
});

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

describe('migration 008 — indexes', () => {
  it('should have unique index on users.email', async () => {
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT INDEX_NAME, NON_UNIQUE
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'users'
         AND COLUMN_NAME = 'email'
         AND INDEX_NAME = 'idx_users_email'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!['NON_UNIQUE']).toBe(0);
  });

  it('should have index on users.google_id', async () => {
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT INDEX_NAME
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'users'
         AND INDEX_NAME = 'idx_users_google_id'`,
    );
    expect(rows).toHaveLength(1);
  });

  it('should have index on users.github_id', async () => {
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT INDEX_NAME
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'users'
         AND INDEX_NAME = 'idx_users_github_id'`,
    );
    expect(rows).toHaveLength(1);
  });

  it('should have unique index on sessions.token_hash', async () => {
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT INDEX_NAME, NON_UNIQUE
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'sessions'
         AND INDEX_NAME = 'idx_sessions_token_hash'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!['NON_UNIQUE']).toBe(0);
  });

  it('should have index on sessions.expires_at', async () => {
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT INDEX_NAME
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'sessions'
         AND INDEX_NAME = 'idx_sessions_expires_at'`,
    );
    expect(rows).toHaveLength(1);
  });

  it('should have unique index on password_resets.token_hash', async () => {
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT NON_UNIQUE
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'password_resets'
         AND INDEX_NAME = 'idx_password_resets_token_hash'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!['NON_UNIQUE']).toBe(0);
  });

  it('should have unique index on email_verifications.token_hash', async () => {
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT NON_UNIQUE
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'email_verifications'
         AND INDEX_NAME = 'idx_email_verifications_token_hash'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!['NON_UNIQUE']).toBe(0);
  });

  it('should have index on sessions.user_id', async () => {
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT INDEX_NAME
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'sessions'
         AND INDEX_NAME = 'idx_sessions_user_id'`,
    );
    expect(rows).toHaveLength(1);
  });

  it('should have index on password_resets.user_id', async () => {
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT INDEX_NAME
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'password_resets'
         AND INDEX_NAME = 'idx_password_resets_user_id'`,
    );
    expect(rows).toHaveLength(1);
  });

  it('should have index on email_verifications.user_id', async () => {
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT INDEX_NAME
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'email_verifications'
         AND INDEX_NAME = 'idx_email_verifications_user_id'`,
    );
    expect(rows).toHaveLength(1);
  });
});
