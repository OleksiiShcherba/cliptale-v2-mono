/**
 * Integration tests for migration 008 — table existence + column schema.
 *
 * Run:  APP_DB_PASSWORD=cliptale vitest run src/__tests__/integration/migration-008.test.ts
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
// Table existence
// ---------------------------------------------------------------------------

describe('migration 008 — table existence', () => {
  const tables = ['users', 'sessions', 'password_resets', 'email_verifications'];

  for (const table of tables) {
    it(`should create the ${table} table`, async () => {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT TABLE_NAME
         FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = ?`,
        [table],
      );
      expect(rows).toHaveLength(1);
    });
  }

  it('should be idempotent — re-running the migration does not throw', async () => {
    await expect(conn.query(readMigrationSql())).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Users table — columns
// ---------------------------------------------------------------------------

describe('migration 008 — users column schema', () => {
  it('should have all required columns with correct types', async () => {
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'users'
       ORDER BY ORDINAL_POSITION`,
    );

    const columns = Object.fromEntries(
      rows.map((r) => [r['COLUMN_NAME'] as string, r]),
    );

    expect(columns['user_id']!['DATA_TYPE']).toBe('char');
    expect(columns['user_id']!['IS_NULLABLE']).toBe('NO');

    expect(columns['email']!['DATA_TYPE']).toBe('varchar');
    expect(columns['email']!['IS_NULLABLE']).toBe('NO');

    expect(columns['display_name']!['DATA_TYPE']).toBe('varchar');
    expect(columns['display_name']!['IS_NULLABLE']).toBe('NO');

    expect(columns['password_hash']!['IS_NULLABLE']).toBe('YES');

    expect(columns['google_id']!['IS_NULLABLE']).toBe('YES');
    expect(columns['github_id']!['IS_NULLABLE']).toBe('YES');

    expect(columns['email_verified']!['DATA_TYPE']).toBe('tinyint');
    expect(columns['email_verified']!['IS_NULLABLE']).toBe('NO');

    expect(columns['created_at']!['DATA_TYPE']).toBe('datetime');
    expect(columns['updated_at']!['DATA_TYPE']).toBe('datetime');
  });
});
