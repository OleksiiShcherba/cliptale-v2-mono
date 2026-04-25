/**
 * Unit tests for the `thumbnail_uri` field and `setThumbnailUri` function added
 * to file.repository.ts in C2.
 *
 * Split from file.repository.softdelete.test.ts (which is already near 300 lines)
 * per architecture-rules §9.7.
 *
 * All DB calls are mocked — no real database needed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Pool mock — hoisted so it is available when vi.mock factory runs ──────────

const { mockExecute } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
}));

vi.mock('@/db/connection.js', () => ({
  pool: { execute: mockExecute, query: mockExecute },
}));

import { findById, setThumbnailUri } from './file.repository.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeDbRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    file_id: 'file-uuid-001',
    user_id: 'user-uuid-001',
    kind: 'video',
    storage_uri: 's3://bucket/video.mp4',
    mime_type: 'video/mp4',
    bytes: 1_000_000,
    width: 1920,
    height: 1080,
    duration_ms: 5000,
    display_name: 'My Video',
    status: 'ready',
    error_message: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    deleted_at: null,
    thumbnail_uri: null,
    ...overrides,
  };
}

// ── thumbnailUri field mapping ────────────────────────────────────────────────

describe('file.repository — thumbnailUri field mapping', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps thumbnail_uri string to thumbnailUri in returned FileRow', async () => {
    const uri = 's3://bucket/thumbnails/file-uuid-001.jpg';
    mockExecute.mockResolvedValueOnce([[makeDbRow({ thumbnail_uri: uri })], []]);

    const result = await findById('file-uuid-001');

    expect(result!.thumbnailUri).toBe(uri);
  });

  it('maps null thumbnail_uri to null thumbnailUri', async () => {
    mockExecute.mockResolvedValueOnce([[makeDbRow({ thumbnail_uri: null })], []]);

    const result = await findById('file-uuid-001');

    expect(result!.thumbnailUri).toBeNull();
  });

  it('maps absent thumbnail_uri (pre-migration row) to null thumbnailUri', async () => {
    // Rows written before migration 030 will not have thumbnail_uri in their result set.
    const rowWithoutThumbnail = makeDbRow();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (rowWithoutThumbnail as any).thumbnail_uri;
    mockExecute.mockResolvedValueOnce([[rowWithoutThumbnail], []]);

    const result = await findById('file-uuid-001');

    expect(result!.thumbnailUri).toBeNull();
  });
});

// ── setThumbnailUri ───────────────────────────────────────────────────────────

describe('file.repository — setThumbnailUri', () => {
  beforeEach(() => vi.clearAllMocks());

  it('executes UPDATE files SET thumbnail_uri = ? WHERE file_id = ?', async () => {
    mockExecute.mockResolvedValueOnce([[], []]);

    await setThumbnailUri('file-uuid-001', 's3://bucket/thumbnails/file-uuid-001.jpg');

    const [sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('UPDATE files SET thumbnail_uri');
    expect(params).toEqual(['s3://bucket/thumbnails/file-uuid-001.jpg', 'file-uuid-001']);
  });

  it('places thumbnail_uri as the first bound param and file_id as the second', async () => {
    mockExecute.mockResolvedValueOnce([[], []]);
    const uri = 's3://test-bucket/thumbnails/abc.jpg';

    await setThumbnailUri('abc', uri);

    const params = mockExecute.mock.calls[0]![1] as unknown[];
    expect(params[0]).toBe(uri);
    expect(params[1]).toBe('abc');
  });

  it('accepts null to clear the thumbnail_uri field', async () => {
    mockExecute.mockResolvedValueOnce([[], []]);

    await setThumbnailUri('file-uuid-001', null);

    const params = mockExecute.mock.calls[0]![1] as unknown[];
    expect(params[0]).toBeNull();
    expect(params[1]).toBe('file-uuid-001');
  });
});
