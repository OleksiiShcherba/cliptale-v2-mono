/**
 * In-process migration runner for apps/api.
 *
 * Design invariants (MySQL 8.0):
 * - MySQL DDL is NOT transactional — ALTER TABLE / CREATE TABLE auto-commit.
 *   We cannot roll back a partially applied migration. Instead: apply the SQL
 *   first, then INSERT the bookkeeping row. If the DDL fails we do NOT insert,
 *   so schema_migrations accurately reflects exactly what ran.
 * - On DDL failure the runner halts immediately; no further migrations are applied.
 * - A checksum mismatch on a previously applied file is a hard error: it means the
 *   migration was modified after it was applied, which may have left the DB in an
 *   unknown state. The runner throws and does not continue.
 * - Each migration file is executed on a dedicated connection with
 *   `multipleStatements: true` because several files use PREPARE/EXECUTE blocks
 *   and SET @var patterns that require the MySQL session to be multi-statement.
 *   The connection is always released immediately after use.
 *
 * Production safety gate:
 * - When NODE_ENV === 'production' the runner only executes if
 *   APP_MIGRATE_ON_BOOT is set to 'true'. This prevents accidental migration
 *   races across multiple api replicas in a production deploy. Remove this gate
 *   once a proper migration job / leader-election mechanism is in place.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import mysql from 'mysql2/promise';

import { config } from '@/config.js';
import { pool } from '@/db/connection.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path to the migrations directory, resolved relative to this file. */
export const MIGRATIONS_DIR = path.resolve(__dirname, 'migrations');

/** Thrown when a previously applied migration file has been modified. */
export class MigrationChecksumMismatchError extends Error {
  constructor(filename: string, stored: string, computed: string) {
    super(
      `Migration checksum mismatch for "${filename}": ` +
        `stored=${stored}, computed=${computed}. ` +
        `Do NOT modify applied migration files.`,
    );
    this.name = 'MigrationChecksumMismatchError';
  }
}

/** SHA-256 hex digest of the given string content. */
export function computeChecksum(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Returns migration filenames in strict ascending numeric prefix order.
 * Only `.sql` files whose names match `^\d+_` are included.
 */
export function sortedMigrationFiles(dir: string): string[] {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql'));
  return files
    .filter((f) => /^\d+_/.test(f))
    .sort((a, b) => {
      const numA = parseInt(a.split('_')[0]!, 10);
      const numB = parseInt(b.split('_')[0]!, 10);
      return numA - numB;
    });
}

/**
 * Opens a temporary single-use mysql2 connection with `multipleStatements: true`.
 * Required because migration files often contain PREPARE/EXECUTE blocks and
 * SET @var patterns that need a multi-statement session.
 * Always call `.end()` on the returned connection when done.
 */
async function openMultiStatementConnection(): Promise<mysql.Connection> {
  return mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    database: config.db.name,
    user: config.db.user,
    password: config.db.password,
    multipleStatements: true,
  });
}

/**
 * Reads the set of already-applied migrations from `schema_migrations`.
 * Returns a Map from filename → stored checksum.
 * Assumes the table already exists.
 */
async function fetchApplied(): Promise<Map<string, string>> {
  const [rows] = await pool.execute<
    Array<{ filename: string; checksum: string } & import('mysql2').RowDataPacket>
  >('SELECT filename, checksum FROM schema_migrations');
  return new Map(rows.map((r) => [r.filename, r.checksum]));
}

/**
 * Bootstraps the `schema_migrations` table by running
 * `000_schema_migrations.sql` on a dedicated connection.
 * Uses CREATE TABLE IF NOT EXISTS so it is always safe to call.
 */
async function bootstrapSchemaTable(): Promise<void> {
  const bootstrapPath = path.join(MIGRATIONS_DIR, '000_schema_migrations.sql');
  const sql = fs.readFileSync(bootstrapPath, 'utf8');
  const conn = await openMultiStatementConnection();
  try {
    await conn.query(sql);
  } finally {
    await conn.end();
  }
}

/**
 * Records a migration filename + checksum in the bookkeeping table.
 * Called AFTER the migration SQL has been successfully executed.
 */
async function recordMigration(filename: string, checksum: string): Promise<void> {
  await pool.execute(
    'INSERT INTO schema_migrations (filename, checksum) VALUES (?, ?)',
    [filename, checksum],
  );
}

/**
 * Runs all pending migrations in numeric order, then returns.
 *
 * @throws {MigrationChecksumMismatchError} if a file that was already applied
 *   has been modified (its SHA-256 no longer matches the stored value).
 * @throws if any migration's SQL fails. Further migrations are halted and the
 *   failed file is NOT recorded in schema_migrations.
 */
export async function runPendingMigrations(): Promise<void> {
  // Production safety gate — refuse to auto-migrate when NODE_ENV=production
  // unless the operator explicitly opts in via APP_MIGRATE_ON_BOOT=true.
  // Remove this guard once a proper single-leader migration orchestration exists.
  if (
    process.env['NODE_ENV'] === 'production' &&
    process.env['APP_MIGRATE_ON_BOOT'] !== 'true'
  ) {
    console.warn(
      '[migrate] Skipping auto-migration: NODE_ENV=production and ' +
        'APP_MIGRATE_ON_BOOT is not set to "true". ' +
        'Set APP_MIGRATE_ON_BOOT=true to run migrations on boot in production.',
    );
    return;
  }

  // Ensure the bookkeeping table exists before querying it.
  await bootstrapSchemaTable();

  // Re-read applied set after the bootstrap so 000 may already be there
  // from a prior run.
  const applied = await fetchApplied();
  const allFiles = sortedMigrationFiles(MIGRATIONS_DIR);
  const bootstrapFile = '000_schema_migrations.sql';

  // Record the bootstrap file itself so schema_migrations is a complete log.
  const bootstrapContent = fs.readFileSync(
    path.join(MIGRATIONS_DIR, bootstrapFile),
    'utf8',
  );
  const bootstrapChecksum = computeChecksum(bootstrapContent);
  if (!applied.has(bootstrapFile)) {
    await recordMigration(bootstrapFile, bootstrapChecksum);
  } else {
    const stored = applied.get(bootstrapFile)!;
    if (stored !== bootstrapChecksum) {
      throw new MigrationChecksumMismatchError(bootstrapFile, stored, bootstrapChecksum);
    }
  }

  // Apply every non-bootstrap migration in ascending numeric order.
  for (const filename of allFiles) {
    if (filename === bootstrapFile) continue;

    const filePath = path.join(MIGRATIONS_DIR, filename);
    const content = fs.readFileSync(filePath, 'utf8');
    const checksum = computeChecksum(content);

    if (applied.has(filename)) {
      // Already applied — verify the file has not been modified post-apply.
      const stored = applied.get(filename)!;
      if (stored !== checksum) {
        throw new MigrationChecksumMismatchError(filename, stored, checksum);
      }
      continue;
    }

    // Pending migration — execute on a dedicated multi-statement connection.
    console.log(`[migrate] Applying ${filename} …`);
    const conn = await openMultiStatementConnection();
    try {
      await conn.query(content);
    } finally {
      await conn.end();
    }

    // Record AFTER the DDL succeeds. MySQL DDL is not transactional: if the
    // process crashes between the DDL and this INSERT the file will be
    // re-attempted on next boot. Migration files must tolerate that (all
    // existing files use IF NOT EXISTS / IF EXISTS / INFORMATION_SCHEMA guards).
    await recordMigration(filename, checksum);
    console.log(`[migrate] Applied ${filename}`);
  }

  console.log('[migrate] All migrations up to date.');
}
