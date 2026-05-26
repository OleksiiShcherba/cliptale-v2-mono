import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockExecute } = vi.hoisted(() => ({ mockExecute: vi.fn() }));

vi.mock('@/db/connection.js', () => ({
  pool: { execute: mockExecute },
}));

import {
  createMusicGenerationJobMapping,
  listMusicBlocksByDraftId,
  releaseInactiveMusicGenerationLocks,
  setMusicGenerationJobOutput,
  toMusicGenerationStatus,
  updateMusicBlock,
  updateMusicGenerationJobStatus,
} from './storyboardMusic.repository.js';

const NOW = new Date('2026-05-26T08:00:00.000Z');

function makeMusicRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    draft_id: '00000000-0000-4000-8000-000000000010',
    name: 'Opening bed',
    source_mode: 'generate_on_step3',
    prompt: 'Warm instrumental pulse.',
    composition_plan_json: JSON.stringify({
      positive_global_styles: ['warm'],
      negative_global_styles: ['vocals'],
      sections: [{
        section_name: 'A',
        positive_local_styles: ['pulse'],
        negative_local_styles: [],
        duration_ms: 6000,
        lines: [],
      }],
    }),
    existing_file_id: null,
    start_scene_block_id: '00000000-0000-4000-8000-000000000020',
    end_scene_block_id: '00000000-0000-4000-8000-000000000021',
    position_x: 100,
    position_y: 520,
    sort_order: 0,
    volume: '0.8000',
    fade_in_s: '0.500',
    fade_out_s: '1.000',
    loop_mode: 'trim',
    generation_status: 'queued',
    generation_job_id: '00000000-0000-4000-8000-000000000030',
    output_file_id: null,
    error_message: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

describe('storyboardMusic.repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('translates AI job states into music generation states', () => {
    expect(toMusicGenerationStatus('queued')).toBe('queued');
    expect(toMusicGenerationStatus('processing')).toBe('running');
    expect(toMusicGenerationStatus('completed')).toBe('ready');
    expect(toMusicGenerationStatus('failed')).toBe('failed');
  });

  it('lists music blocks with latest generation status and parsed composition plans', async () => {
    mockExecute.mockResolvedValueOnce([[makeMusicRow()]]);

    const rows = await listMusicBlocksByDraftId('draft-1');

    expect(rows[0]).toMatchObject({
      name: 'Opening bed',
      sourceMode: 'generate_on_step3',
      volume: 0.8,
      fadeInS: 0.5,
      generationStatus: 'queued',
      generationJobId: '00000000-0000-4000-8000-000000000030',
    });
    expect(rows[0]!.compositionPlan?.sections[0]?.lines).toEqual([]);
    const [sql, params] = mockExecute.mock.calls[0] as [string, string[]];
    expect(sql).toContain('FROM storyboard_music_blocks mb');
    expect(sql).toContain('LEFT JOIN storyboard_music_generation_jobs latest');
    expect(sql).toContain('ORDER BY mb.sort_order ASC');
    expect(params).toEqual(['draft-1']);
  });

  it('updates editable music block fields by draft and id', async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }]);

    const updated = await updateMusicBlock({
      id: 'music-1',
      draftId: 'draft-1',
      patch: {
        name: 'Updated',
        sourceMode: 'existing',
        prompt: null,
        compositionPlan: null,
        existingFileId: 'file-1',
        startSceneBlockId: 'scene-1',
        endSceneBlockId: 'scene-2',
        positionX: 11,
        positionY: 22,
        sortOrder: 1,
        volume: 0.7,
        fadeInS: 0.5,
        fadeOutS: 1,
        loopMode: 'loop',
      },
    });

    expect(updated).toBe(true);
    const [sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('UPDATE storyboard_music_blocks');
    expect(sql).toContain('WHERE id = ? AND draft_id = ?');
    expect(params.at(-2)).toBe('music-1');
    expect(params.at(-1)).toBe('draft-1');
  });

  it('creates one active generation mapping per music block', async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }]);

    const inserted = await createMusicGenerationJobMapping({
      id: 'map-1',
      draftId: 'draft-1',
      musicBlockId: 'music-1',
      aiJobId: 'job-1',
    });

    expect(inserted).toBe(true);
    const [sql, params] = mockExecute.mock.calls[0] as [string, string[]];
    expect(sql).toContain('INSERT IGNORE INTO storyboard_music_generation_jobs');
    expect(sql).toContain('active_lock');
    expect(params).toEqual(['map-1', 'job-1', 'queued', 'music-1', 'draft-1']);
  });

  it('keeps only queued and running music jobs active', async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }]);

    await updateMusicGenerationJobStatus({
      aiJobId: 'job-1',
      status: 'failed',
      errorMessage: 'Provider failed.',
    });

    const [sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("WHEN ? IN ('queued', 'running') THEN 1");
    expect(params).toEqual(['failed', 'Provider failed.', 'failed', 'job-1']);
  });

  it('links an output file and releases the active lock for regeneration', async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }]);

    await setMusicGenerationJobOutput({ aiJobId: 'job-1', outputFileId: 'file-1' });

    const [sql, params] = mockExecute.mock.calls[0] as [string, string[]];
    expect(sql).toContain("SET status = 'ready'");
    expect(sql).toContain('active_lock = NULL');
    expect(params).toEqual(['file-1', 'job-1']);
  });

  it('clears stale ready or failed locks before inserting a new generation mapping', async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }]);

    await releaseInactiveMusicGenerationLocks({
      draftId: 'draft-1',
      musicBlockId: 'music-1',
    });

    const [sql, params] = mockExecute.mock.calls[0] as [string, string[]];
    expect(sql).toContain("status IN ('ready', 'failed')");
    expect(params).toEqual(['draft-1', 'music-1']);
  });
});
