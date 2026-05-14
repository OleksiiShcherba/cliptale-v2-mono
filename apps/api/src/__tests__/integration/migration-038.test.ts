/**
 * Integration tests for migration 038 — storyboard_scene_illustration_jobs.
 *
 * Requires a live MySQL instance.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql, { type Connection } from 'mysql2/promise';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = resolve(
  __dirname,
  '../../db/migrations/038_storyboard_scene_illustration_jobs.sql',
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

beforeAll(async () => {
  conn = await mysql.createConnection(dbConfig());
  await conn.query(readFileSync(MIGRATION_PATH, 'utf-8'));
});

afterAll(async () => {
  await conn?.end();
});

async function getColumn(columnName: string): Promise<mysql.RowDataPacket | undefined> {
  const [rows] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_TYPE
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'storyboard_scene_illustration_jobs'
        AND COLUMN_NAME = ?`,
    [columnName],
  );
  return rows[0];
}

async function getForeignKey(deleteRule: string): Promise<string[]> {
  const [rows] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT CONSTRAINT_NAME
       FROM information_schema.REFERENTIAL_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE()
        AND TABLE_NAME = 'storyboard_scene_illustration_jobs'
        AND DELETE_RULE = ?`,
    [deleteRule],
  );
  return rows.map((row) => String(row['CONSTRAINT_NAME']));
}

async function getIndexColumns(indexName: string): Promise<string[]> {
  const [rows] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT COLUMN_NAME
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'storyboard_scene_illustration_jobs'
        AND INDEX_NAME = ?
      ORDER BY SEQ_IN_INDEX ASC`,
    [indexName],
  );
  return rows.map((row) => String(row['COLUMN_NAME']));
}

describe('migration 038 — idempotency', () => {
  it('can be applied more than once', async () => {
    await expect(conn.query(readFileSync(MIGRATION_PATH, 'utf-8'))).resolves.not.toThrow();
  });
});

describe('migration 038 — storyboard_scene_illustration_jobs shape', () => {
  it('creates the required columns', async () => {
    await expect(getColumn('id')).resolves.toBeDefined();
    await expect(getColumn('draft_id')).resolves.toBeDefined();
    await expect(getColumn('block_id')).resolves.toBeDefined();
    await expect(getColumn('ai_job_id')).resolves.toBeDefined();
    await expect(getColumn('status')).resolves.toBeDefined();
    await expect(getColumn('output_file_id')).resolves.toBeDefined();
    await expect(getColumn('error_message')).resolves.toBeDefined();
    await expect(getColumn('created_at')).resolves.toBeDefined();
    await expect(getColumn('updated_at')).resolves.toBeDefined();
  });

  it('uses the UI-facing status vocabulary', async () => {
    const column = await getColumn('status');

    expect(column!['DATA_TYPE']).toBe('enum');
    expect(column!['COLUMN_TYPE']).toContain("'queued'");
    expect(column!['COLUMN_TYPE']).toContain("'running'");
    expect(column!['COLUMN_TYPE']).toContain("'ready'");
    expect(column!['COLUMN_TYPE']).toContain("'failed'");
  });

  it('cascades draft, block, and AI job deletion while keeping output file deletion nullable', async () => {
    await expect(getForeignKey('CASCADE')).resolves.toEqual(
      expect.arrayContaining([
        'fk_storyboard_scene_illustration_draft',
        'fk_storyboard_scene_illustration_block',
        'fk_storyboard_scene_illustration_ai_job',
      ]),
    );
    await expect(getForeignKey('SET NULL')).resolves.toContain(
      'fk_storyboard_scene_illustration_output_file',
    );
  });

  it('creates lookup indexes for draft listing and latest block attempt selection', async () => {
    await expect(
      getIndexColumns('idx_storyboard_scene_illustration_draft_created'),
    ).resolves.toEqual(['draft_id', 'created_at']);
    await expect(
      getIndexColumns('idx_storyboard_scene_illustration_block_created'),
    ).resolves.toEqual(['block_id', 'created_at', 'id']);
    await expect(
      getIndexColumns('uq_storyboard_scene_illustration_ai_job'),
    ).resolves.toEqual(['ai_job_id']);
  });
});
