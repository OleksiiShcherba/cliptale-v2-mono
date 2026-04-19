/**
 * Unit tests for apps/api/src/db/migrate.ts — production safety gate
 *
 * Covers:
 *   - runPendingMigrations skips all DB calls when NODE_ENV=production and
 *     APP_MIGRATE_ON_BOOT is not set
 *   - runPendingMigrations runs normally when NODE_ENV=production and
 *     APP_MIGRATE_ON_BOOT=true
 *
 * Does NOT require a live DB — all mysql2 interactions are replaced by vi.mock.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────────────────────

const { mockPoolExecute, mockPoolGetConnection, mockConnQuery, mockConnEnd } =
  vi.hoisted(() => {
    const mockConnQuery = vi.fn();
    const mockConnEnd = vi.fn().mockResolvedValue(undefined);
    const mockPoolExecute = vi.fn();
    const mockPoolGetConnection = vi.fn();
    return { mockPoolExecute, mockPoolGetConnection, mockConnQuery, mockConnEnd };
  });

vi.mock('@/db/connection.js', () => ({
  pool: {
    execute: mockPoolExecute,
    getConnection: mockPoolGetConnection,
  },
}));

vi.mock('mysql2/promise', () => ({
  default: {
    createConnection: vi.fn().mockResolvedValue({
      query: mockConnQuery,
      end: mockConnEnd,
    }),
  },
}));

vi.mock('@/config.js', () => ({
  config: {
    db: { host: 'localhost', port: 3306, name: 'cliptale', user: 'cliptale', password: 'cliptale' },
  },
}));

// ── Filesystem mock ────────────────────────────────────────────────────────────

const { mockReaddirSync, mockReadFileSync } = vi.hoisted(() => ({
  mockReaddirSync: vi.fn(),
  mockReadFileSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
  default: {
    readdirSync: mockReaddirSync,
    readFileSync: mockReadFileSync,
  },
  readdirSync: mockReaddirSync,
  readFileSync: mockReadFileSync,
}));

// ── Module under test ──────────────────────────────────────────────────────────
import { runPendingMigrations } from '@/db/migrate.js';

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('runPendingMigrations — production safety gate', () => {
  const BOOTSTRAP = '000_schema_migrations.sql';
  const BOOTSTRAP_SQL = 'CREATE TABLE IF NOT EXISTS schema_migrations (filename VARCHAR(255) PRIMARY KEY, checksum CHAR(64) NOT NULL, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);';

  beforeEach(() => {
    vi.clearAllMocks();
    mockReaddirSync.mockReturnValue([BOOTSTRAP]);
    mockReadFileSync.mockImplementation((filePath: string) => {
      if (String(filePath).endsWith(BOOTSTRAP)) return BOOTSTRAP_SQL;
      return '';
    });
    mockConnQuery.mockResolvedValue([[], []]);
    mockConnEnd.mockResolvedValue(undefined);
    mockPoolExecute.mockResolvedValue([[[], []]]);
  });

  afterEach(() => {
    delete process.env['NODE_ENV'];
    delete process.env['APP_MIGRATE_ON_BOOT'];
  });

  it('skips migrations in production when APP_MIGRATE_ON_BOOT is not set', async () => {
    process.env['NODE_ENV'] = 'production';

    await runPendingMigrations();

    // No DB calls at all
    expect(mockPoolExecute).not.toHaveBeenCalled();
    expect(mockConnQuery).not.toHaveBeenCalled();
  });

  it('runs migrations in production when APP_MIGRATE_ON_BOOT=true', async () => {
    process.env['NODE_ENV'] = 'production';
    process.env['APP_MIGRATE_ON_BOOT'] = 'true';

    mockPoolExecute.mockResolvedValue([[[], []]]);

    await runPendingMigrations();

    // Should have called bootstrapSchemaTable
    expect(mockConnQuery).toHaveBeenCalled();
  });
});
