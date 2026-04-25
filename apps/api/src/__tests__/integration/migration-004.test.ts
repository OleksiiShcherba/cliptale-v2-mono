/**
 * Integration smoke tests for migration 004 — render_jobs table.
 *
 * Requires a live MySQL instance. Uses APP_DB_* env vars with docker-compose
 * defaults as fallbacks so the test runs out-of-the-box after `docker compose up`.
 *
 * Run:  APP_DB_PASSWORD=cliptale vitest run src/__tests__/integration/migration-004.test.ts
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
  '../../db/migrations/004_render_jobs.sql',
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
let testProjectId: string;
let testVersionId: number;

beforeAll(async () => {
  conn = await mysql.createConnection(dbConfig());

  // Ensure prerequisite migration 003 has run so we have a project and version to reference.
  const migration003Path = resolve(__dirname, '../../db/migrations/003_project_versions.sql');
  const sql003 = readFileSync(migration003Path, 'utf-8');
  await conn.query(sql003);

  // Seed a project row required for foreign-key-style tests (no FK enforced in schema,
  // but we use realistic data).
  testProjectId = randomUUID();
  await conn.query('INSERT INTO projects (project_id) VALUES (?)', [testProjectId]);

  // Seed a version row so version_id references a real row.
  const [versionResult] = await conn.query<mysql.ResultSetHeader>(
    `INSERT INTO project_versions (project_id, doc_json, doc_schema_version)
     VALUES (?, ?, ?)`,
    [testProjectId, JSON.stringify({ title: 'render test' }), 1],
  );
  testVersionId = versionResult.insertId;

  // Run the migration under test.
  const sql = readFileSync(MIGRATION_PATH, 'utf-8');
  await conn.query(sql);
});

afterAll(async () => {
  await conn?.query('DELETE FROM render_jobs WHERE project_id = ?', [testProjectId]);
  await conn?.query('DELETE FROM project_versions WHERE project_id = ?', [testProjectId]);
  await conn?.query('DELETE FROM projects WHERE project_id = ?', [testProjectId]);
  await conn?.end();
});

// ---------------------------------------------------------------------------
// Table existence
// ---------------------------------------------------------------------------

describe('migration 004 — render_jobs table existence', () => {
  it('should create the render_jobs table', async () => {
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT TABLE_NAME
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'render_jobs'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!['TABLE_NAME']).toBe('render_jobs');
  });

  it('should be idempotent — re-running the migration does not throw', async () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf-8');
    await expect(conn.query(sql)).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Column schema
// ---------------------------------------------------------------------------

describe('migration 004 — render_jobs column schema', () => {
  it('should have all required columns with correct types', async () => {
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, CHARACTER_MAXIMUM_LENGTH
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'render_jobs'
       ORDER BY ORDINAL_POSITION`,
    );

    const columns = Object.fromEntries(
      rows.map((r) => [r['COLUMN_NAME'] as string, r]),
    );

    expect(columns['job_id']!['DATA_TYPE']).toBe('char');
    expect(columns['job_id']!['IS_NULLABLE']).toBe('NO');
    expect(columns['job_id']!['CHARACTER_MAXIMUM_LENGTH']).toBe(36);

    expect(columns['project_id']!['DATA_TYPE']).toBe('char');
    expect(columns['project_id']!['IS_NULLABLE']).toBe('NO');
    expect(columns['project_id']!['CHARACTER_MAXIMUM_LENGTH']).toBe(36);

    expect(columns['version_id']!['DATA_TYPE']).toBe('bigint');
    expect(columns['version_id']!['IS_NULLABLE']).toBe('NO');

    expect(columns['requested_by']!['IS_NULLABLE']).toBe('YES');

    expect(columns['status']!['DATA_TYPE']).toBe('enum');
    expect(columns['status']!['IS_NULLABLE']).toBe('NO');

    expect(columns['progress_pct']!['DATA_TYPE']).toBe('tinyint');
    expect(columns['progress_pct']!['IS_NULLABLE']).toBe('NO');

    expect(columns['preset_json']!['DATA_TYPE']).toBe('json');
    expect(columns['preset_json']!['IS_NULLABLE']).toBe('NO');

    expect(columns['output_uri']!['IS_NULLABLE']).toBe('YES');
    expect(columns['error_message']!['IS_NULLABLE']).toBe('YES');

    expect(columns['created_at']!['DATA_TYPE']).toBe('datetime');
    expect(columns['updated_at']!['DATA_TYPE']).toBe('datetime');
  });
});

// ---------------------------------------------------------------------------
// INSERT behaviour
// ---------------------------------------------------------------------------

describe('migration 004 — render_jobs INSERT behaviour', () => {
  it('should accept a valid INSERT with default status = queued and progress_pct = 0', async () => {
    const jobId = randomUUID();
    const preset = { resolution: '1080p', fps: 30, format: 'mp4' };

    await conn.query(
      `INSERT INTO render_jobs (job_id, project_id, version_id, requested_by, preset_json)
       VALUES (?, ?, ?, ?, ?)`,
      [jobId, testProjectId, testVersionId, 'user-test', JSON.stringify(preset)],
    );

    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT * FROM render_jobs WHERE job_id = ?',
      [jobId],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!['status']).toBe('queued');
    expect(rows[0]!['progress_pct']).toBe(0);
    expect(rows[0]!['output_uri']).toBeNull();
    expect(rows[0]!['error_message']).toBeNull();
    expect(rows[0]!['created_at']).toBeInstanceOf(Date);
    expect(rows[0]!['updated_at']).toBeInstanceOf(Date);
  });

  it('should allow updating status to processing and setting progress_pct', async () => {
    const jobId = randomUUID();
    await conn.query(
      `INSERT INTO render_jobs (job_id, project_id, version_id, preset_json)
       VALUES (?, ?, ?, ?)`,
      [jobId, testProjectId, testVersionId, JSON.stringify({ resolution: '720p' })],
    );

    await conn.query(
      `UPDATE render_jobs SET status = 'processing', progress_pct = 50 WHERE job_id = ?`,
      [jobId],
    );

    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT status, progress_pct FROM render_jobs WHERE job_id = ?',
      [jobId],
    );
    expect(rows[0]!['status']).toBe('processing');
    expect(rows[0]!['progress_pct']).toBe(50);
  });

  it('should allow updating status to complete with output_uri', async () => {
    const jobId = randomUUID();
    await conn.query(
      `INSERT INTO render_jobs (job_id, project_id, version_id, preset_json)
       VALUES (?, ?, ?, ?)`,
      [jobId, testProjectId, testVersionId, JSON.stringify({ resolution: '1080p' })],
    );

    await conn.query(
      `UPDATE render_jobs SET status = 'complete', progress_pct = 100, output_uri = 's3://bucket/output.mp4' WHERE job_id = ?`,
      [jobId],
    );

    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT status, progress_pct, output_uri FROM render_jobs WHERE job_id = ?',
      [jobId],
    );
    expect(rows[0]!['status']).toBe('complete');
    expect(rows[0]!['progress_pct']).toBe(100);
    expect(rows[0]!['output_uri']).toBe('s3://bucket/output.mp4');
  });

  it('should allow updating status to failed with error_message', async () => {
    const jobId = randomUUID();
    await conn.query(
      `INSERT INTO render_jobs (job_id, project_id, version_id, preset_json)
       VALUES (?, ?, ?, ?)`,
      [jobId, testProjectId, testVersionId, JSON.stringify({ resolution: '1080p' })],
    );

    await conn.query(
      `UPDATE render_jobs SET status = 'failed', error_message = 'FFmpeg crash' WHERE job_id = ?`,
      [jobId],
    );

    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT status, error_message FROM render_jobs WHERE job_id = ?',
      [jobId],
    );
    expect(rows[0]!['status']).toBe('failed');
    expect(rows[0]!['error_message']).toBe('FFmpeg crash');
  });

  it('should reject an invalid status value', async () => {
    await expect(
      conn.query(
        `INSERT INTO render_jobs (job_id, project_id, version_id, preset_json, status)
         VALUES (?, ?, ?, ?, ?)`,
        [randomUUID(), testProjectId, testVersionId, JSON.stringify({}), 'invalid_status'],
      ),
    ).rejects.toThrow();
  });

  it('should enforce NOT NULL on preset_json', async () => {
    await expect(
      conn.query(
        `INSERT INTO render_jobs (job_id, project_id, version_id, preset_json)
         VALUES (?, ?, ?, NULL)`,
        [randomUUID(), testProjectId, testVersionId],
      ),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

describe('migration 004 — render_jobs indexes', () => {
  it('should have idx_render_jobs_project_id on project_id', async () => {
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT INDEX_NAME, COLUMN_NAME
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'render_jobs'
         AND INDEX_NAME = 'idx_render_jobs_project_id'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!['COLUMN_NAME']).toBe('project_id');
  });

  it('should have idx_render_jobs_project_status on (project_id, status)', async () => {
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT INDEX_NAME, COLUMN_NAME, SEQ_IN_INDEX
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'render_jobs'
         AND INDEX_NAME = 'idx_render_jobs_project_status'
       ORDER BY SEQ_IN_INDEX`,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]!['COLUMN_NAME']).toBe('project_id');
    expect(rows[1]!['COLUMN_NAME']).toBe('status');
  });

  it('should have idx_render_jobs_requested_by on requested_by', async () => {
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT INDEX_NAME, COLUMN_NAME
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'render_jobs'
         AND INDEX_NAME = 'idx_render_jobs_requested_by'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!['COLUMN_NAME']).toBe('requested_by');
  });

  it('should have idx_render_jobs_created_at on created_at', async () => {
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT INDEX_NAME, COLUMN_NAME
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'render_jobs'
         AND INDEX_NAME = 'idx_render_jobs_created_at'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!['COLUMN_NAME']).toBe('created_at');
  });
});
