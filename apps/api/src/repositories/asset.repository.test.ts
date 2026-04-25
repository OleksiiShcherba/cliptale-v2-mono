/**
 * Unit tests for `getAssetById`, `updateAssetDisplayName`, and the `mapRowToAsset`
 * mapping logic in asset.repository.ts.
 *
 * After the Files-as-Root migration (2026-04-19), `asset.repository.ts` reads from
 * `files LEFT JOIN project_files`. The row shape used by `makeAssetRow()` below
 * reflects the new joined schema.
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

/**
 * Builds a minimal `files LEFT JOIN project_files` row as returned by mysql2.
 * `project_id` comes from the pivot and may be null.
 */
function makeAssetRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    file_id: 'file-uuid-001',
    project_id: 'proj-uuid-001',
    user_id: 'user-uuid-001',
    display_name: null,
    mime_type: 'video/mp4',
    bytes: 1_024,
    storage_uri: 's3://bucket/original.mp4',
    status: 'ready',
    error_message: null,
    duration_ms: 10_000, // 10 seconds ≈ 300 frames at 30fps
    width: 1920,
    height: 1080,
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

    const asset = await getAssetById('file-uuid-001');

    expect(asset).not.toBeNull();
    expect((asset as Asset).displayName).toBeNull();
  });

  it('sets displayName to the stored string when display_name is non-null', async () => {
    const row = makeAssetRow({ display_name: 'My Holiday Reel' });
    mockExecute.mockResolvedValueOnce([[row], []]);

    const asset = await getAssetById('file-uuid-001');

    expect(asset).not.toBeNull();
    expect((asset as Asset).displayName).toBe('My Holiday Reel');
  });

  it('uses display_name as the filename substitute when it is set', async () => {
    const row = makeAssetRow({ display_name: 'Polished Cut' });
    mockExecute.mockResolvedValueOnce([[row], []]);

    const asset = await getAssetById('file-uuid-001');

    expect(asset).not.toBeNull();
    expect((asset as Asset).filename).toBe('Polished Cut');
    expect((asset as Asset).displayName).toBe('Polished Cut');
  });

  it('falls back to file_id as filename when display_name is null', async () => {
    const row = makeAssetRow({ file_id: 'file-uuid-fallback', display_name: null });
    mockExecute.mockResolvedValueOnce([[row], []]);

    const asset = await getAssetById('file-uuid-fallback');

    expect(asset).not.toBeNull();
    expect((asset as Asset).filename).toBe('file-uuid-fallback');
  });
});

// ── getAssetById field mapping ───────────────────────────────────────────────

