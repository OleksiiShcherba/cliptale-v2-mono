/**
 * Shared fixtures for migration 013 integration tests.
 * Loads the 013_drop_ai_provider_configs.sql migration file from disk and
 * exposes a mysql2 connection config with multipleStatements enabled.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import mysql, { type Connection } from 'mysql2/promise';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const MIGRATION_PATH = resolve(
  __dirname,
  '../../db/migrations/013_drop_ai_provider_configs.sql',
);

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

export function readMigrationSql(): string {
  return readFileSync(MIGRATION_PATH, 'utf-8');
}

export { mysql, type Connection };
