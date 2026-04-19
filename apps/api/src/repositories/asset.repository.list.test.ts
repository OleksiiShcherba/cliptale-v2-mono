/**
 * Unit tests for `findReadyForUser` and `getReadyTotalsForUser` — the
 * repository layer behind the wizard gallery endpoint (`GET /assets`).
 *
 * Kept in a separate file from `asset.repository.test.ts` so each file
 * stays under the 300-line limit per architecture rules §9.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock('@/db/connection.js', () => ({
  pool: { query: mockQuery },
}));

import {
  findReadyForUser,
  getReadyTotalsForUser,
} from './asset.repository.js';

function makeRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    asset_id: 'asset-001',
    project_id: 'proj-001',
    user_id: 'user-001',
    filename: 'clip.mp4',
    display_name: null,
    content_type: 'video/mp4',
    file_size_bytes: 1_000_000,
    storage_uri: 's3://bucket/clip.mp4',
    status: 'ready',
    error_message: null,
    duration_frames: 300,
    width: 1920,
    height: 1080,
    fps: 30,
    thumbnail_uri: 's3://bucket/thumb.jpg',
    waveform_json: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('asset.repository / findReadyForUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValue([[], []]);
  });

  it('builds a base query filtering by status=ready and user_id with no MIME or cursor clauses', async () => {
    await findReadyForUser({ userId: 'user-001', limit: 24 });

    const [sql, values] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/WHERE\s+status\s*=\s*\?\s+AND\s+user_id\s*=\s*\?/i);
    expect(sql).not.toMatch(/content_type\s+LIKE/i);
    expect(sql).not.toMatch(/\(updated_at,\s*asset_id\)/i);
    expect(values).toEqual(['ready', 'user-001']);
  });

  it('adds the MIME prefix LIKE clause when mimePrefix is provided', async () => {
    await findReadyForUser({ userId: 'user-001', mimePrefix: 'video/', limit: 24 });

    const [sql, values] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/content_type\s+LIKE\s+\?/i);
    expect(values).toEqual(['ready', 'user-001', 'video/%']);
  });

  it('maps the image/ MIME prefix to the correct LIKE pattern', async () => {
    await findReadyForUser({ userId: 'user-001', mimePrefix: 'image/', limit: 24 });

    const [, values] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(values).toContain('image/%');
  });

  it('maps the audio/ MIME prefix to the correct LIKE pattern', async () => {
    await findReadyForUser({ userId: 'user-001', mimePrefix: 'audio/', limit: 24 });

    const [, values] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(values).toContain('audio/%');
  });

  it('adds a keyset seek clause binding the cursor (updatedAt, fileId) tuple', async () => {
    const cursorUpdatedAt = new Date('2026-02-15T12:00:00Z');
    await findReadyForUser({
      userId: 'user-001',
      cursor: { updatedAt: cursorUpdatedAt, fileId: 'cursor-id' },
      limit: 24,
    });

    const [sql, values] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/\(updated_at,\s*asset_id\)\s*<\s*\(\?,\s*\?\)/);
    expect(values).toEqual(['ready', 'user-001', cursorUpdatedAt, 'cursor-id']);
  });

  it('orders by updated_at DESC then asset_id DESC for stable pagination', async () => {
    await findReadyForUser({ userId: 'user-001', limit: 24 });

    const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/ORDER\s+BY\s+updated_at\s+DESC,\s*asset_id\s+DESC/i);
  });

  it('interpolates a clamped LIMIT into the SQL (not bound as a parameter)', async () => {
    await findReadyForUser({ userId: 'user-001', limit: 24 });

    const [sql, values] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/LIMIT\s+24/);
    expect(values).not.toContain(24);
  });

  it('clamps a limit above 100 down to 100', async () => {
    await findReadyForUser({ userId: 'user-001', limit: 999 });

    const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/LIMIT\s+100/);
  });

  it('clamps a non-positive limit up to 1', async () => {
    await findReadyForUser({ userId: 'user-001', limit: 0 });

    const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/LIMIT\s+1/);
  });

  it('floors a fractional limit before interpolating', async () => {
    await findReadyForUser({ userId: 'user-001', limit: 24.9 });

    const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/LIMIT\s+24/);
  });

  it('maps the returned rows to the camelCase Asset shape', async () => {
    mockQuery.mockResolvedValueOnce([[makeRow({ asset_id: 'a1', display_name: 'My Cut' })], []]);

    const result = await findReadyForUser({ userId: 'user-001', limit: 24 });

    expect(result).toHaveLength(1);
    expect(result[0]!.fileId).toBe('a1');
    expect(result[0]!.displayName).toBe('My Cut');
    expect(result[0]!.contentType).toBe('video/mp4');
  });

  it('returns an empty array when no rows match', async () => {
    mockQuery.mockResolvedValueOnce([[], []]);

    const result = await findReadyForUser({ userId: 'user-001', limit: 24 });

    expect(result).toEqual([]);
  });
});

describe('asset.repository / getReadyTotalsForUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queries per-bucket counts and bytes scoped to the user and status=ready', async () => {
    mockQuery.mockResolvedValueOnce([[], []]);

    await getReadyTotalsForUser('user-001');

    const [sql, values] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/WHERE\s+user_id\s*=\s*\?\s+AND\s+status\s*=\s*'ready'/i);
    expect(sql).toMatch(/GROUP\s+BY\s+mime_prefix/i);
    expect(sql).toMatch(/COUNT\(\*\)/i);
    expect(sql).toMatch(/SUM\(file_size_bytes\)/i);
    expect(values).toEqual(['user-001']);
  });

  it('returns per-bucket rows with numeric count and bytes', async () => {
    mockQuery.mockResolvedValueOnce([
      [
        { mime_prefix: 'video/', count: 5, bytes: '1000' },
        { mime_prefix: 'image/', count: 2, bytes: '300' },
      ],
      [],
    ]);

    const result = await getReadyTotalsForUser('user-001');

    expect(result).toEqual([
      { mimePrefix: 'video/', count: 5, bytes: 1000 },
      { mimePrefix: 'image/', count: 2, bytes: 300 },
    ]);
  });

  it('coerces a decimal-string bytes sum (mysql2 default for BIGINT SUM) to a number', async () => {
    mockQuery.mockResolvedValueOnce([
      [{ mime_prefix: 'video/', count: 1, bytes: '99999999999' }],
      [],
    ]);

    const result = await getReadyTotalsForUser('user-001');

    expect(result[0]!.bytes).toBe(99999999999);
    expect(typeof result[0]!.bytes).toBe('number');
  });

  it('treats a NULL bytes sum as zero (empty bucket)', async () => {
    mockQuery.mockResolvedValueOnce([
      [{ mime_prefix: 'audio/', count: 0, bytes: null }],
      [],
    ]);

    const result = await getReadyTotalsForUser('user-001');

    expect(result[0]!.bytes).toBe(0);
  });

  it('filters out rows whose mime_prefix bucket is NULL (content types that do not match any known bucket)', async () => {
    mockQuery.mockResolvedValueOnce([
      [
        { mime_prefix: 'video/', count: 3, bytes: 500 },
        { mime_prefix: null, count: 1, bytes: 100 },
      ],
      [],
    ]);

    const result = await getReadyTotalsForUser('user-001');

    expect(result).toHaveLength(1);
    expect(result[0]!.mimePrefix).toBe('video/');
  });

  it('returns an empty array when the user has no ready assets', async () => {
    mockQuery.mockResolvedValueOnce([[], []]);

    const result = await getReadyTotalsForUser('user-001');

    expect(result).toEqual([]);
  });
});
