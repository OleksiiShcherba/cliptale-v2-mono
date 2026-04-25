/**
 * Integration tests for migration 013 — drops ai_provider_configs.
 *
 * Requires a live MySQL instance. Uses APP_DB_* env vars with docker-compose
 * defaults as fallbacks so the test runs out-of-the-box after `docker compose up`.
 *
 * Run:  APP_DB_PASSWORD=cliptale vitest run src/__tests__/integration/migration-013.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
  dbConfig,
  readMigrationSql,
  mysql,
  type Connection,
} from './migration-013.fixtures.js';

let conn: Connection;

const STUB_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS ai_provider_configs (
    config_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    placeholder VARCHAR(16) NULL,
    PRIMARY KEY (config_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

async function tableExists(tableName: string): Promise<boolean> {
  const [rows] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT TABLE_NAME
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?`,
    [tableName],
  );
  return rows.length === 1;
}

beforeAll(async () => {
  conn = await mysql.createConnection(dbConfig());
});

afterAll(async () => {
  await conn?.end();
});

describe('migration 013 — drops ai_provider_configs', () => {
  it('removes the ai_provider_configs table when it exists', async () => {
    // Seed a stub table so the DROP has a target on a fresh test DB.
    await conn.query(STUB_TABLE_SQL);
    expect(await tableExists('ai_provider_configs')).toBe(true);

    await conn.query(readMigrationSql());

    expect(await tableExists('ai_provider_configs')).toBe(false);
  });

  it('is idempotent — re-running the migration does not throw', async () => {
    // Table was already dropped by the previous test; DROP IF EXISTS must
    // still succeed when the target is absent.
    expect(await tableExists('ai_provider_configs')).toBe(false);
    await expect(conn.query(readMigrationSql())).resolves.not.toThrow();
    expect(await tableExists('ai_provider_configs')).toBe(false);
  });
});
