/**
 * Cursor pagination tests for `asset.list.service`.
 *
 * Split out of `asset.list.service.test.ts` to keep each file under the
 * 300-line limit. Shared fixtures live in `asset.list.service.fixtures.ts`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { ValidationError } from '@/lib/errors.js';

import { BASE_URL, USER_ID, makeAsset } from './asset.list.service.fixtures.js';

const { mockFindReady, mockGetTotals } = vi.hoisted(() => ({
  mockFindReady: vi.fn(),
  mockGetTotals: vi.fn(),
}));

vi.mock('@/repositories/asset.repository.js', () => ({
  findReadyForUser: mockFindReady,
  getReadyTotalsForUser: mockGetTotals,
}));

import { listForUser } from './asset.list.service.js';

describe('asset.list.service / cursor pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTotals.mockResolvedValue([]);
  });

  it('returns a non-null nextCursor when the page is full', async () => {
    const rows = Array.from({ length: 3 }, (_, i) =>
      makeAsset({
        fileId: `asset-${i}`,
        updatedAt: new Date(`2026-01-0${i + 1}T00:00:00Z`),
      }),
    );
    mockFindReady.mockResolvedValueOnce(rows);

    const result = await listForUser({
      userId: USER_ID,
      type: 'all',
      limit: 3,
      baseUrl: BASE_URL,
    });

    expect(result.nextCursor).not.toBeNull();
  });

  it('returns null nextCursor when fewer than limit rows come back', async () => {
    mockFindReady.mockResolvedValueOnce([makeAsset()]);

    const result = await listForUser({
      userId: USER_ID,
      type: 'all',
      limit: 10,
      baseUrl: BASE_URL,
    });

    expect(result.nextCursor).toBeNull();
  });

  it('round-trips a cursor — next call passes the decoded (updatedAt, fileId) to the repo', async () => {
    const firstPageLastRow = makeAsset({
      fileId: 'cursor-id',
      updatedAt: new Date('2026-02-15T12:00:00Z'),
    });
    mockFindReady.mockResolvedValueOnce([firstPageLastRow]);

    const firstPage = await listForUser({
      userId: USER_ID,
      type: 'all',
      limit: 1,
      baseUrl: BASE_URL,
    });

    expect(firstPage.nextCursor).not.toBeNull();

    mockFindReady.mockResolvedValueOnce([]);
    await listForUser({
      userId: USER_ID,
      type: 'all',
      cursor: firstPage.nextCursor!,
      limit: 1,
      baseUrl: BASE_URL,
    });

    const secondCallParams = mockFindReady.mock.calls[1]![0];
    expect(secondCallParams.cursor.fileId).toBe('cursor-id');
    expect(secondCallParams.cursor.updatedAt.toISOString()).toBe('2026-02-15T12:00:00.000Z');
  });

  it('throws ValidationError on a malformed cursor', async () => {
    await expect(
      listForUser({
        userId: USER_ID,
        type: 'all',
        cursor: 'not-a-valid-cursor',
        limit: 24,
        baseUrl: BASE_URL,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
