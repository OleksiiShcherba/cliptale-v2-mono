import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockExecute } = vi.hoisted(() => ({ mockExecute: vi.fn() }));

vi.mock('@/db/connection.js', () => ({
  pool: { execute: mockExecute },
}));

import {
  createReferenceMapping,
  findActiveReferenceByDraftId,
  findLatestReferenceByDraftId,
  findReferenceByAiJobId,
  findReferenceById,
  setReferenceOutput,
  toStoryboardIllustrationReferenceStatus,
  updateReferenceStatus,
} from './storyboardIllustrationReference.repository.js';

const NOW = new Date('2026-05-14T10:00:00.000Z');

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    draft_id: '00000000-0000-4000-8000-000000000010',
    ai_job_id: '00000000-0000-4000-8000-000000000020',
    status: 'queued',
    output_file_id: null,
    source_reference_file_ids: ['00000000-0000-4000-8000-000000000030'],
    error_message: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

describe('storyboardIllustrationReference.repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('translates AI job states into reference states', () => {
    expect(toStoryboardIllustrationReferenceStatus('queued')).toBe('queued');
    expect(toStoryboardIllustrationReferenceStatus('processing')).toBe('running');
    expect(toStoryboardIllustrationReferenceStatus('completed')).toBe('ready');
    expect(toStoryboardIllustrationReferenceStatus('failed')).toBe('failed');
  });

  it('inserts an active draft-level reference mapping', async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }]);

    const inserted = await createReferenceMapping({
      id: 'ref-1',
      draftId: 'draft-1',
      aiJobId: 'job-1',
      sourceReferenceFileIds: ['file-1', 'file-2'],
    });

    const [sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(inserted).toBe(true);
    expect(sql).toContain('INSERT IGNORE INTO storyboard_illustration_references');
    expect(sql).toContain('active_lock');
    expect(params).toEqual([
      'ref-1',
      'draft-1',
      'job-1',
      'queued',
      JSON.stringify(['file-1', 'file-2']),
      'queued',
    ]);
  });

  it('reports when the active-draft guard skips insertion', async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 0 }]);

    const inserted = await createReferenceMapping({
      id: 'ref-1',
      draftId: 'draft-1',
      aiJobId: 'job-1',
      sourceReferenceFileIds: [],
    });

    expect(inserted).toBe(false);
  });

  it('maps MySQL JSON columns returned as strings', async () => {
    mockExecute.mockResolvedValueOnce([
      [
        makeRow({
          source_reference_file_ids: JSON.stringify(['file-1', 'file-2']),
        }),
      ],
    ]);

    const row = await findReferenceByAiJobId('job-1');

    expect(row!.sourceReferenceFileIds).toEqual(['file-1', 'file-2']);
  });

  it('maps MySQL JSON columns returned as parsed arrays', async () => {
    mockExecute.mockResolvedValueOnce([[makeRow({ source_reference_file_ids: ['file-1'] })]]);

    const row = await findReferenceByAiJobId('job-1');

    expect(row!.sourceReferenceFileIds).toEqual(['file-1']);
  });

  it('finds a reference by repository id', async () => {
    mockExecute.mockResolvedValueOnce([[makeRow({ status: 'running' })]]);

    const row = await findReferenceById('ref-1');

    expect(row).toMatchObject({ id: '00000000-0000-4000-8000-000000000001', status: 'running' });
    const [sql, params] = mockExecute.mock.calls[0] as [string, string[]];
    expect(sql).toContain('WHERE id = ?');
    expect(params).toEqual(['ref-1']);
  });

  it('finds a reference by AI job id', async () => {
    mockExecute.mockResolvedValueOnce([[makeRow({ ai_job_id: 'job-1' })]]);

    const row = await findReferenceByAiJobId('job-1');

    expect(row!.aiJobId).toBe('job-1');
    const [sql, params] = mockExecute.mock.calls[0] as [string, string[]];
    expect(sql).toContain('WHERE ai_job_id = ?');
    expect(params).toEqual(['job-1']);
  });

  it('returns null when no reference mapping is found', async () => {
    mockExecute.mockResolvedValueOnce([[]]);

    await expect(findReferenceByAiJobId('missing-job')).resolves.toBeNull();
  });

  it('finds the latest reference attempt for a draft', async () => {
    mockExecute.mockResolvedValueOnce([[makeRow({ id: 'latest-ref', status: 'failed' })]]);

    const row = await findLatestReferenceByDraftId('draft-1');

    expect(row!.id).toBe('latest-ref');
    const [sql, params] = mockExecute.mock.calls[0] as [string, string[]];
    expect(sql).toContain('WHERE draft_id = ?');
    expect(sql).toContain('ORDER BY created_at DESC, id DESC');
    expect(sql).toContain('LIMIT 1');
    expect(params).toEqual(['draft-1']);
  });

  it('finds the current active reference for a draft', async () => {
    mockExecute.mockResolvedValueOnce([[makeRow({ id: 'active-ref' })]]);

    const row = await findActiveReferenceByDraftId('draft-1');

    expect(row!.id).toBe('active-ref');
    const [sql, params] = mockExecute.mock.calls[0] as [string, string[]];
    expect(sql).toContain('AND active_lock = 1');
    expect(params).toEqual(['draft-1']);
  });

  it('updates failure status and clears active lock for retry', async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }]);

    await updateReferenceStatus({
      aiJobId: 'job-1',
      status: 'failed',
      errorMessage: 'Provider rejected the style prompt.',
    });

    const [sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('UPDATE storyboard_illustration_references');
    expect(sql).toContain('active_lock = CASE');
    expect(params).toEqual([
      'failed',
      'Provider rejected the style prompt.',
      'failed',
      'job-1',
    ]);
  });

  it('links output files and marks the reference ready', async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }]);

    await setReferenceOutput({
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
});
