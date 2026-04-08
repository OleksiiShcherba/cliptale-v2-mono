/**
 * Shared fixtures for migration 008 integration tests.
 * Provides DB connection, migration path, test user ID, and SHA-256 helper.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';

import mysql, { type Connection } from 'mysql2/promise';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const MIGRATION_PATH = resolve(
  __dirname,
  '../../db/migrations/008_users_auth.sql',
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

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function readMigrationSql(): string {
  return readFileSync(MIGRATION_PATH, 'utf-8');
}

export { randomUUID, mysql, type Connection };
