/**
 * Integration tests for migration 040 — storyboard_illustration_references.
 *
 * Requires a live MySQL instance.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql, { type Connection } from 'mysql2/promise';

import {
  createReferenceMapping,
  findActiveReferenceByDraftId,
  findReferenceByAiJobId,
  setReferenceOutput,
  updateReferenceStatus,
} from '@/repositories/storyboardIllustrationReference.repository.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = resolve(
  __dirname,
  '../../db/migrations/040_storyboard_illustration_references.sql',
);

const USER_ID = '04000000-0000-4000-8000-000000000001';
const DRAFT_A_ID = '04000000-0000-4000-8000-000000000010';
const DRAFT_B_ID = '04000000-0000-4000-8000-000000000011';
const JOB_A_ID = '04000000-0000-4000-8000-000000000020';
const JOB_B_ID = '04000000-0000-4000-8000-000000000021';
const JOB_C_ID = '04000000-0000-4000-8000-000000000022';
const JOB_REPO_A_ID = '04000000-0000-4000-8000-000000000023';
const JOB_REPO_B_ID = '04000000-0000-4000-8000-000000000024';
const FILE_SOURCE_ID = '04000000-0000-4000-8000-000000000030';
const FILE_OUTPUT_ID = '04000000-0000-4000-8000-000000000031';
const FILE_REPO_OUTPUT_ID = '04000000-0000-4000-8000-000000000032';
const REF_A_ID = '04000000-0000-4000-8000-000000000040';
const REF_B_ID = '04000000-0000-4000-8000-000000000041';
const REF_C_ID = '04000000-0000-4000-8000-000000000042';
const REF_REPO_A_ID = '04000000-0000-4000-8000-000000000043';
const REF_REPO_B_ID = '04000000-0000-4000-8000-000000000044';

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
  await cleanupSeedRows();
});

afterAll(async () => {
  await cleanupSeedRows();
  await conn?.end();
});

async function cleanupSeedRows(): Promise<void> {
  if (!conn) return;
  await conn.query(
    `DELETE FROM storyboard_illustration_references
      WHERE id IN (?, ?, ?, ?, ?)
         OR ai_job_id IN (?, ?, ?, ?, ?)`,
    [
      REF_A_ID,
      REF_B_ID,
      REF_C_ID,
      REF_REPO_A_ID,
      REF_REPO_B_ID,
      JOB_A_ID,
      JOB_B_ID,
      JOB_C_ID,
      JOB_REPO_A_ID,
      JOB_REPO_B_ID,
    ],
  );
  await conn.query(
    `DELETE FROM ai_generation_jobs
      WHERE job_id IN (?, ?, ?, ?, ?)`,
    [JOB_A_ID, JOB_B_ID, JOB_C_ID, JOB_REPO_A_ID, JOB_REPO_B_ID],
  );
  await conn.query(
    `DELETE FROM files
      WHERE file_id IN (?, ?, ?)`,
    [FILE_SOURCE_ID, FILE_OUTPUT_ID, FILE_REPO_OUTPUT_ID],
  );
  await conn.query(
    `DELETE FROM generation_drafts
      WHERE id IN (?, ?)`,
    [DRAFT_A_ID, DRAFT_B_ID],
  );
  await conn.query('DELETE FROM users WHERE user_id = ?', [USER_ID]);
}

async function seedUserDraftsJobsAndFiles(): Promise<void> {
  await conn.query(
    `INSERT INTO users (user_id, email, display_name, email_verified)
     VALUES (?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE email = VALUES(email)`,
    [USER_ID, 'migration-040@example.com', 'Migration 040 User'],
  );
  await conn.query(
    `INSERT INTO generation_drafts (id, user_id, prompt_doc, status)
     VALUES
       (?, ?, JSON_OBJECT('schemaVersion', 1, 'blocks', JSON_ARRAY()), 'draft'),
       (?, ?, JSON_OBJECT('schemaVersion', 1, 'blocks', JSON_ARRAY()), 'draft')
     ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`,
    [DRAFT_A_ID, USER_ID, DRAFT_B_ID, USER_ID],
  );
  await conn.query(
    `INSERT INTO ai_generation_jobs
       (job_id, user_id, model_id, capability, prompt, options, status, draft_id)
     VALUES
       (?, ?, 'gpt-image-2', 'text_to_image', 'style reference A', NULL, 'queued', ?),
       (?, ?, 'gpt-image-2', 'text_to_image', 'style reference B', NULL, 'queued', ?),
       (?, ?, 'gpt-image-2', 'text_to_image', 'style reference C', NULL, 'queued', ?),
       (?, ?, 'gpt-image-2', 'text_to_image', 'style reference repo A', NULL, 'queued', ?),
       (?, ?, 'gpt-image-2', 'text_to_image', 'style reference repo B', NULL, 'queued', ?)`,
    [
      JOB_A_ID,
      USER_ID,
      DRAFT_A_ID,
      JOB_B_ID,
      USER_ID,
      DRAFT_A_ID,
      JOB_C_ID,
      USER_ID,
      DRAFT_B_ID,
      JOB_REPO_A_ID,
      USER_ID,
      DRAFT_B_ID,
      JOB_REPO_B_ID,
      USER_ID,
      DRAFT_B_ID,
    ],
  );
  await conn.query(
    `INSERT INTO files (file_id, user_id, kind, storage_uri, mime_type, display_name, status)
     VALUES
       (?, ?, 'image', 's3://cliptale-test/source-reference.png', 'image/png', 'source-reference.png', 'ready'),
       (?, ?, 'image', 's3://cliptale-test/output-reference.png', 'image/png', 'output-reference.png', 'ready'),
       (?, ?, 'image', 's3://cliptale-test/repo-output-reference.png', 'image/png', 'repo-output-reference.png', 'ready')`,
    [
      FILE_SOURCE_ID,
      USER_ID,
      FILE_OUTPUT_ID,
      USER_ID,
      FILE_REPO_OUTPUT_ID,
      USER_ID,
    ],
  );
}

async function getColumn(columnName: string): Promise<mysql.RowDataPacket | undefined> {
  const [rows] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_TYPE
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'storyboard_illustration_references'
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
        AND TABLE_NAME = 'storyboard_illustration_references'
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
        AND TABLE_NAME = 'storyboard_illustration_references'
        AND INDEX_NAME = ?
      ORDER BY SEQ_IN_INDEX ASC`,
    [indexName],
  );
  return rows.map((row) => String(row['COLUMN_NAME']));
}

describe('migration 040 — idempotency', () => {
  it('can be applied more than once', async () => {
    await expect(conn.query(readFileSync(MIGRATION_PATH, 'utf-8'))).resolves.not.toThrow();
  });
});

describe('migration 040 — storyboard_illustration_references shape', () => {
  it('creates the required columns', async () => {
    await expect(getColumn('id')).resolves.toBeDefined();
    await expect(getColumn('draft_id')).resolves.toBeDefined();
    await expect(getColumn('ai_job_id')).resolves.toBeDefined();
    await expect(getColumn('status')).resolves.toBeDefined();
    await expect(getColumn('output_file_id')).resolves.toBeDefined();
    await expect(getColumn('source_reference_file_ids')).resolves.toBeDefined();
    await expect(getColumn('error_message')).resolves.toBeDefined();
    await expect(getColumn('active_lock')).resolves.toBeDefined();
    await expect(getColumn('created_at')).resolves.toBeDefined();
    await expect(getColumn('updated_at')).resolves.toBeDefined();
  });

  it('uses the UI-facing status vocabulary and JSON source references', async () => {
    const statusColumn = await getColumn('status');
    const sourceColumn = await getColumn('source_reference_file_ids');

    expect(statusColumn!['DATA_TYPE']).toBe('enum');
    expect(statusColumn!['COLUMN_TYPE']).toContain("'queued'");
    expect(statusColumn!['COLUMN_TYPE']).toContain("'running'");
    expect(statusColumn!['COLUMN_TYPE']).toContain("'ready'");
    expect(statusColumn!['COLUMN_TYPE']).toContain("'failed'");
    expect(sourceColumn!['DATA_TYPE']).toBe('json');
    expect(sourceColumn!['IS_NULLABLE']).toBe('NO');
  });

  it('cascades draft and AI job deletion while keeping output file deletion nullable', async () => {
    await expect(getForeignKey('CASCADE')).resolves.toEqual(
      expect.arrayContaining([
        'fk_storyboard_illustration_reference_draft',
        'fk_storyboard_illustration_reference_ai_job',
      ]),
    );
    await expect(getForeignKey('SET NULL')).resolves.toContain(
      'fk_storyboard_illustration_reference_output_file',
    );
  });

  it('creates lookup and active-draft guard indexes', async () => {
    await expect(
      getIndexColumns('idx_storyboard_illustration_reference_draft_created'),
    ).resolves.toEqual(['draft_id', 'created_at']);
    await expect(
      getIndexColumns('uq_storyboard_illustration_reference_ai_job'),
    ).resolves.toEqual(['ai_job_id']);
    await expect(
      getIndexColumns('uq_storyboard_illustration_reference_active_draft'),
    ).resolves.toEqual(['draft_id', 'active_lock']);
  });
});

describe('migration 040 — live data behavior', () => {
  it('enforces active reference uniqueness, retry after failure, AI-job uniqueness, and FK actions', async () => {
    await cleanupSeedRows();
    await seedUserDraftsJobsAndFiles();

    await conn.query(
      `INSERT INTO storyboard_illustration_references
         (id, draft_id, ai_job_id, status, source_reference_file_ids, active_lock)
       VALUES (?, ?, ?, 'queued', JSON_ARRAY(?), 1)`,
      [REF_A_ID, DRAFT_A_ID, JOB_A_ID, FILE_SOURCE_ID],
    );

    await expect(
      conn.query(
        `INSERT INTO storyboard_illustration_references
           (id, draft_id, ai_job_id, status, source_reference_file_ids, active_lock)
         VALUES (?, ?, ?, 'queued', JSON_ARRAY(), 1)`,
        [REF_B_ID, DRAFT_A_ID, JOB_B_ID],
      ),
    ).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });

    await conn.query(
      `UPDATE storyboard_illustration_references
          SET status = 'failed', active_lock = NULL
        WHERE id = ?`,
      [REF_A_ID],
    );
    await expect(
      conn.query(
        `INSERT INTO storyboard_illustration_references
           (id, draft_id, ai_job_id, status, source_reference_file_ids, active_lock)
         VALUES (?, ?, ?, 'queued', JSON_ARRAY(), 1)`,
        [REF_B_ID, DRAFT_A_ID, JOB_B_ID],
      ),
    ).resolves.not.toThrow();

    await expect(
      conn.query(
        `INSERT INTO storyboard_illustration_references
           (id, draft_id, ai_job_id, status, source_reference_file_ids, active_lock)
         VALUES (?, ?, ?, 'failed', JSON_ARRAY(), NULL)`,
        [REF_C_ID, DRAFT_B_ID, JOB_B_ID],
      ),
    ).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });

    await conn.query(
      `UPDATE storyboard_illustration_references
          SET output_file_id = ?
        WHERE id = ?`,
      [FILE_OUTPUT_ID, REF_B_ID],
    );
    await conn.query('DELETE FROM files WHERE file_id = ?', [FILE_OUTPUT_ID]);
    const [fileRows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT output_file_id FROM storyboard_illustration_references WHERE id = ?',
      [REF_B_ID],
    );
    expect(fileRows[0]!['output_file_id']).toBeNull();

    await conn.query('DELETE FROM generation_drafts WHERE id = ?', [DRAFT_A_ID]);
    const [draftRows] = await conn.query<mysql.RowDataPacket[]>(
      'SELECT COUNT(*) AS count FROM storyboard_illustration_references WHERE draft_id = ?',
      [DRAFT_A_ID],
    );
    expect(Number(draftRows[0]!['count'])).toBe(0);
  });

  it('exercises repository lifecycle methods against the live table', async () => {
    await cleanupSeedRows();
    await seedUserDraftsJobsAndFiles();

    await expect(
      createReferenceMapping({
        id: REF_REPO_A_ID,
        draftId: DRAFT_B_ID,
        aiJobId: JOB_REPO_A_ID,
        sourceReferenceFileIds: [FILE_SOURCE_ID],
      }),
    ).resolves.toBe(true);
    await expect(
      createReferenceMapping({
        id: REF_REPO_B_ID,
        draftId: DRAFT_B_ID,
        aiJobId: JOB_REPO_B_ID,
        sourceReferenceFileIds: [],
      }),
    ).resolves.toBe(false);

    const queued = await findReferenceByAiJobId(JOB_REPO_A_ID);
    expect(queued).toMatchObject({
      id: REF_REPO_A_ID,
      draftId: DRAFT_B_ID,
      status: 'queued',
      sourceReferenceFileIds: [FILE_SOURCE_ID],
    });

    await updateReferenceStatus({
      aiJobId: JOB_REPO_A_ID,
      status: 'failed',
      errorMessage: 'Reference generation failed.',
    });
    const failed = await findReferenceByAiJobId(JOB_REPO_A_ID);
    expect(failed).toMatchObject({
      status: 'failed',
      errorMessage: 'Reference generation failed.',
    });

    await expect(
      createReferenceMapping({
        id: REF_REPO_B_ID,
        draftId: DRAFT_B_ID,
        aiJobId: JOB_REPO_B_ID,
        sourceReferenceFileIds: [],
      }),
    ).resolves.toBe(true);
    await setReferenceOutput({
      aiJobId: JOB_REPO_B_ID,
      outputFileId: FILE_REPO_OUTPUT_ID,
    });

    const active = await findActiveReferenceByDraftId(DRAFT_B_ID);
    expect(active).toMatchObject({
      id: REF_REPO_B_ID,
      status: 'ready',
      outputFileId: FILE_REPO_OUTPUT_ID,
    });
  });
});
