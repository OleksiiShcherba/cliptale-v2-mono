/**
 * Unit tests for `updateAssetDisplayName` and the `displayName` field added
 * to `mapRowToAsset` + the `Asset` / `AssetRow` types in asset.repository.ts.
 *
 * All external dependencies (`pool`) are mocked so no real DB is needed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ResultSetHeader } from 'mysql2/promise';

// ── Mock the DB connection pool ──────────────────────────────────────────────
// Use vi.hoisted so the variable is available when the vi.mock factory runs.
const { mockExecute } = vi.hoisted(() => ({ mockExecute: vi.fn() }));

vi.mock('@/db/connection.js', () => ({
  pool: { execute: mockExecute },
}));

import {
  getAssetById,
  updateAssetDisplayName,
  type Asset,
} from './asset.repository.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Builds a minimal AssetRow as returned by mysql2. */
function makeAssetRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    asset_id: 'asset-uuid-001',
    project_id: 'proj-uuid-001',
    user_id: 'user-uuid-001',
    filename: 'original.mp4',
    display_name: null,
    content_type: 'video/mp4',
    file_size_bytes: 1_024,
    storage_uri: 's3://bucket/original.mp4',
    status: 'ready',
    error_message: null,
    duration_frames: 300,
    width: 1920,
    height: 1080,
    fps: 30,
    thumbnail_uri: null,
    waveform_json: null,
    created_at: new Date('2024-01-01T00:00:00Z'),
    updated_at: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

// ── mapRowToAsset via getAssetById ───────────────────────────────────────────
// We test the mapping indirectly through `getAssetById` because `mapRowToAsset`
// is a private (unexported) function.

describe('asset.repository — displayName field mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets displayName to null when display_name column is NULL', async () => {
    const row = makeAssetRow({ display_name: null });
    mockExecute.mockResolvedValueOnce([[row], []]);

    const asset = await getAssetById('asset-uuid-001');

    expect(asset).not.toBeNull();
    expect((asset as Asset).displayName).toBeNull();
  });

  it('sets displayName to the stored string when display_name is non-null', async () => {
    const row = makeAssetRow({ display_name: 'My Holiday Reel' });
    mockExecute.mockResolvedValueOnce([[row], []]);

    const asset = await getAssetById('asset-uuid-001');

    expect(asset).not.toBeNull();
    expect((asset as Asset).displayName).toBe('My Holiday Reel');
  });

  it('includes displayName in the returned Asset alongside filename', async () => {
    const row = makeAssetRow({ filename: 'raw.mp4', display_name: 'Polished Cut' });
    mockExecute.mockResolvedValueOnce([[row], []]);

    const asset = await getAssetById('asset-uuid-001');

    expect(asset).not.toBeNull();
    expect((asset as Asset).filename).toBe('raw.mp4');
    expect((asset as Asset).displayName).toBe('Polished Cut');
  });
});

// ── updateAssetDisplayName ───────────────────────────────────────────────────

describe('asset.repository — updateAssetDisplayName', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('executes a parameterized UPDATE with the provided display name', async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 } as ResultSetHeader, []]);

    await updateAssetDisplayName('asset-uuid-001', 'New Name');

    expect(mockExecute).toHaveBeenCalledOnce();
    const [sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/UPDATE\s+project_assets_current/i);
    expect(sql).toMatch(/SET\s+display_name\s*=/i);
    expect(params).toEqual(['New Name', 'asset-uuid-001']);
  });

  it('passes NULL when displayName argument is null (clears the name)', async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 } as ResultSetHeader, []]);

    await updateAssetDisplayName('asset-uuid-001', null);

    const [, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(params[0]).toBeNull();
  });

  it('scopes the UPDATE to the given fileId', async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 0 } as ResultSetHeader, []]);

    await updateAssetDisplayName('target-asset-id', 'A Name');

    const [, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(params[1]).toBe('target-asset-id');
  });

  it('resolves void even when no row matches (silent no-op)', async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 0 } as ResultSetHeader, []]);

    await expect(updateAssetDisplayName('nonexistent-id', 'Name')).resolves.toBeUndefined();
  });

  it('propagates errors thrown by pool.execute', async () => {
    mockExecute.mockRejectedValueOnce(new Error('DB timeout'));

    await expect(updateAssetDisplayName('asset-uuid-001', 'Name')).rejects.toThrow('DB timeout');
  });
});
