import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockExecute } = vi.hoisted(() => ({ mockExecute: vi.fn() }));

vi.mock('@/db/connection.js', () => ({
  pool: { execute: mockExecute },
}));

import {
  attachIllustrationOutputToBlock,
  createIllustrationJobMapping,
  findIllustrationJobByAiJobId,
  findIllustrationJobById,
  findLatestIllustrationJobsByDraftId,
  findLatestIllustrationJobByBlockId,
  listIllustrationJobsByDraftId,
  setIllustrationJobOutput,
  toSceneIllustrationStatus,
  updateIllustrationJobStatus,
} from './storyboardSceneIllustration.repository.js';

const NOW = new Date('2026-05-14T08:00:00.000Z');

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    draft_id: '00000000-0000-4000-8000-000000000010',
    block_id: '00000000-0000-4000-8000-000000000020',
    ai_job_id: '00000000-0000-4000-8000-000000000030',
    status: 'queued',
    output_file_id: null,
    error_message: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

describe('storyboardSceneIllustration.repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('translates AI job states into scene illustration states', () => {
    expect(toSceneIllustrationStatus('queued')).toBe('queued');
    expect(toSceneIllustrationStatus('processing')).toBe('running');
    expect(toSceneIllustrationStatus('completed')).toBe('ready');
    expect(toSceneIllustrationStatus('failed')).toBe('failed');
  });

  it('inserts a mapping only for scene blocks scoped to the given draft', async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }]);

    const inserted = await createIllustrationJobMapping({
      id: 'map-1',
      draftId: 'draft-1',
      blockId: 'block-1',
      aiJobId: 'job-1',
    });

    const [sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(inserted).toBe(true);
    expect(sql).toContain('INSERT IGNORE INTO storyboard_scene_illustration_jobs');
    expect(sql).toContain('FROM storyboard_blocks sb');
    expect(sql).toContain("sb.block_type = 'scene'");
    expect(sql).toContain('active_lock');
    expect(params).toEqual(['map-1', 'job-1', 'queued', 'block-1', 'draft-1']);
  });

  it('reports when the active-block guard skips mapping insertion', async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 0 }]);

    const inserted = await createIllustrationJobMapping({
      id: 'map-1',
      draftId: 'draft-1',
      blockId: 'block-1',
      aiJobId: 'job-1',
    });

    expect(inserted).toBe(false);
  });

  it('lists mappings for one draft in creation order', async () => {
    mockExecute.mockResolvedValueOnce([[makeRow({ id: 'map-1' }), makeRow({ id: 'map-2' })]]);

    const rows = await listIllustrationJobsByDraftId('draft-1');

    expect(rows.map((row) => row.id)).toEqual(['map-1', 'map-2']);
    const [sql, params] = mockExecute.mock.calls[0] as [string, string[]];
    expect(sql).toContain('WHERE draft_id = ?');
    expect(sql).toContain('ORDER BY created_at ASC, id ASC');
    expect(params).toEqual(['draft-1']);
  });

  it('finds a mapping by repository id', async () => {
    mockExecute.mockResolvedValueOnce([[makeRow({ status: 'running' })]]);

    const row = await findIllustrationJobById('map-1');

    expect(row).toMatchObject({ id: '00000000-0000-4000-8000-000000000001', status: 'running' });
    const [sql, params] = mockExecute.mock.calls[0] as [string, string[]];
    expect(sql).toContain('WHERE id = ?');
    expect(params).toEqual(['map-1']);
  });

  it('finds a mapping by AI job id', async () => {
    mockExecute.mockResolvedValueOnce([[makeRow({ ai_job_id: 'job-1' })]]);

    const row = await findIllustrationJobByAiJobId('job-1');

    expect(row!.aiJobId).toBe('job-1');
    const [sql, params] = mockExecute.mock.calls[0] as [string, string[]];
    expect(sql).toContain('WHERE ai_job_id = ?');
    expect(params).toEqual(['job-1']);
  });

  it('returns null when no mapping is found', async () => {
    mockExecute.mockResolvedValueOnce([[]]);

    await expect(findIllustrationJobByAiJobId('missing-job')).resolves.toBeNull();
  });

  it('selects the latest attempt for a draft-scoped block', async () => {
    mockExecute.mockResolvedValueOnce([[makeRow({ id: 'latest-map', status: 'failed' })]]);

    const row = await findLatestIllustrationJobByBlockId({
      draftId: 'draft-1',
      blockId: 'block-1',
    });

    expect(row!.id).toBe('latest-map');
    const [sql, params] = mockExecute.mock.calls[0] as [string, string[]];
    expect(sql).toContain('WHERE draft_id = ?');
    expect(sql).toContain('AND block_id = ?');
    expect(sql).toContain('ORDER BY created_at DESC, id DESC');
    expect(sql).toContain('LIMIT 1');
    expect(params).toEqual(['draft-1', 'block-1']);
  });

  it('selects the latest attempt for every block in a draft', async () => {
    mockExecute.mockResolvedValueOnce([[makeRow({ id: 'latest-map', block_id: 'block-1' })]]);

    const rows = await findLatestIllustrationJobsByDraftId('draft-1');

    expect(rows.map((row) => row.id)).toEqual(['latest-map']);
    const [sql, params] = mockExecute.mock.calls[0] as [string, string[]];
    expect(sql).toContain('GROUP BY block_id');
    expect(sql).toContain('ORDER BY sj2.id DESC');
    expect(params).toEqual(['draft-1', 'draft-1']);
  });

  it('updates failure status and stores the provider error message', async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }]);

    await updateIllustrationJobStatus({
      aiJobId: 'job-1',
      status: 'failed',
      errorMessage: 'Provider rejected the image prompt.',
    });

    const [sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('UPDATE storyboard_scene_illustration_jobs');
    expect(sql).toContain('WHERE ai_job_id = ?');
    expect(sql).toContain('active_lock = CASE');
    expect(params).toEqual([
      'failed',
      'Provider rejected the image prompt.',
      'failed',
      'job-1',
    ]);
  });

  it('links output files and marks the mapping ready', async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }]);

    await setIllustrationJobOutput({
      aiJobId: 'job-1',
      outputFileId: 'file-1',
    });

    const [sql, params] = mockExecute.mock.calls[0] as [string, string[]];
    expect(sql).toContain("SET status = 'ready'");
    expect(sql).toContain('output_file_id = ?');
    expect(sql).toContain('error_message = NULL');
    expect(sql).toContain('active_lock = 1');
    expect(params).toEqual(['file-1', 'job-1']);
  });

  it('idempotently attaches output files to storyboard block media after existing media', async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }]).mockResolvedValueOnce([{ affectedRows: 1 }]);

    await attachIllustrationOutputToBlock({
      id: 'media-1',
      aiJobId: 'job-1',
      outputFileId: 'file-1',
    });

    expect(mockExecute).toHaveBeenCalledTimes(2);
    const [sql, params] = mockExecute.mock.calls[1] as [string, string[]];
    expect(sql).toContain('INSERT INTO storyboard_block_media');
    expect(sql).toContain('COALESCE(MAX(existing.sort_order) + 1, 0)');
    expect(sql).toContain('NOT EXISTS');
    expect(params).toEqual(['media-1', 'file-1', 'job-1', 'file-1', 'file-1']);
  });
});
