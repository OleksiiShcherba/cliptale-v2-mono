/**
 * Integration test — migrations 058/059/060 (Motion Graphic core tables)
 *
 * RED→GREEN anchor (ai-motion-graphic T1, AC-01 / AC-12 / AC-13, ADR-0008 / ADR-0009):
 *   058 motion_graphics              — the aggregate-root code-backed media asset.
 *   059 motion_graphic_chat_turns    — append-only, re-runnable chat history.
 *   060 motion_graphic_block_snapshots — immutable frozen snapshot at attach time.
 *
 * The three staged migrations (01/02/03) are promoted to the live tree (live was at 057).
 * runPendingMigrations() applies them against the real localhost MySQL; the test asserts the
 * data-model columns, indexes and FKs, plus idempotency (CREATE TABLE IF NOT EXISTS).
 *
 * Revert: the staged downs (DROP TABLE IF EXISTS …) are trivially clean and are NOT exercised
 * here — the live runner is forward-only, and dropping a table while schema_migrations still
 * records the file would desync the shared dev DB (same rationale as the 057 / 051 tests).
 *
 * Prerequisites: MySQL 8 running at localhost:3306, db=cliptale, pass=cliptale.
 *
 * Run: cd apps/api && APP_DB_PASSWORD=cliptale npx vitest run
 *       src/db/__tests__/058-060-motion-graphic-core.migration.test.ts
 */

import fs from 'node:fs';
import path from 'node:path';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql from 'mysql2/promise';

import { MIGRATIONS_DIR, runPendingMigrations } from '@/db/migrate.js';

const DB_NAME = 'cliptale';

const FILES = {
  graphics: '058_create_motion_graphics.sql',
  turns: '059_create_motion_graphic_chat_turns.sql',
  snapshots: '060_create_motion_graphic_block_snapshots.sql',
};

const STATUS_ENUM = "enum('generating','ready','failed')";
const ROLE_ENUM = "enum('user','assistant')";
const OUTCOME_ENUM = "enum('ready','failed')";

let conn: mysql.Connection;