describe('asset.repository — getAssetById field mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when no row matches the fileId', async () => {
    mockExecute.mockResolvedValueOnce([[], []]);

    const result = await getAssetById('nonexistent-id');

    expect(result).toBeNull();
  });

  it('maps file_id to fileId', async () => {
    const row = makeAssetRow({ file_id: 'my-file-id' });
    mockExecute.mockResolvedValueOnce([[row], []]);

    const asset = await getAssetById('my-file-id');

    expect(asset!.fileId).toBe('my-file-id');
  });

  it('maps project_id from the LEFT JOIN to projectId', async () => {
    const row = makeAssetRow({ project_id: 'my-project-id' });
    mockExecute.mockResolvedValueOnce([[row], []]);

    const asset = await getAssetById('file-uuid-001');

    expect(asset!.projectId).toBe('my-project-id');
  });

  it('maps a null project_id (no project link) to an empty string', async () => {
    const row = makeAssetRow({ project_id: null });
    mockExecute.mockResolvedValueOnce([[row], []]);

    const asset = await getAssetById('file-uuid-001');

    expect(asset!.projectId).toBe('');
  });

  it('maps mime_type to contentType', async () => {
    const row = makeAssetRow({ mime_type: 'image/png' });
    mockExecute.mockResolvedValueOnce([[row], []]);

    const asset = await getAssetById('file-uuid-001');

    expect(asset!.contentType).toBe('image/png');
  });

  it('maps bytes to fileSizeBytes and coerces string (BIGINT) to number', async () => {
    const row = makeAssetRow({ bytes: '999999' });
    mockExecute.mockResolvedValueOnce([[row], []]);

    const asset = await getAssetById('file-uuid-001');

    expect(asset!.fileSizeBytes).toBe(999999);
    expect(typeof asset!.fileSizeBytes).toBe('number');
  });

  it('maps null bytes to 0', async () => {
    const row = makeAssetRow({ bytes: null });
    mockExecute.mockResolvedValueOnce([[row], []]);

    const asset = await getAssetById('file-uuid-001');

    expect(asset!.fileSizeBytes).toBe(0);
  });

  it('converts duration_ms to approximate durationFrames at 30fps', async () => {
    // 10 000 ms = 10 s × 30 fps = 300 frames
    const row = makeAssetRow({ duration_ms: 10_000 });
    mockExecute.mockResolvedValueOnce([[row], []]);

    const asset = await getAssetById('file-uuid-001');

    expect(asset!.durationFrames).toBe(300);
  });

  it('maps null duration_ms to null durationFrames', async () => {
    const row = makeAssetRow({ duration_ms: null });
    mockExecute.mockResolvedValueOnce([[row], []]);

    const asset = await getAssetById('file-uuid-001');

    expect(asset!.durationFrames).toBeNull();
  });

  it('maps thumbnail_uri string to thumbnailUri when present (migration 030)', async () => {
    const uri = 's3://bucket/thumbnails/file-uuid-001.jpg';
    const row = makeAssetRow({ thumbnail_uri: uri });
    mockExecute.mockResolvedValueOnce([[row], []]);

    const asset = await getAssetById('file-uuid-001');

    expect(asset!.thumbnailUri).toBe(uri);
  });

  it('maps null thumbnail_uri to null thumbnailUri', async () => {
    const row = makeAssetRow({ thumbnail_uri: null });
    mockExecute.mockResolvedValueOnce([[row], []]);

    const asset = await getAssetById('file-uuid-001');

    expect(asset!.thumbnailUri).toBeNull();
  });

  it('maps absent thumbnail_uri (pre-migration row) to null thumbnailUri', async () => {
    // Rows written before migration 030 will not have thumbnail_uri in the result set.
    const row = makeAssetRow();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (row as any).thumbnail_uri;
    mockExecute.mockResolvedValueOnce([[row], []]);

    const asset = await getAssetById('file-uuid-001');

    expect(asset!.thumbnailUri).toBeNull();
  });

  it('sets fps to null (no fps column on files)', async () => {
    const row = makeAssetRow();
    mockExecute.mockResolvedValueOnce([[row], []]);

    const asset = await getAssetById('file-uuid-001');

    expect(asset!.fps).toBeNull();
  });

  it('sets waveformJson to null (no waveform_json column on files)', async () => {
    const row = makeAssetRow();
    mockExecute.mockResolvedValueOnce([[row], []]);

    const asset = await getAssetById('file-uuid-001');

    expect(asset!.waveformJson).toBeNull();
  });
});

// ── updateAssetDisplayName ───────────────────────────────────────────────────

describe('asset.repository — updateAssetDisplayName', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('executes a parameterized UPDATE on the files table with the provided display name', async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 } as ResultSetHeader, []]);

    await updateAssetDisplayName('file-uuid-001', 'New Name');

    expect(mockExecute).toHaveBeenCalledOnce();
    const [sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/UPDATE\s+files/i);
    expect(sql).toMatch(/SET\s+display_name\s*=/i);
    expect(params).toEqual(['New Name', 'file-uuid-001']);
  });

  it('passes NULL when displayName argument is null (clears the name)', async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 } as ResultSetHeader, []]);

    await updateAssetDisplayName('file-uuid-001', null);

    const [, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(params[0]).toBeNull();
  });

  it('scopes the UPDATE to the given fileId', async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 0 } as ResultSetHeader, []]);

    await updateAssetDisplayName('target-file-id', 'A Name');

    const [, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(params[1]).toBe('target-file-id');
  });

  it('resolves void even when no row matches (silent no-op)', async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 0 } as ResultSetHeader, []]);

    await expect(updateAssetDisplayName('nonexistent-id', 'Name')).resolves.toBeUndefined();
  });

  it('propagates errors thrown by pool.execute', async () => {
    mockExecute.mockRejectedValueOnce(new Error('DB timeout'));

    await expect(updateAssetDisplayName('file-uuid-001', 'Name')).rejects.toThrow('DB timeout');
  });
});
