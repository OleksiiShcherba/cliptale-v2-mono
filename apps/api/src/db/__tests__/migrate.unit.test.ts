/**
 * Unit tests for apps/api/src/db/migrate.ts — core logic
 * Covers: computeChecksum, sortedMigrationFiles, MigrationChecksumMismatchError,
 * runPendingMigrations (apply/no-op/partial/checksum-drift/numeric-order).
 * Production gate tests live in migrate.production.test.ts.
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
  pool: { execute: mockPoolExecute, getConnection: mockPoolGetConnection },
}));

vi.mock('mysql2/promise', () => ({
  default: {
    createConnection: vi.fn().mockResolvedValue({ query: mockConnQuery, end: mockConnEnd }),
  },
}));

vi.mock('@/config.js', () => ({
  config: {
    db: { host: 'localhost', port: 3306, name: 'cliptale', user: 'cliptale', password: 'cliptale' },
  },
}));

const { mockReaddirSync, mockReadFileSync } = vi.hoisted(() => ({
  mockReaddirSync: vi.fn(),
  mockReadFileSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
  default: { readdirSync: mockReaddirSync, readFileSync: mockReadFileSync },
  readdirSync: mockReaddirSync,
  readFileSync: mockReadFileSync,
}));

// ── Module under test ──────────────────────────────────────────────────────────
import {
  computeChecksum,
  sortedMigrationFiles,
  MigrationChecksumMismatchError,
  runPendingMigrations,
} from '@/db/migrate.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeApplied(
  entries: Array<{ filename: string; checksum: string }>,
): Array<{ filename: string; checksum: string }> {
  return entries;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('computeChecksum', () => {
  it('returns a 64-character hex string', () => {
    const r = computeChecksum('SELECT 1');
    expect(r).toHaveLength(64);
    expect(r).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic for the same input', () => {
    expect(computeChecksum('hello')).toBe(computeChecksum('hello'));
  });

  it('produces different values for different inputs', () => {
    expect(computeChecksum('a')).not.toBe(computeChecksum('b'));
  });
});

describe('sortedMigrationFiles', () => {
  it('returns only .sql files with numeric prefix', () => {
    mockReaddirSync.mockReturnValue([
      '003_foo.sql', '001_bar.sql', 'README.md', '002_baz.sql', 'no_prefix.sql',
    ]);
    expect(sortedMigrationFiles('/fake')).toEqual(['001_bar.sql', '002_baz.sql', '003_foo.sql']);
  });

  it('sorts by numeric prefix ascending (not lexicographic)', () => {
    mockReaddirSync.mockReturnValue(['010_ten.sql', '002_two.sql', '001_one.sql']);
    const r = sortedMigrationFiles('/fake');
    expect(r).toEqual(['001_one.sql', '002_two.sql', '010_ten.sql']);
  });

  it('includes 000_schema_migrations.sql first', () => {
    mockReaddirSync.mockReturnValue(['000_schema_migrations.sql', '001_init.sql']);
    const r = sortedMigrationFiles('/fake');
    expect(r[0]).toBe('000_schema_migrations.sql');
    expect(r[1]).toBe('001_init.sql');
  });
});

describe('MigrationChecksumMismatchError', () => {
  it('includes filename, stored, and computed in the message', () => {
    const err = new MigrationChecksumMismatchError('001_foo.sql', 'aaa', 'bbb');
    expect(err.message).toContain('001_foo.sql');
    expect(err.message).toContain('stored=aaa');
    expect(err.message).toContain('computed=bbb');
  });

  it('has name MigrationChecksumMismatchError', () => {
    expect(new MigrationChecksumMismatchError('f.sql', 'x', 'y').name).toBe(
      'MigrationChecksumMismatchError',
    );
  });
});

describe('runPendingMigrations', () => {
  const BS = '000_schema_migrations.sql';
  const BS_SQL = 'CREATE TABLE IF NOT EXISTS schema_migrations (filename VARCHAR(255) PRIMARY KEY, checksum CHAR(64) NOT NULL, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);';
  const M1 = '001_init.sql';
  const M1_SQL = 'CREATE TABLE IF NOT EXISTS projects (id CHAR(36) PRIMARY KEY);';
  const M2 = '002_other.sql';
  const M2_SQL = 'CREATE TABLE IF NOT EXISTS tracks (id CHAR(36) PRIMARY KEY);';

  beforeEach(() => {
    vi.clearAllMocks();
    mockReaddirSync.mockReturnValue([BS, M1, M2]);
    mockReadFileSync.mockImplementation((fp: string) => {
      const s = String(fp);
      if (s.endsWith(BS)) return BS_SQL;
      if (s.endsWith(M1)) return M1_SQL;
      if (s.endsWith(M2)) return M2_SQL;
      return '';
    });
    mockConnQuery.mockResolvedValue([[], []]);
    mockConnEnd.mockResolvedValue(undefined);
    mockPoolExecute.mockResolvedValue([[makeApplied([])], []]);
  });

  afterEach(() => {
    delete process.env['NODE_ENV'];
    delete process.env['APP_MIGRATE_ON_BOOT'];
  });

  it('(a) applies all files when schema_migrations is empty', async () => {
    await runPendingMigrations();

    const inserts = mockPoolExecute.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).startsWith('INSERT'),
    );
    expect(inserts).toHaveLength(3);
    expect(inserts[0][1]).toContain(BS);
    expect(inserts[1][1]).toContain(M1);
    expect(inserts[2][1]).toContain(M2);
  });

  it('(b) skips all files when all are already applied (no-op)', async () => {
    const csBS = computeChecksum(BS_SQL);
    const cs1 = computeChecksum(M1_SQL);
    const cs2 = computeChecksum(M2_SQL);

    mockPoolExecute.mockImplementation((sql: string) => {
      if ((sql as string).startsWith('SELECT')) {
        return Promise.resolve([
          makeApplied([
            { filename: BS, checksum: csBS },
            { filename: M1, checksum: cs1 },
            { filename: M2, checksum: cs2 },
          ]),
          [],
        ]);
      }
      return Promise.resolve([[], []]);
    });

    await runPendingMigrations();

    const inserts = mockPoolExecute.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).startsWith('INSERT'),
    );
    expect(inserts).toHaveLength(0);
    expect(mockConnQuery).toHaveBeenCalledTimes(1);
  });

  it('(b) applies only missing files when schema_migrations is partially populated', async () => {
    mockPoolExecute.mockImplementation((sql: string) => {
      if ((sql as string).startsWith('SELECT')) {
        return Promise.resolve([
          makeApplied([
            { filename: BS, checksum: computeChecksum(BS_SQL) },
            { filename: M1, checksum: computeChecksum(M1_SQL) },
          ]),
          [],
        ]);
      }
      return Promise.resolve([[], []]);
    });

    await runPendingMigrations();

    const inserts = mockPoolExecute.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).startsWith('INSERT'),
    );
    expect(inserts).toHaveLength(1);
    expect(inserts[0][1]).toContain(M2);
  });

  it('(c) throws MigrationChecksumMismatchError for a modified applied file', async () => {
    mockPoolExecute.mockImplementation((sql: string) => {
      if ((sql as string).startsWith('SELECT')) {
        return Promise.resolve([
          makeApplied([
            { filename: BS, checksum: computeChecksum(BS_SQL) },
            { filename: M1, checksum: 'a'.repeat(64) },
          ]),
          [],
        ]);
      }
      return Promise.resolve([[], []]);
    });

    await expect(runPendingMigrations()).rejects.toThrow(MigrationChecksumMismatchError);
    await expect(runPendingMigrations()).rejects.toThrow(M1);
  });

  it('(c) throws MigrationChecksumMismatchError when bootstrap file has drifted', async () => {
    mockPoolExecute.mockImplementation((sql: string) => {
      if ((sql as string).startsWith('SELECT')) {
        return Promise.resolve([
          makeApplied([{ filename: BS, checksum: 'b'.repeat(64) }]),
          [],
        ]);
      }
      return Promise.resolve([[], []]);
    });

    await expect(runPendingMigrations()).rejects.toThrow(MigrationChecksumMismatchError);
    await expect(runPendingMigrations()).rejects.toThrow(BS);
  });

  it('(d) applies files in strict numeric prefix order', async () => {
    mockReaddirSync.mockReturnValue(['002_b.sql', '010_j.sql', '001_a.sql', BS]);
    mockReadFileSync.mockImplementation((fp: string) => `-- ${String(fp).split('/').pop()!}`);
    mockPoolExecute.mockResolvedValue([[makeApplied([])], []]);

    const appliedOrder: string[] = [];
    mockPoolExecute.mockImplementation((sql: string, params?: unknown[]) => {
      if ((sql as string).startsWith('INSERT') && Array.isArray(params)) {
        appliedOrder.push(params[0] as string);
      }
      return Promise.resolve([[], []]);
    });

    await runPendingMigrations();

    expect(appliedOrder.filter((f) => f !== BS)).toEqual(['001_a.sql', '002_b.sql', '010_j.sql']);
  });
});
