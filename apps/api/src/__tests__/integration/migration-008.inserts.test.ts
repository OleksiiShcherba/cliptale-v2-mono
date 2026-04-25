/**
 * Integration tests for migration 008 — INSERT behaviour for all four tables.
 *
 * Run:  APP_DB_PASSWORD=cliptale vitest run src/__tests__/integration/migration-008.inserts.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
  dbConfig,
  readMigrationSql,
  sha256,
  randomUUID,
  mysql,
  type Connection,
} from './migration-008.fixtures.js';

let conn: Connection;
let testUserId: string;

beforeAll(async () => {
  conn = await mysql.createConnection(dbConfig());
  await conn.query(readMigrationSql());
  testUserId = randomUUID();
});

afterAll(async () => {
  await conn?.query('DELETE FROM email_verifications WHERE user_id = ?', [testUserId]);
  await conn?.query('DELETE FROM password_resets WHERE user_id = ?', [testUserId]);
  await conn?.query('DELETE FROM sessions WHERE user_id = ?', [testUserId]);
  await conn?.query('DELETE FROM users WHERE user_id = ?', [testUserId]);
  await conn?.end();
});

// ---------------------------------------------------------------------------
// Users table — INSERT behaviour
// ---------------------------------------------------------------------------

describe('migration 008 — users INSERT behaviour', () => {
  it('should accept a valid email/password user', async () => {
    await conn.query(
      `INSERT INTO users (user_id, email, display_name, password_hash)
       VALUES (?, ?, ?, ?)`,
      [testUserId, `insert-test-${testUserId}@example.com`, 'Test User', '$2b$12$fakehash'],
    );

    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT * FROM users WHERE user_id = ?',
      [testUserId],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!['display_name']).toBe('Test User');
    expect(rows[0]!['email_verified']).toBe(0);
    expect(rows[0]!['google_id']).toBeNull();
    expect(rows[0]!['github_id']).toBeNull();
    expect(rows[0]!['created_at']).toBeInstanceOf(Date);
  });

  it('should enforce unique email constraint', async () => {
    await expect(
      conn.query(
        `INSERT INTO users (user_id, email, display_name)
         VALUES (?, ?, ?)`,
        [randomUUID(), `insert-test-${testUserId}@example.com`, 'Duplicate'],
      ),
    ).rejects.toThrow();
  });

  it('should allow OAuth-only user without password_hash', async () => {
    const oauthUserId = randomUUID();
    await conn.query(
      `INSERT INTO users (user_id, email, display_name, google_id)
       VALUES (?, ?, ?, ?)`,
      [oauthUserId, `oauth-${oauthUserId}@example.com`, 'OAuth User', 'google-123'],
    );

    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT password_hash, google_id FROM users WHERE user_id = ?',
      [oauthUserId],
    );
    expect(rows[0]!['password_hash']).toBeNull();
    expect(rows[0]!['google_id']).toBe('google-123');

    await conn.query('DELETE FROM users WHERE user_id = ?', [oauthUserId]);
  });
});

// ---------------------------------------------------------------------------
// Sessions table
// ---------------------------------------------------------------------------

describe('migration 008 — sessions INSERT behaviour', () => {
  it('should accept a valid session linked to user', async () => {
    const sessionId = randomUUID();
    const tokenHash = sha256(`session-${sessionId}`);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await conn.query(
      `INSERT INTO sessions (session_id, user_id, token_hash, expires_at)
       VALUES (?, ?, ?, ?)`,
      [sessionId, testUserId, tokenHash, expiresAt],
    );

    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT * FROM sessions WHERE session_id = ?',
      [sessionId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!['user_id']).toBe(testUserId);
    expect(rows[0]!['token_hash']).toBe(tokenHash);
    expect(rows[0]!['expires_at']).toBeInstanceOf(Date);
  });

  it('should enforce unique token_hash', async () => {
    const tokenHash = sha256('sess-duplicate-token');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await conn.query(
      `INSERT INTO sessions (session_id, user_id, token_hash, expires_at)
       VALUES (?, ?, ?, ?)`,
      [randomUUID(), testUserId, tokenHash, expiresAt],
    );

    await expect(
      conn.query(
        `INSERT INTO sessions (session_id, user_id, token_hash, expires_at)
         VALUES (?, ?, ?, ?)`,
        [randomUUID(), testUserId, tokenHash, expiresAt],
      ),
    ).rejects.toThrow();
  });

  it('should cascade delete sessions when user is deleted', async () => {
    const tempUserId = randomUUID();
    await conn.query(
      `INSERT INTO users (user_id, email, display_name) VALUES (?, ?, ?)`,
      [tempUserId, `sess-cascade-${tempUserId}@test.com`, 'Cascade Test'],
    );
    await conn.query(
      `INSERT INTO sessions (session_id, user_id, token_hash, expires_at)
       VALUES (?, ?, ?, ?)`,
      [randomUUID(), tempUserId, sha256(`sess-cascade-${tempUserId}`), new Date(Date.now() + 60000)],
    );

    await conn.query('DELETE FROM users WHERE user_id = ?', [tempUserId]);

    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT * FROM sessions WHERE user_id = ?',
      [tempUserId],
    );
    expect(rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Password resets table
// ---------------------------------------------------------------------------

describe('migration 008 — password_resets INSERT behaviour', () => {
  it('should accept a valid password reset entry', async () => {
    const resetId = randomUUID();
    const tokenHash = sha256(`reset-${resetId}`);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await conn.query(
      `INSERT INTO password_resets (reset_id, user_id, token_hash, expires_at)
       VALUES (?, ?, ?, ?)`,
      [resetId, testUserId, tokenHash, expiresAt],
    );

    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT * FROM password_resets WHERE reset_id = ?',
      [resetId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!['used_at']).toBeNull();
  });

  it('should allow marking a reset token as used', async () => {
    const resetId = randomUUID();
    const tokenHash = sha256(`reset-used-${resetId}`);
    await conn.query(
      `INSERT INTO password_resets (reset_id, user_id, token_hash, expires_at)
       VALUES (?, ?, ?, ?)`,
      [resetId, testUserId, tokenHash, new Date(Date.now() + 60000)],
    );

    await conn.query(
      'UPDATE password_resets SET used_at = NOW(3) WHERE reset_id = ?',
      [resetId],
    );

    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT used_at FROM password_resets WHERE reset_id = ?',
      [resetId],
    );
    expect(rows[0]!['used_at']).toBeInstanceOf(Date);
  });

  it('should enforce unique token_hash', async () => {
    const tokenHash = sha256('pr-duplicate-token');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await conn.query(
      `INSERT INTO password_resets (reset_id, user_id, token_hash, expires_at)
       VALUES (?, ?, ?, ?)`,
      [randomUUID(), testUserId, tokenHash, expiresAt],
    );

    await expect(
      conn.query(
        `INSERT INTO password_resets (reset_id, user_id, token_hash, expires_at)
         VALUES (?, ?, ?, ?)`,
        [randomUUID(), testUserId, tokenHash, expiresAt],
      ),
    ).rejects.toThrow();
  });

  it('should cascade delete resets when user is deleted', async () => {
    const tempUserId = randomUUID();
    await conn.query(
      `INSERT INTO users (user_id, email, display_name) VALUES (?, ?, ?)`,
      [tempUserId, `pr-cascade-${tempUserId}@test.com`, 'PR Cascade Test'],
    );
    await conn.query(
      `INSERT INTO password_resets (reset_id, user_id, token_hash, expires_at)
       VALUES (?, ?, ?, ?)`,
      [randomUUID(), tempUserId, sha256(`pr-cascade-${tempUserId}`), new Date(Date.now() + 60000)],
    );

    await conn.query('DELETE FROM users WHERE user_id = ?', [tempUserId]);

    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT * FROM password_resets WHERE user_id = ?',
      [tempUserId],
    );
    expect(rows).toHaveLength(0);
  });
});

// Email verifications INSERT tests are in migration-008.verifications.test.ts
