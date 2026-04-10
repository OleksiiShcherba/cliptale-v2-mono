/**
 * Shared fixtures for migration 014 integration tests.
 * Loads migration files 010, 012, and 014 so the test can rebuild the legacy
 * ai_generation_jobs shape and then apply the reshape in the same run.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import mysql, { type Connection } from 'mysql2/promise';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MIGRATIONS_DIR = resolve(__dirname, '../../db/migrations');

export const MIGRATION_010_PATH = resolve(MIGRATIONS_DIR, '010_ai_generation_jobs.sql');
export const MIGRATION_012_PATH = resolve(MIGRATIONS_DIR, '012_add_result_url_to_ai_jobs.sql');
export const MIGRATION_014_PATH = resolve(MIGRATIONS_DIR, '014_ai_jobs_fal_reshape.sql');

export function dbConfig() {
  return {
    host: process.env['APP_DB_HOST'] ?? 'localhost',
    port: Number(process.env['APP_DB_PORT'] ?? 3306),
    database: process.env['APP_DB_NAME'] ?? 'cliptale',
    user: process.env['APP_DB_USER'] ?? 'cliptale',
    password: process.env['APP_DB_PASSWORD'] ?? 'cliptale',
    multipleStatements: true,
  };
}

export function readSql(path: string): string {
  return readFileSync(path, 'utf-8');
}

export { mysql, type Connection };
