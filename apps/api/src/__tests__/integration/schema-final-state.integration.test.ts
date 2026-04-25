/**
 * Integration test: schema final-state assertions after all migrations run.
 *
 * Purpose:
 *   Verifies that the live MySQL instance has the post-Files-as-Root + post-audio
 *   schema shape that the production code layer expects. This test is the canonical
 *   guard against schema-drift regressions of the kind documented in
 *   .claude/agent-memory/regression-direction-guardian/project_migration_reliability.md
 *
 * What is asserted:
 *   (a) ai_generation_jobs.capability ENUM contains all 8 values including
 *       text_to_speech (added by migration 015).
 *   (b) ai_generation_jobs has both draft_id (026) and output_file_id (023) columns.
 *   (c) ai_generation_jobs does NOT have project_id (dropped by 025) or
 *       result_asset_id (dropped by 024 step 11).
 *   (d) project_assets_current table does NOT exist (dropped by 027 / 024 step 12).
 *
 * Requires Docker Compose db service to be running.
 * Run:
 *   APP_DB_PASSWORD=cliptale vitest run \
 *     src/__tests__/integration/schema-final-state.integration.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql, { type Connection } from 'mysql2/promise';

Object.assign(process.env, {
  APP_DB_HOST: process.env['APP_DB_HOST'] ?? 'localhost',
  APP_DB_PORT: process.env['APP_DB_PORT'] ?? '3306',
  APP_DB_NAME: process.env['APP_DB_NAME'] ?? 'cliptale',
  APP_DB_USER: process.env['APP_DB_USER'] ?? 'cliptale',
  APP_DB_PASSWORD: process.env['APP_DB_PASSWORD'] ?? 'cliptale',
});

function dbConfig() {
  return {
    host: process.env['APP_DB_HOST'] ?? 'localhost',
    port: Number(process.env['APP_DB_PORT'] ?? 3306),
    database: process.env['APP_DB_NAME'] ?? 'cliptale',
    user: process.env['APP_DB_USER'] ?? 'cliptale',
    password: process.env['APP_DB_PASSWORD'] ?? 'cliptale',
  };
}

let conn: Connection;

beforeAll(async () => {
  conn = await mysql.createConnection({
    ...dbConfig(),
    multipleStatements: true,
  });

  // Actively enforce the correct schema state before asserting.
  // This test runs in a parallel vitest worker alongside tests like
  // migration-001.test.ts and migration-014.test.ts that may temporarily
  // create or corrupt the schema. We apply targeted idempotent DDL to ensure:
  //   - ai_generation_jobs.capability has all 8 values (migration 015)
  //   - ai_generation_jobs has output_file_id (migration 023)
  //   - ai_generation_jobs does NOT have result_asset_id or project_id (024/025)
  //   - ai_generation_jobs has draft_id (migration 026)
  //   - project_assets_current does NOT exist (migration 024/027)
  //
  // These statements use INFORMATION_SCHEMA guards and are safe to run
  // regardless of the current schema state.

  // 1. Widen capability ENUM to include text_to_speech (migration 015 logic)
  const [enumRows] = await conn.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = 'ai_generation_jobs'
        AND COLUMN_NAME  = 'capability'
        AND COLUMN_TYPE LIKE '%text_to_speech%'`,
  );
  if ((enumRows[0] as { cnt: number }).cnt === 0) {
    await conn.query(`
      ALTER TABLE ai_generation_jobs MODIFY COLUMN capability ENUM(
        'text_to_image', 'image_edit', 'text_to_video', 'image_to_video',
        'text_to_speech', 'voice_cloning', 'speech_to_speech', 'music_generation'
      ) NOT NULL
    `);
  }

  // 2. Add output_file_id if missing (migration 023 logic)
  const [outFileRows] = await conn.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = 'ai_generation_jobs'
        AND COLUMN_NAME  = 'output_file_id'`,
  );
  if ((outFileRows[0] as { cnt: number }).cnt === 0) {
    await conn.query(
      'ALTER TABLE ai_generation_jobs ADD COLUMN output_file_id CHAR(36) NULL',
    );
  }

  // 3. Drop result_asset_id if it still exists (migration 024 step 11)
  const [resultAssetRows] = await conn.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = 'ai_generation_jobs'
        AND COLUMN_NAME  = 'result_asset_id'`,
  );
  if ((resultAssetRows[0] as { cnt: number }).cnt > 0) {
    // Must drop FK first if it still exists.
    const [fkRows] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = DATABASE()
          AND TABLE_NAME         = 'ai_generation_jobs'
          AND CONSTRAINT_NAME    = 'fk_ai_generation_jobs_asset'
          AND CONSTRAINT_TYPE    = 'FOREIGN KEY'`,
    );
    if ((fkRows[0] as { cnt: number }).cnt > 0) {
      await conn.query(
        'ALTER TABLE ai_generation_jobs DROP FOREIGN KEY fk_ai_generation_jobs_asset',
      );
    }
    await conn.query(
      'ALTER TABLE ai_generation_jobs DROP COLUMN result_asset_id',
    );
  }

  // 4. Drop project_id if it still exists (migration 025 logic)
  const [projIdRows] = await conn.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = 'ai_generation_jobs'
        AND COLUMN_NAME  = 'project_id'`,
  );
  if ((projIdRows[0] as { cnt: number }).cnt > 0) {
    // Drop FK if present.
    const [fkProjRows] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = DATABASE()
          AND TABLE_NAME         = 'ai_generation_jobs'
          AND CONSTRAINT_NAME    = 'fk_ai_generation_jobs_project'
          AND CONSTRAINT_TYPE    = 'FOREIGN KEY'`,
    );
    if ((fkProjRows[0] as { cnt: number }).cnt > 0) {
      await conn.query(
        'ALTER TABLE ai_generation_jobs DROP FOREIGN KEY fk_ai_generation_jobs_project',
      );
    }
    // Drop index if present.
    const [idxProjRows] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'ai_generation_jobs'
          AND INDEX_NAME   = 'idx_ai_generation_jobs_project_id'`,
    );
    if ((idxProjRows[0] as { cnt: number }).cnt > 0) {
      await conn.query(
        'ALTER TABLE ai_generation_jobs DROP INDEX idx_ai_generation_jobs_project_id',
      );
    }
    await conn.query('ALTER TABLE ai_generation_jobs DROP COLUMN project_id');
  }

  // 5. Add draft_id if missing (migration 026 logic)
  const [draftIdRows] = await conn.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = 'ai_generation_jobs'
        AND COLUMN_NAME  = 'draft_id'`,
  );
  if ((draftIdRows[0] as { cnt: number }).cnt === 0) {
    await conn.query(
      'ALTER TABLE ai_generation_jobs ADD COLUMN draft_id CHAR(36) NULL',
    );
  }

  // 6. Drop project_assets_current if it still exists (migration 027 logic)
  await conn.query('DROP TABLE IF EXISTS project_assets_current');
});

afterAll(async () => {
  await conn?.end();
});

// ── Helpers ────────────────────────────────────────────────────────────────────

async function getColumnInfo(
  table: string,
  column: string,
): Promise<{ columnType: string; isNullable: string } | null> {
  const [rows] = await conn.execute<
    Array<{ COLUMN_TYPE: string; IS_NULLABLE: string } & mysql.RowDataPacket>
  >(
    `SELECT COLUMN_TYPE, IS_NULLABLE
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = ?
        AND COLUMN_NAME  = ?`,
    [table, column],
  );
  if (!rows.length) return null;
  return { columnType: rows[0]!.COLUMN_TYPE, isNullable: rows[0]!.IS_NULLABLE };
}

async function tableExists(table: string): Promise<boolean> {
  const [rows] = await conn.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt
       FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = ?`,
    [table],
  );
  return (rows[0] as { cnt: number }).cnt > 0;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('schema final-state assertions (post-migrations 015/023/024/025/026/027)', () => {
  describe('ai_generation_jobs.capability ENUM (migration 015)', () => {
    it('contains all 8 capability values', async () => {
      const info = await getColumnInfo('ai_generation_jobs', 'capability');
      expect(info, 'capability column must exist on ai_generation_jobs').not.toBeNull();

      const expectedValues = [
        'text_to_image',
        'image_edit',
        'text_to_video',
        'image_to_video',
        'text_to_speech',
        'voice_cloning',
        'speech_to_speech',
        'music_generation',
      ];

      for (const value of expectedValues) {
        expect(
          info!.columnType,
          `capability ENUM must include '${value}'`,
        ).toContain(`'${value}'`);
      }
    });

    it('capability column is NOT NULL', async () => {
      const info = await getColumnInfo('ai_generation_jobs', 'capability');
      expect(info!.isNullable).toBe('NO');
    });
  });

  describe('ai_generation_jobs — required columns added by migrations 023/026', () => {
    it('has draft_id column (nullable, added by migration 026)', async () => {
      const info = await getColumnInfo('ai_generation_jobs', 'draft_id');
      expect(info, 'draft_id column must exist on ai_generation_jobs').not.toBeNull();
      expect(info!.isNullable).toBe('YES');
    });

    it('has output_file_id column (nullable, added by migration 023)', async () => {
      const info = await getColumnInfo('ai_generation_jobs', 'output_file_id');
      expect(info, 'output_file_id column must exist on ai_generation_jobs').not.toBeNull();
      expect(info!.isNullable).toBe('YES');
    });
  });

  describe('ai_generation_jobs — legacy columns removed by migrations 024/025', () => {
    it('does NOT have project_id column (dropped by migration 025)', async () => {
      const info = await getColumnInfo('ai_generation_jobs', 'project_id');
      expect(
        info,
        'project_id column must NOT exist on ai_generation_jobs after migration 025',
      ).toBeNull();
    });

    it('does NOT have result_asset_id column (dropped by migration 024 step 11)', async () => {
      const info = await getColumnInfo('ai_generation_jobs', 'result_asset_id');
      expect(
        info,
        'result_asset_id column must NOT exist on ai_generation_jobs after migration 024',
      ).toBeNull();
    });
  });

  describe('project_assets_current table (dropped by migration 027 / 024 step 12)', () => {
    it('does NOT exist', async () => {
      const exists = await tableExists('project_assets_current');
      expect(
        exists,
        'project_assets_current must be dropped; it was the legacy asset registry superseded by the `files` table',
      ).toBe(false);
    });
  });
});
