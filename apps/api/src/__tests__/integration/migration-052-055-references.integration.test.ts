/**
 * Integration tests for migrations 052–055 — storyboard reference flows curation tables.
 *
 * Asserts the 4 tables exist with the key columns, FKs, UNIQUE constraints, and
 * indexes described in docs/features/storyboard-reference-flows/data-model.md.
 *
 * ACs covered: AC-06 (primary-star unique constraint), AC-07 (star cascade FK),
 *              AC-10b (scene link cascade FK).
 *
 * These tests are RED until the implementer promotes the staged .up.sql files
 * into apps/api/src/db/migrations/052_*..055_* and applies them.
 *
 * Run:
 *   cd apps/api && APP_DB_PASSWORD=cliptale npx vitest run \
 *     src/__tests__/integration/migration-052-055-references.integration.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql, { type Connection } from 'mysql2/promise';

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
});

afterAll(async () => {
  await conn?.end();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

async function getColumns(
  tableName: string,
): Promise<Record<string, mysql.RowDataPacket>> {
  const [rows] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_TYPE, EXTRA
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION`,
    [tableName],
  );
  return Object.fromEntries(
    rows.map((r) => [r['COLUMN_NAME'] as string, r]),
  );
}

async function getIndexColumns(
  tableName: string,
  indexName: string,
): Promise<string[]> {
  const [rows] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT COLUMN_NAME
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND INDEX_NAME = ?
      ORDER BY SEQ_IN_INDEX ASC`,
    [tableName, indexName],
  );
  return rows.map((r) => String(r['COLUMN_NAME']));
}

async function getForeignKeys(
  tableName: string,
): Promise<Array<{ constraintName: string; column: string; refTable: string; refColumn: string; deleteRule: string }>> {
  const [rows] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT kcu.CONSTRAINT_NAME, kcu.COLUMN_NAME, kcu.REFERENCED_TABLE_NAME,
            kcu.REFERENCED_COLUMN_NAME, rc.DELETE_RULE
       FROM information_schema.KEY_COLUMN_USAGE kcu
       JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
         ON rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
        AND rc.CONSTRAINT_SCHEMA = kcu.TABLE_SCHEMA
      WHERE kcu.TABLE_SCHEMA = DATABASE()
        AND kcu.TABLE_NAME = ?
        AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
      ORDER BY kcu.CONSTRAINT_NAME, kcu.ORDINAL_POSITION`,
    [tableName],
  );
  return rows.map((r) => ({
    constraintName: String(r['CONSTRAINT_NAME']),
    column: String(r['COLUMN_NAME']),
    refTable: String(r['REFERENCED_TABLE_NAME']),
    refColumn: String(r['REFERENCED_COLUMN_NAME']),
    deleteRule: String(r['DELETE_RULE']),
  }));
}

async function isNonUnique(tableName: string, indexName: string): Promise<boolean | null> {
  const [rows] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT NON_UNIQUE
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND INDEX_NAME = ?
      LIMIT 1`,
    [tableName, indexName],
  );
  if (rows.length === 0) return null;
  return rows[0]!['NON_UNIQUE'] === 1;
}

// ---------------------------------------------------------------------------
// 052 — storyboard_cast_extraction_jobs
// ---------------------------------------------------------------------------

describe('migration 052 — storyboard_cast_extraction_jobs', () => {
  it('table exists', async () => {
    expect(await tableExists('storyboard_cast_extraction_jobs')).toBe(true);
  });

  it('has required columns with correct types', async () => {
    const cols = await getColumns('storyboard_cast_extraction_jobs');

    expect(cols['id']!['DATA_TYPE']).toBe('char');
    expect(cols['id']!['IS_NULLABLE']).toBe('NO');

    expect(cols['draft_id']!['DATA_TYPE']).toBe('char');
    expect(cols['draft_id']!['IS_NULLABLE']).toBe('NO');

    expect(cols['user_id']!['DATA_TYPE']).toBe('char');
    expect(cols['user_id']!['IS_NULLABLE']).toBe('NO');

    // ENUM status
    expect(cols['status']!['COLUMN_TYPE']).toBe(
      "enum('queued','running','completed','failed')",
    );
    expect(cols['status']!['COLUMN_DEFAULT']).toBe('queued');

    expect(cols['proposal_json']!['DATA_TYPE']).toBe('json');
    expect(cols['proposal_json']!['IS_NULLABLE']).toBe('YES');

    expect(cols['aggregate_estimate_credits']!['DATA_TYPE']).toBe('decimal');
    expect(cols['aggregate_estimate_credits']!['IS_NULLABLE']).toBe('YES');

    expect(cols['error_message']!['DATA_TYPE']).toBe('varchar');
    expect(cols['error_message']!['IS_NULLABLE']).toBe('YES');

    expect(cols['completed_at']!['DATA_TYPE']).toBe('datetime');
    expect(cols['completed_at']!['IS_NULLABLE']).toBe('YES');

    expect(cols['failed_at']!['DATA_TYPE']).toBe('datetime');
    expect(cols['failed_at']!['IS_NULLABLE']).toBe('YES');

    expect(cols['created_at']!['DATA_TYPE']).toBe('datetime');
    expect(cols['created_at']!['IS_NULLABLE']).toBe('NO');

    expect(cols['updated_at']!['DATA_TYPE']).toBe('datetime');
    expect(cols['updated_at']!['IS_NULLABLE']).toBe('NO');
  });

  it('has composite index on (draft_id, created_at) for latest-proposal lookup', async () => {
    const cols = await getIndexColumns(
      'storyboard_cast_extraction_jobs',
      'idx_storyboard_cast_extraction_draft_created',
    );
    expect(cols).toContain('draft_id');
    expect(cols).toContain('created_at');
    expect(cols[0]).toBe('draft_id');
  });

  it('has index on user_id for FK coverage', async () => {
    const cols = await getIndexColumns(
      'storyboard_cast_extraction_jobs',
      'idx_storyboard_cast_extraction_user',
    );
    expect(cols).toContain('user_id');
  });

  it('has FK draft_id → generation_drafts ON DELETE CASCADE', async () => {
    const fks = await getForeignKeys('storyboard_cast_extraction_jobs');
    const draftFk = fks.find((f) => f.column === 'draft_id');
    expect(draftFk).toBeDefined();
    expect(draftFk!.refTable).toBe('generation_drafts');
    expect(draftFk!.deleteRule).toBe('CASCADE');
  });

  it('has FK user_id → users ON DELETE CASCADE', async () => {
    const fks = await getForeignKeys('storyboard_cast_extraction_jobs');
    const userFk = fks.find((f) => f.column === 'user_id');
    expect(userFk).toBeDefined();
    expect(userFk!.refTable).toBe('users');
    expect(userFk!.deleteRule).toBe('CASCADE');
  });
});

// ---------------------------------------------------------------------------
// 053 — storyboard_reference_blocks
// ---------------------------------------------------------------------------

describe('migration 053 — storyboard_reference_blocks', () => {
  it('table exists', async () => {
    expect(await tableExists('storyboard_reference_blocks')).toBe(true);
  });

  it('has required columns with correct types', async () => {
    const cols = await getColumns('storyboard_reference_blocks');

    expect(cols['id']!['DATA_TYPE']).toBe('char');
    expect(cols['id']!['IS_NULLABLE']).toBe('NO');

    expect(cols['draft_id']!['DATA_TYPE']).toBe('char');
    expect(cols['draft_id']!['IS_NULLABLE']).toBe('NO');

    // flow_id is nullable (no-flow state)
    expect(cols['flow_id']!['DATA_TYPE']).toBe('char');
    expect(cols['flow_id']!['IS_NULLABLE']).toBe('YES');

    expect(cols['cast_type']!['COLUMN_TYPE']).toBe(
      "enum('character','environment')",
    );
    expect(cols['cast_type']!['IS_NULLABLE']).toBe('NO');

    expect(cols['name']!['DATA_TYPE']).toBe('varchar');
    expect(cols['name']!['IS_NULLABLE']).toBe('NO');

    expect(cols['description']!['DATA_TYPE']).toBe('text');
    expect(cols['description']!['IS_NULLABLE']).toBe('YES');

    expect(cols['sort_order']!['DATA_TYPE']).toBe('int');
    expect(cols['sort_order']!['COLUMN_DEFAULT']).toBe('0');

    expect(cols['position_x']!['DATA_TYPE']).toBe('float');
    expect(cols['position_x']!['IS_NULLABLE']).toBe('NO');

    expect(cols['position_y']!['DATA_TYPE']).toBe('float');
    expect(cols['position_y']!['IS_NULLABLE']).toBe('NO');

    // window_status: nullable ENUM
    expect(cols['window_status']!['COLUMN_TYPE']).toBe(
      "enum('pending','running','done','failed')",
    );
    expect(cols['window_status']!['IS_NULLABLE']).toBe('YES');

    expect(cols['first_job_id']!['DATA_TYPE']).toBe('varchar');
    expect(cols['first_job_id']!['IS_NULLABLE']).toBe('YES');

    expect(cols['error_message']!['DATA_TYPE']).toBe('varchar');
    expect(cols['error_message']!['IS_NULLABLE']).toBe('YES');

    // version: INT UNSIGNED NOT NULL DEFAULT 1 (compare-and-set guard for scene-link saves)
    expect(cols['version']!['DATA_TYPE']).toBe('int');
    expect(cols['version']!['IS_NULLABLE']).toBe('NO');
    expect(cols['version']!['COLUMN_DEFAULT']).toBe('1');
  });

  it('has UNIQUE KEY on flow_id enforcing 1:1 block↔flow (AC-12, ADR-0010)', async () => {
    const nonUnique = await isNonUnique(
      'storyboard_reference_blocks',
      'uq_storyboard_reference_blocks_flow',
    );
    expect(nonUnique).not.toBeNull();
    // nonUnique === false means it IS a unique index
    expect(nonUnique).toBe(false);
    const cols = await getIndexColumns(
      'storyboard_reference_blocks',
      'uq_storyboard_reference_blocks_flow',
    );
    expect(cols).toEqual(['flow_id']);
  });

  it('has composite index on (draft_id, sort_order) for canvas load + star gate', async () => {
    const cols = await getIndexColumns(
      'storyboard_reference_blocks',
      'idx_storyboard_reference_blocks_draft_sort',
    );
    expect(cols).toEqual(['draft_id', 'sort_order']);
  });

  it('has composite index on (draft_id, window_status) for rolling-window claim', async () => {
    const cols = await getIndexColumns(
      'storyboard_reference_blocks',
      'idx_storyboard_reference_blocks_draft_window',
    );
    expect(cols).toEqual(['draft_id', 'window_status']);
  });

  it('has index on first_job_id for FK coverage', async () => {
    const cols = await getIndexColumns(
      'storyboard_reference_blocks',
      'idx_storyboard_reference_blocks_first_job',
    );
    expect(cols).toContain('first_job_id');
  });

  it('has FK draft_id → generation_drafts ON DELETE CASCADE', async () => {
    const fks = await getForeignKeys('storyboard_reference_blocks');
    const fk = fks.find((f) => f.column === 'draft_id');
    expect(fk).toBeDefined();
    expect(fk!.refTable).toBe('generation_drafts');
    expect(fk!.deleteRule).toBe('CASCADE');
  });

  it('has FK flow_id → generation_flows ON DELETE SET NULL (block survives flow deletion)', async () => {
    const fks = await getForeignKeys('storyboard_reference_blocks');
    const fk = fks.find((f) => f.column === 'flow_id');
    expect(fk).toBeDefined();
    expect(fk!.refTable).toBe('generation_flows');
    expect(fk!.deleteRule).toBe('SET NULL');
  });

  it('has FK first_job_id → ai_generation_jobs ON DELETE SET NULL', async () => {
    const fks = await getForeignKeys('storyboard_reference_blocks');
    const fk = fks.find((f) => f.column === 'first_job_id');
    expect(fk).toBeDefined();
    expect(fk!.refTable).toBe('ai_generation_jobs');
    expect(fk!.deleteRule).toBe('SET NULL');
  });
});

// ---------------------------------------------------------------------------
// 054 — storyboard_reference_scene_links
// ---------------------------------------------------------------------------

describe('migration 054 — storyboard_reference_scene_links (AC-10b)', () => {
  it('table exists', async () => {
    expect(await tableExists('storyboard_reference_scene_links')).toBe(true);
  });

  it('has required columns', async () => {
    const cols = await getColumns('storyboard_reference_scene_links');

    expect(cols['reference_block_id']!['DATA_TYPE']).toBe('char');
    expect(cols['reference_block_id']!['IS_NULLABLE']).toBe('NO');

    expect(cols['scene_block_id']!['DATA_TYPE']).toBe('char');
    expect(cols['scene_block_id']!['IS_NULLABLE']).toBe('NO');

    expect(cols['created_at']!['DATA_TYPE']).toBe('datetime');
    expect(cols['created_at']!['IS_NULLABLE']).toBe('NO');
  });

  it('has composite PK on (reference_block_id, scene_block_id)', async () => {
    const cols = await getIndexColumns('storyboard_reference_scene_links', 'PRIMARY');
    expect(cols).toEqual(['reference_block_id', 'scene_block_id']);
  });

  it('has index on scene_block_id for "all blocks linked to scene X" (AC-10b cascade)', async () => {
    const cols = await getIndexColumns(
      'storyboard_reference_scene_links',
      'idx_storyboard_reference_scene_links_scene',
    );
    expect(cols).toContain('scene_block_id');
  });

  it('has FK reference_block_id → storyboard_reference_blocks ON DELETE CASCADE (AC-10b)', async () => {
    const fks = await getForeignKeys('storyboard_reference_scene_links');
    const fk = fks.find((f) => f.column === 'reference_block_id');
    expect(fk).toBeDefined();
    expect(fk!.refTable).toBe('storyboard_reference_blocks');
    expect(fk!.deleteRule).toBe('CASCADE');
  });

  it('has FK scene_block_id → storyboard_blocks ON DELETE CASCADE (AC-10b scene deletion prunes links)', async () => {
    const fks = await getForeignKeys('storyboard_reference_scene_links');
    const fk = fks.find((f) => f.column === 'scene_block_id');
    expect(fk).toBeDefined();
    expect(fk!.refTable).toBe('storyboard_blocks');
    expect(fk!.deleteRule).toBe('CASCADE');
  });
});

// ---------------------------------------------------------------------------
// 055 — storyboard_reference_stars
// ---------------------------------------------------------------------------

describe('migration 055 — storyboard_reference_stars (AC-06, AC-07)', () => {
  it('table exists', async () => {
    expect(await tableExists('storyboard_reference_stars')).toBe(true);
  });

  it('has required columns with correct types', async () => {
    const cols = await getColumns('storyboard_reference_stars');

    expect(cols['id']!['DATA_TYPE']).toBe('char');
    expect(cols['id']!['IS_NULLABLE']).toBe('NO');

    expect(cols['reference_block_id']!['DATA_TYPE']).toBe('char');
    expect(cols['reference_block_id']!['IS_NULLABLE']).toBe('NO');

    expect(cols['file_id']!['DATA_TYPE']).toBe('char');
    expect(cols['file_id']!['IS_NULLABLE']).toBe('NO');

    // is_primary: TINYINT NULL — MySQL-NULL-unique pattern: NULL = non-primary, 1 = primary
    expect(cols['is_primary']!['DATA_TYPE']).toBe('tinyint');
    expect(cols['is_primary']!['IS_NULLABLE']).toBe('YES');
    // Default must be NULL (not 0 or 1)
    expect(cols['is_primary']!['COLUMN_DEFAULT']).toBeNull();

    expect(cols['created_at']!['DATA_TYPE']).toBe('datetime');
    expect(cols['created_at']!['IS_NULLABLE']).toBe('NO');
  });

  it('has UNIQUE KEY uq_storyboard_reference_stars_block_file on (reference_block_id, file_id) — idempotent star toggle (AC-06)', async () => {
    const nonUnique = await isNonUnique(
      'storyboard_reference_stars',
      'uq_storyboard_reference_stars_block_file',
    );
    expect(nonUnique).not.toBeNull();
    expect(nonUnique).toBe(false); // it IS a unique index
    const cols = await getIndexColumns(
      'storyboard_reference_stars',
      'uq_storyboard_reference_stars_block_file',
    );
    expect(cols).toEqual(['reference_block_id', 'file_id']);
  });

  it('has UNIQUE KEY uq_storyboard_reference_stars_primary on (reference_block_id, is_primary) — at most one primary per block (AC-06/AC-07)', async () => {
    const nonUnique = await isNonUnique(
      'storyboard_reference_stars',
      'uq_storyboard_reference_stars_primary',
    );
    expect(nonUnique).not.toBeNull();
    expect(nonUnique).toBe(false); // it IS a unique index
    const cols = await getIndexColumns(
      'storyboard_reference_stars',
      'uq_storyboard_reference_stars_primary',
    );
    expect(cols).toEqual(['reference_block_id', 'is_primary']);
  });

  it('has index on file_id for "blocks starring a given file" sync on file deletion (AC-07)', async () => {
    const cols = await getIndexColumns(
      'storyboard_reference_stars',
      'idx_storyboard_reference_stars_file',
    );
    expect(cols).toContain('file_id');
  });

  it('has FK reference_block_id → storyboard_reference_blocks ON DELETE CASCADE (AC-07 block deletion removes stars)', async () => {
    const fks = await getForeignKeys('storyboard_reference_stars');
    const fk = fks.find((f) => f.column === 'reference_block_id');
    expect(fk).toBeDefined();
    expect(fk!.refTable).toBe('storyboard_reference_blocks');
    expect(fk!.deleteRule).toBe('CASCADE');
  });

  it('has FK file_id → files ON DELETE CASCADE (AC-07 file deletion syncs star rows)', async () => {
    const fks = await getForeignKeys('storyboard_reference_stars');
    const fk = fks.find((f) => f.column === 'file_id');
    expect(fk).toBeDefined();
    expect(fk!.refTable).toBe('files');
    expect(fk!.deleteRule).toBe('CASCADE');
  });

  it('enforces at most one primary star per block via unique constraint (AC-06 invariant)', async () => {
    // This test exercises the constraint directly against the DB.
    // It uses the information_schema check above as a proxy — the schema-level
    // assertion is sufficient here because the constraint existence is verifiable
    // without inserting live data (which would require real draft/file FKs).
    // The runtime enforcement is tested by higher-layer integration tests (AC-06 row).
    const nonUnique = await isNonUnique(
      'storyboard_reference_stars',
      'uq_storyboard_reference_stars_primary',
    );
    expect(nonUnique).toBe(false);
  });
});