async function columns(table: string): Promise<Record<string, mysql.RowDataPacket>> {
  const [rows] = await conn.execute<mysql.RowDataPacket[]>(
    `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_KEY
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [DB_NAME, table],
  );
  return Object.fromEntries(rows.map((c) => [c['COLUMN_NAME'], c]));
}

async function indexColumns(table: string, index: string): Promise<string[]> {
  const [rows] = await conn.execute<mysql.RowDataPacket[]>(
    `SELECT COLUMN_NAME, SEQ_IN_INDEX
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?
      ORDER BY SEQ_IN_INDEX`,
    [DB_NAME, table, index],
  );
  return rows.map((r) => r['COLUMN_NAME']);
}

async function foreignKey(
  table: string,
  constraint: string,
): Promise<mysql.RowDataPacket | undefined> {
  const [rows] = await conn.execute<mysql.RowDataPacket[]>(
    `SELECT k.REFERENCED_TABLE_NAME, k.REFERENCED_COLUMN_NAME, r.DELETE_RULE
       FROM information_schema.KEY_COLUMN_USAGE k
       JOIN information_schema.REFERENTIAL_CONSTRAINTS r
         ON r.CONSTRAINT_SCHEMA = k.TABLE_SCHEMA
        AND r.CONSTRAINT_NAME   = k.CONSTRAINT_NAME
      WHERE k.TABLE_SCHEMA = ? AND k.TABLE_NAME = ? AND k.CONSTRAINT_NAME = ?`,
    [DB_NAME, table, constraint],
  );
  return rows[0];
}

beforeAll(async () => {
  conn = await mysql.createConnection({
    host: 'localhost',
    port: 3306,
    database: DB_NAME,
    user: 'cliptale',
    password: process.env['APP_DB_PASSWORD'] ?? 'cliptale',
  });
});

afterAll(async () => {
  await conn.end();
});

describe('migrations 058/059/060 — Motion Graphic core', () => {
  it('the three live migration files exist at the promoted paths', () => {
    for (const f of Object.values(FILES)) {
      expect(fs.existsSync(path.join(MIGRATIONS_DIR, f)), f).toBe(true);
    }
  });

  it('runPendingMigrations() applies them without error', async () => {
    await expect(runPendingMigrations()).resolves.toBeUndefined();
  });

  // ── 058 motion_graphics ──────────────────────────────────────────────────
  describe('058 motion_graphics', () => {
    it('PRIMARY KEY (id) is CHAR(36)', async () => {
      const cols = await columns('motion_graphics');
      expect(cols['id']!['COLUMN_TYPE']).toBe('char(36)');
      expect(cols['id']!['COLUMN_KEY']).toBe('PRI');
    });

    it('code is MEDIUMTEXT NULL (NULL until first ready)', async () => {
      const cols = await columns('motion_graphics');
      expect(cols['code']!['COLUMN_TYPE']).toBe('mediumtext');
      expect(cols['code']!['IS_NULLABLE']).toBe('YES');
    });

    it('duration_seconds is DECIMAL(6,2) NOT NULL', async () => {
      const cols = await columns('motion_graphics');
      expect(cols['duration_seconds']!['COLUMN_TYPE']).toBe('decimal(6,2)');
      expect(cols['duration_seconds']!['IS_NULLABLE']).toBe('NO');
    });

    it('status is ENUM(generating,ready,failed) NOT NULL DEFAULT generating', async () => {
      const cols = await columns('motion_graphics');
      expect(cols['status']!['COLUMN_TYPE']).toBe(STATUS_ENUM);
      expect(cols['status']!['IS_NULLABLE']).toBe('NO');
      expect(cols['status']!['COLUMN_DEFAULT']).toBe('generating');
    });

    it('version is INT UNSIGNED NOT NULL DEFAULT 1', async () => {
      const cols = await columns('motion_graphics');
      expect(cols['version']!['COLUMN_TYPE']).toBe('int unsigned');
      expect(cols['version']!['COLUMN_DEFAULT']).toBe('1');
    });

    it('deleted_at is DATETIME(3) NULL (soft-delete)', async () => {
      const cols = await columns('motion_graphics');
      expect(cols['deleted_at']!['COLUMN_TYPE']).toBe('datetime(3)');
      expect(cols['deleted_at']!['IS_NULLABLE']).toBe('YES');
    });

    it('idx_motion_graphics_user_active leads with user_id, deleted_at, updated_at', async () => {
      const idx = await indexColumns('motion_graphics', 'idx_motion_graphics_user_active');
      expect(idx).toEqual(['user_id', 'deleted_at', 'updated_at']);
    });

    it('FK fk_motion_graphics_user → users(user_id) ON DELETE CASCADE', async () => {
      const fk = await foreignKey('motion_graphics', 'fk_motion_graphics_user');
      expect(fk).toBeDefined();
      expect(fk!['REFERENCED_TABLE_NAME']).toBe('users');
      expect(fk!['REFERENCED_COLUMN_NAME']).toBe('user_id');
      expect(fk!['DELETE_RULE']).toBe('CASCADE');
    });
  });

  // ── 059 motion_graphic_chat_turns ────────────────────────────────────────
  describe('059 motion_graphic_chat_turns', () => {
    it('role is ENUM(user,assistant) NOT NULL', async () => {
      const cols = await columns('motion_graphic_chat_turns');
      expect(cols['role']!['COLUMN_TYPE']).toBe(ROLE_ENUM);
      expect(cols['role']!['IS_NULLABLE']).toBe('NO');
    });

    it('seq is INT UNSIGNED NOT NULL (app-assigned order)', async () => {
      const cols = await columns('motion_graphic_chat_turns');
      expect(cols['seq']!['COLUMN_TYPE']).toBe('int unsigned');
      expect(cols['seq']!['IS_NULLABLE']).toBe('NO');
    });

    it('generated_code is MEDIUMTEXT NULL (re-runnable turn)', async () => {
      const cols = await columns('motion_graphic_chat_turns');
      expect(cols['generated_code']!['COLUMN_TYPE']).toBe('mediumtext');
      expect(cols['generated_code']!['IS_NULLABLE']).toBe('YES');
    });

    it('outcome is ENUM(ready,failed) NULL (NULL for user turns)', async () => {
      const cols = await columns('motion_graphic_chat_turns');
      expect(cols['outcome']!['COLUMN_TYPE']).toBe(OUTCOME_ENUM);
      expect(cols['outcome']!['IS_NULLABLE']).toBe('YES');
    });

    it('has no updated_at (append-only/immutable turns)', async () => {
      const cols = await columns('motion_graphic_chat_turns');
      expect(cols['updated_at']).toBeUndefined();
    });

    it('idx_mg_chat_turns_graphic_seq covers (motion_graphic_id, seq)', async () => {
      const idx = await indexColumns(
        'motion_graphic_chat_turns',
        'idx_mg_chat_turns_graphic_seq',
      );
      expect(idx).toEqual(['motion_graphic_id', 'seq']);
    });

    it('FK fk_mg_chat_turns_graphic → motion_graphics(id) ON DELETE CASCADE', async () => {
      const fk = await foreignKey('motion_graphic_chat_turns', 'fk_mg_chat_turns_graphic');
      expect(fk).toBeDefined();
      expect(fk!['REFERENCED_TABLE_NAME']).toBe('motion_graphics');
      expect(fk!['DELETE_RULE']).toBe('CASCADE');
    });
  });

  // ── 060 motion_graphic_block_snapshots ───────────────────────────────────
  describe('060 motion_graphic_block_snapshots', () => {
    it('source_motion_graphic_id is CHAR(36) NULL (survives source deletion)', async () => {
      const cols = await columns('motion_graphic_block_snapshots');
      expect(cols['source_motion_graphic_id']!['COLUMN_TYPE']).toBe('char(36)');
      expect(cols['source_motion_graphic_id']!['IS_NULLABLE']).toBe('YES');
    });

    it('code is MEDIUMTEXT NOT NULL (only ready graphics attach)', async () => {
      const cols = await columns('motion_graphic_block_snapshots');
      expect(cols['code']!['COLUMN_TYPE']).toBe('mediumtext');
      expect(cols['code']!['IS_NULLABLE']).toBe('NO');
    });

    it('duration_seconds is DECIMAL(6,2) NOT NULL (frozen at attach)', async () => {
      const cols = await columns('motion_graphic_block_snapshots');
      expect(cols['duration_seconds']!['COLUMN_TYPE']).toBe('decimal(6,2)');
      expect(cols['duration_seconds']!['IS_NULLABLE']).toBe('NO');
    });

    it('FK fk_mg_block_snapshots_source → motion_graphics(id) ON DELETE SET NULL', async () => {
      const fk = await foreignKey(
        'motion_graphic_block_snapshots',
        'fk_mg_block_snapshots_source',
      );
      expect(fk).toBeDefined();
      expect(fk!['REFERENCED_TABLE_NAME']).toBe('motion_graphics');
      expect(fk!['DELETE_RULE']).toBe('SET NULL');
    });
  });

  it('runPendingMigrations() is idempotent (re-run is a no-op)', async () => {
    await expect(runPendingMigrations()).resolves.toBeUndefined();
    const cols = await columns('motion_graphics');
    expect(cols['id']).toBeDefined();
  });
});
