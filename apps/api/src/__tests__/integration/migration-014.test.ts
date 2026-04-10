/**
 * Integration tests for migration 014 — ai_generation_jobs fal.ai reshape.
 *
 * Verifies that running migration 014 on a table built from migrations 010+012
 * drops the legacy `provider` and `type` columns, adds `model_id` and
 * `capability`, preserves all other columns + foreign keys + indexes, and is
 * safe to re-run.
 *
 * Requires a live MySQL instance. Uses APP_DB_* env vars with docker-compose
 * defaults as fallbacks.
 *
 * Run:  APP_DB_PASSWORD=cliptale vitest run src/__tests__/integration/migration-014.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
  dbConfig,
  readSql,
  MIGRATION_010_PATH,
  MIGRATION_012_PATH,
  MIGRATION_014_PATH,
  mysql,
  type Connection,
} from './migration-014.fixtures.js';

let conn: Connection;

type ColumnRow = {
  COLUMN_NAME: string;
  DATA_TYPE: string;
  IS_NULLABLE: string;
  COLUMN_TYPE: string;
  CHARACTER_MAXIMUM_LENGTH: number | null;
};

async function getColumns(): Promise<Record<string, ColumnRow>> {
  const [rows] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_TYPE, CHARACTER_MAXIMUM_LENGTH
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'ai_generation_jobs'
      ORDER BY ORDINAL_POSITION`,
  );
  return Object.fromEntries(
    rows.map((r) => [r['COLUMN_NAME'] as string, r as unknown as ColumnRow]),
  );
}

async function getIndexNames(): Promise<string[]> {
  const [rows] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT DISTINCT INDEX_NAME
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'ai_generation_jobs'`,
  );
  return rows.map((r) => r['INDEX_NAME'] as string);
}

async function getForeignKeyNames(): Promise<string[]> {
  const [rows] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT CONSTRAINT_NAME
       FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'ai_generation_jobs'
        AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
  );
  return rows.map((r) => r['CONSTRAINT_NAME'] as string);
}

beforeAll(async () => {
  conn = await mysql.createConnection(dbConfig());

  // Rebuild the legacy shape first so the reshape has the expected starting
  // state regardless of whatever state the test DB is currently in.
  await conn.query('DROP TABLE IF EXISTS ai_generation_jobs');
  await conn.query(readSql(MIGRATION_010_PATH));
  await conn.query(readSql(MIGRATION_012_PATH));

  // Apply the reshape under test.
  await conn.query(readSql(MIGRATION_014_PATH));
});

afterAll(async () => {
  await conn?.end();
});

describe('migration 014 — column additions', () => {
  it('adds model_id as VARCHAR(128) NOT NULL', async () => {
    const columns = await getColumns();
    const col = columns['model_id'];
    expect(col).toBeDefined();
    expect(col!.DATA_TYPE).toBe('varchar');
    expect(col!.CHARACTER_MAXIMUM_LENGTH).toBe(128);
    expect(col!.IS_NULLABLE).toBe('NO');
  });

  it('adds capability as ENUM NOT NULL with the four fal.ai capability values', async () => {
    const columns = await getColumns();
    const col = columns['capability'];
    expect(col).toBeDefined();
    expect(col!.DATA_TYPE).toBe('enum');
    expect(col!.IS_NULLABLE).toBe('NO');

    const allowedValues = col!.COLUMN_TYPE
      .replace(/^enum\(/, '')
      .replace(/\)$/, '')
      .split(',')
      .map((v) => v.trim().replace(/^'|'$/g, ''))
      .sort();

    expect(allowedValues).toEqual(
      ['image_edit', 'image_to_video', 'text_to_image', 'text_to_video'],
    );
  });
});

describe('migration 014 — column removals', () => {
  it('drops the legacy provider column', async () => {
    const columns = await getColumns();
    expect(columns['provider']).toBeUndefined();
  });

  it('drops the legacy type column', async () => {
    const columns = await getColumns();
    expect(columns['type']).toBeUndefined();
  });
});

describe('migration 014 — preserved columns', () => {
  const preserved: Array<[string, string, string]> = [
    // [column, expected DATA_TYPE, expected IS_NULLABLE]
    ['job_id', 'varchar', 'NO'],
    ['user_id', 'char', 'NO'],
    ['project_id', 'char', 'NO'],
    ['prompt', 'text', 'NO'],
    ['options', 'json', 'YES'],
    ['status', 'enum', 'NO'],
    ['progress', 'tinyint', 'NO'],
    ['result_asset_id', 'char', 'YES'],
    ['result_url', 'varchar', 'YES'],
    ['error_message', 'text', 'YES'],
    ['created_at', 'datetime', 'NO'],
    ['updated_at', 'datetime', 'NO'],
  ];

  for (const [name, dataType, nullable] of preserved) {
    it(`preserves ${name} as ${dataType} (nullable=${nullable})`, async () => {
      const columns = await getColumns();
      const col = columns[name];
      expect(col).toBeDefined();
      expect(col!.DATA_TYPE).toBe(dataType);
      expect(col!.IS_NULLABLE).toBe(nullable);
    });
  }
});

describe('migration 014 — indexes and foreign keys', () => {
  it('retains the original indexes and adds the model_capability composite index', async () => {
    const indexes = await getIndexNames();
    expect(indexes).toContain('PRIMARY');
    expect(indexes).toContain('idx_ai_generation_jobs_user_status');
    expect(indexes).toContain('idx_ai_generation_jobs_project_id');
    expect(indexes).toContain('idx_ai_generation_jobs_model_capability');
  });

  it('retains all three foreign key constraints from migration 010', async () => {
    const fks = await getForeignKeyNames();
    expect(fks).toContain('fk_ai_generation_jobs_user');
    expect(fks).toContain('fk_ai_generation_jobs_project');
    expect(fks).toContain('fk_ai_generation_jobs_asset');
  });
});

describe('migration 014 — idempotency', () => {
  it('is safe to re-run without throwing', async () => {
    await expect(conn.query(readSql(MIGRATION_014_PATH))).resolves.not.toThrow();
  });

  it('still has the expected shape after a second run', async () => {
    await conn.query(readSql(MIGRATION_014_PATH));
    const columns = await getColumns();
    expect(columns['model_id']).toBeDefined();
    expect(columns['capability']).toBeDefined();
    expect(columns['provider']).toBeUndefined();
    expect(columns['type']).toBeUndefined();
  });
});
