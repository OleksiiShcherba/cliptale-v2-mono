/**
 * Integration tests for migration 028 — user_project_ui_state table.
 *
 * Verifies:
 *   - The table exists after the migration runs.
 *   - All required columns are present with the correct data types and
 *     nullability.
 *   - The composite PRIMARY KEY (user_id, project_id) is defined.
 *   - FK constraints to users and projects are present.
 *   - The migration is idempotent (safe to run twice).
 *
 * Requires a live MySQL instance. Uses APP_DB_* env vars with docker-compose
 * defaults as fallbacks so the test runs out-of-the-box after `docker compose up`.
 *
 * Run:
 *   APP_DB_PASSWORD=cliptale vitest run src/__tests__/integration/migration-028.test.ts
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql, { type Connection } from 'mysql2/promise';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MIGRATION_PATH = resolve(
  __dirname,
  '../../db/migrations/028_user_project_ui_state.sql',
);

function dbConfig() {
  return {
    host: process.env['APP_DB_HOST'] ?? 'localhost',
    port: Number(process.env['APP_DB_PORT'] ?? 3306),
    database: process.env['APP_DB_NAME'] ?? 'cliptale',
    user: process.env['APP_DB_USER'] ?? 'cliptale',
    password: process.env['APP_DB_PASSWORD'] ?? 'cliptale',
    multipleStatements: true,
  };
}

let conn: Connection;

/** Seed IDs inserted for FK resolution; cleaned up in afterAll. */
const seedUserId = randomUUID();
const seedProjectId = randomUUID();

beforeAll(async () => {
  conn = await mysql.createConnection(dbConfig());

  // Apply the migration (idempotent — safe to run on an existing DB).
  const sql = readFileSync(MIGRATION_PATH, 'utf-8');
  await conn.query(sql);

  // Insert minimal seed rows so FK tests can insert into user_project_ui_state.
  await conn.query(
    `INSERT IGNORE INTO users (user_id, email, display_name)
     VALUES (?, ?, ?)`,
    [seedUserId, `mig028-${seedUserId}@test.local`, 'Migration028 User'],
  );
  await conn.query(
    `INSERT IGNORE INTO projects (project_id) VALUES (?)`,
    [seedProjectId],
  );
});

afterAll(async () => {
  // Remove seed data — FK CASCADE handles user_project_ui_state rows.
  await conn.query(`DELETE FROM user_project_ui_state WHERE user_id = ?`, [seedUserId]);
  await conn.query(`DELETE FROM projects WHERE project_id = ?`, [seedProjectId]);
  await conn.query(`DELETE FROM users WHERE user_id = ?`, [seedUserId]);
  await conn?.end();
});

// ---------------------------------------------------------------------------
// Table existence
// ---------------------------------------------------------------------------

describe('migration 028 — table existence', () => {
  it('should create the user_project_ui_state table', async () => {
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT TABLE_NAME
         FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'user_project_ui_state'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!['TABLE_NAME']).toBe('user_project_ui_state');
  });

  it('should be idempotent — re-running the migration does not throw', async () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf-8');
    await expect(conn.query(sql)).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Column schema
// ---------------------------------------------------------------------------

describe('migration 028 — column schema', () => {
  it('should have all required columns with correct types and nullability', async () => {
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_KEY
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'user_project_ui_state'
        ORDER BY ORDINAL_POSITION`,
    );

    const columns = Object.fromEntries(
      rows.map((r) => [r['COLUMN_NAME'] as string, r]),
    );

    // user_id — part of PK
    expect(columns['user_id']!['DATA_TYPE']).toBe('char');
    expect(columns['user_id']!['IS_NULLABLE']).toBe('NO');
    expect(columns['user_id']!['COLUMN_KEY']).toBe('PRI');

    // project_id — part of PK
    expect(columns['project_id']!['DATA_TYPE']).toBe('char');
    expect(columns['project_id']!['IS_NULLABLE']).toBe('NO');

    // state_json — opaque JSON blob
    expect(columns['state_json']!['DATA_TYPE']).toBe('json');
    expect(columns['state_json']!['IS_NULLABLE']).toBe('NO');

    // updated_at — auto-maintained timestamp
    expect(columns['updated_at']!['DATA_TYPE']).toBe('datetime');
    expect(columns['updated_at']!['IS_NULLABLE']).toBe('NO');
  });
});

// ---------------------------------------------------------------------------
// Primary key
// ---------------------------------------------------------------------------

describe('migration 028 — primary key', () => {
  it('should have a composite PRIMARY KEY on (user_id, project_id)', async () => {
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT COLUMN_NAME, SEQ_IN_INDEX
         FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'user_project_ui_state'
          AND INDEX_NAME   = 'PRIMARY'
        ORDER BY SEQ_IN_INDEX`,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]!['COLUMN_NAME']).toBe('user_id');
    expect(rows[1]!['COLUMN_NAME']).toBe('project_id');
  });
});

// ---------------------------------------------------------------------------
// Foreign keys
// ---------------------------------------------------------------------------

describe('migration 028 — foreign keys', () => {
  it('should have FK from user_id to users(user_id) with CASCADE delete', async () => {
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT CONSTRAINT_NAME, DELETE_RULE
         FROM information_schema.REFERENTIAL_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = DATABASE()
          AND CONSTRAINT_NAME   = 'fk_upuis_user'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!['DELETE_RULE']).toBe('CASCADE');
  });

  it('should have FK from project_id to projects(project_id) with CASCADE delete', async () => {
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT CONSTRAINT_NAME, DELETE_RULE
         FROM information_schema.REFERENTIAL_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = DATABASE()
          AND CONSTRAINT_NAME   = 'fk_upuis_project'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!['DELETE_RULE']).toBe('CASCADE');
  });
});

// ---------------------------------------------------------------------------
// INSERT behaviour
// ---------------------------------------------------------------------------

describe('migration 028 — INSERT behaviour', () => {
  afterAll(async () => {
    await conn.query(
      `DELETE FROM user_project_ui_state WHERE user_id = ?`,
      [seedUserId],
    );
  });

  it('should accept a valid INSERT with a JSON state blob', async () => {
    const state = { zoom: 1.5, scrollX: 200, playheadFrame: 42 };
    await expect(
      conn.query(
        `INSERT INTO user_project_ui_state (user_id, project_id, state_json)
         VALUES (?, ?, ?)`,
        [seedUserId, seedProjectId, JSON.stringify(state)],
      ),
    ).resolves.not.toThrow();

    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT state_json FROM user_project_ui_state
        WHERE user_id = ? AND project_id = ?`,
      [seedUserId, seedProjectId],
    );
    expect(rows).toHaveLength(1);
    // mysql2 parses JSON columns automatically.
    const returned = rows[0]!['state_json'] as typeof state;
    expect(returned.zoom).toBe(1.5);
    expect(returned.playheadFrame).toBe(42);
  });

  it('should reject an INSERT that violates the user_id FK', async () => {
    await expect(
      conn.query(
        `INSERT INTO user_project_ui_state (user_id, project_id, state_json)
         VALUES (?, ?, ?)`,
        [randomUUID(), seedProjectId, JSON.stringify({})],
      ),
    ).rejects.toThrow();
  });

  it('should reject an INSERT that violates the project_id FK', async () => {
    await expect(
      conn.query(
        `INSERT INTO user_project_ui_state (user_id, project_id, state_json)
         VALUES (?, ?, ?)`,
        [seedUserId, randomUUID(), JSON.stringify({})],
      ),
    ).rejects.toThrow();
  });
});
