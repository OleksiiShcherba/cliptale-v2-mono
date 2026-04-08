/**
 * Integration tests for migration 008 — email_verifications INSERT behaviour.
 *
 * Run:  APP_DB_PASSWORD=cliptale vitest run src/__tests__/integration/migration-008.verifications.test.ts
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
  await conn.query(
    `INSERT INTO users (user_id, email, display_name, password_hash)
     VALUES (?, ?, ?, ?)`,
    [testUserId, `ev-test-${testUserId}@example.com`, 'EV Test User', '$2b$12$fakehash'],
  );
});

afterAll(async () => {
  await conn?.query('DELETE FROM email_verifications WHERE user_id = ?', [testUserId]);
  await conn?.query('DELETE FROM users WHERE user_id = ?', [testUserId]);
  await conn?.end();
});

describe('migration 008 — email_verifications INSERT behaviour', () => {
  it('should accept a valid email verification entry', async () => {
    const verificationId = randomUUID();
    const tokenHash = sha256(`verify-${verificationId}`);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await conn.query(
      `INSERT INTO email_verifications (verification_id, user_id, token_hash, expires_at)
       VALUES (?, ?, ?, ?)`,
      [verificationId, testUserId, tokenHash, expiresAt],
    );

    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT * FROM email_verifications WHERE verification_id = ?',
      [verificationId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!['used_at']).toBeNull();
  });

  it('should cascade delete verifications when user is deleted', async () => {
    const tempUserId = randomUUID();
    await conn.query(
      `INSERT INTO users (user_id, email, display_name) VALUES (?, ?, ?)`,
      [tempUserId, `ev-cascade-${tempUserId}@test.com`, 'EV Cascade'],
    );
    await conn.query(
      `INSERT INTO email_verifications (verification_id, user_id, token_hash, expires_at)
       VALUES (?, ?, ?, ?)`,
      [randomUUID(), tempUserId, sha256(`ev-cascade-${tempUserId}`), new Date(Date.now() + 60000)],
    );

    await conn.query('DELETE FROM users WHERE user_id = ?', [tempUserId]);

    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT * FROM email_verifications WHERE user_id = ?',
      [tempUserId],
    );
    expect(rows).toHaveLength(0);
  });

  it('should allow marking a verification token as used', async () => {
    const verificationId = randomUUID();
    const tokenHash = sha256(`verify-used-${verificationId}`);
    await conn.query(
      `INSERT INTO email_verifications (verification_id, user_id, token_hash, expires_at)
       VALUES (?, ?, ?, ?)`,
      [verificationId, testUserId, tokenHash, new Date(Date.now() + 60000)],
    );

    await conn.query(
      'UPDATE email_verifications SET used_at = NOW(3) WHERE verification_id = ?',
      [verificationId],
    );

    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT used_at FROM email_verifications WHERE verification_id = ?',
      [verificationId],
    );
    expect(rows[0]!['used_at']).toBeInstanceOf(Date);
  });

  it('should enforce unique token_hash', async () => {
    const tokenHash = sha256('ev-duplicate-token');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await conn.query(
      `INSERT INTO email_verifications (verification_id, user_id, token_hash, expires_at)
       VALUES (?, ?, ?, ?)`,
      [randomUUID(), testUserId, tokenHash, expiresAt],
    );

    await expect(
      conn.query(
        `INSERT INTO email_verifications (verification_id, user_id, token_hash, expires_at)
         VALUES (?, ?, ?, ?)`,
        [randomUUID(), testUserId, tokenHash, expiresAt],
      ),
    ).rejects.toThrow();
  });
});
