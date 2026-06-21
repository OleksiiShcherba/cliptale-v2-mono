/**
 * workerRepositories.attachedMedia.test.ts
 *
 * Unit tests for `sceneReferenceSelectionRepo.loadAttachedSceneMediaFileIds`
 * (Subtask 3 — Bug 2 independent half: reading a scene's directly-attached
 * image file IDs from `storyboard_block_media`).
 *
 * Run from apps/media-worker:
 *   npx vitest run src/jobs/workerRepositories.attachedMedia.test.ts
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}));

vi.mock('@/lib/db.js', () => ({
  pool: {
    execute: vi.fn(),
    query: mockQuery,
  },
}));

import { sceneReferenceSelectionRepo } from './workerRepositories.js';

describe('sceneReferenceSelectionRepo.loadAttachedSceneMediaFileIds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns image file_ids in sort_order when the block has attached image media', async () => {
    mockQuery.mockResolvedValueOnce([
      [
        { file_id: 'file-img-1' },
        { file_id: 'file-img-2' },
      ],
    ]);

    const result = await sceneReferenceSelectionRepo.loadAttachedSceneMediaFileIds('block-1');

    expect(result).toEqual(['file-img-1', 'file-img-2']);

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('FROM storyboard_block_media');
    expect(sql).toContain("media_type = 'image'");
    expect(sql).toContain('ORDER BY m.sort_order ASC');
    expect(sql).toContain('m.file_id IS NOT NULL');
    expect(params).toEqual(['block-1']);
  });

  it('returns [] when the block has no attached image media', async () => {
    mockQuery.mockResolvedValueOnce([[]]);

    const result = await sceneReferenceSelectionRepo.loadAttachedSceneMediaFileIds('block-empty');

    expect(result).toEqual([]);

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('m.block_id = ?');
    expect(params).toEqual(['block-empty']);
  });

  it('excludes non-image media types — only rows with media_type=image are returned', async () => {
    // The SQL already filters by media_type='image'; this test verifies the WHERE clause
    // is present (the mock returns only what passes the filter).
    mockQuery.mockResolvedValueOnce([
      [{ file_id: 'file-img-only' }],
    ]);

    const result = await sceneReferenceSelectionRepo.loadAttachedSceneMediaFileIds('block-mixed');

    expect(result).toEqual(['file-img-only']);
    const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];
    // Both filter clauses must appear in the query
    expect(sql).toContain("media_type = 'image'");
    expect(sql).toContain('m.block_id = ?');
  });

  it('excludes NULL file_id rows — only non-null file_ids are returned', async () => {
    // migration 061 made file_id nullable for motion_graphic placeholder rows;
    // a NULL file_id image row must be excluded at the SQL level.
    mockQuery.mockResolvedValueOnce([
      [{ file_id: 'file-real' }],
    ]);

    const result = await sceneReferenceSelectionRepo.loadAttachedSceneMediaFileIds('block-with-null');

    expect(result).toEqual(['file-real']);
    const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('m.file_id IS NOT NULL');
  });

  it('queries the block only by blockId — no user-scoping leak', async () => {
    mockQuery.mockResolvedValueOnce([[{ file_id: 'f1' }]]);

    await sceneReferenceSelectionRepo.loadAttachedSceneMediaFileIds('block-scope-check');

    const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    // Only one bind parameter: blockId
    expect(params).toHaveLength(1);
    expect(params[0]).toBe('block-scope-check');
  });

  it('excludes scene-illustration output file_ids — SQL contains the NOT IN subquery', async () => {
    // The subquery must reference storyboard_scene_illustration_jobs and filter
    // on both block_id and output_file_id IS NOT NULL.
    mockQuery.mockResolvedValueOnce([[]]);

    await sceneReferenceSelectionRepo.loadAttachedSceneMediaFileIds('block-with-outputs');

    const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('NOT IN');
    expect(sql).toContain('storyboard_scene_illustration_jobs');
    expect(sql).toContain('j.output_file_id');
    expect(sql).toContain('j.output_file_id IS NOT NULL');
    expect(sql).toContain('j.block_id = m.block_id');
  });

  it('returns [] when all block_media images are scene-illustration outputs', async () => {
    // The DB-side NOT IN subquery excludes all generated renders;
    // the mock simulates the query returning an empty result set.
    mockQuery.mockResolvedValueOnce([[]]);

    const result = await sceneReferenceSelectionRepo.loadAttachedSceneMediaFileIds('block-all-generated');

    expect(result).toEqual([]);
  });

  it('returns only genuine attachment when mixed with illustration outputs', async () => {
    // The DB-side NOT IN subquery excludes generated file_ids;
    // the mock simulates the query returning only the genuine attachment.
    mockQuery.mockResolvedValueOnce([
      [{ file_id: 'user-uploaded-file' }],
    ]);

    const result = await sceneReferenceSelectionRepo.loadAttachedSceneMediaFileIds('block-mixed-real-and-gen');

    expect(result).toEqual(['user-uploaded-file']);
  });
});
