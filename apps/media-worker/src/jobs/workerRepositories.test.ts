import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockExecute, mockQuery } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
  mockQuery: vi.fn(),
}));

vi.mock('@/lib/db.js', () => ({
  pool: {
    execute: mockExecute,
    query: mockQuery,
  },
}));

import {
  aiGenerationJobRepo,
  filesRepo,
  storyboardAiGenerationJobRepo,
  storyboardIllustrationRepo,
  storyboardImageFileReadRepo,
  storyboardReferenceRepo,
} from './workerRepositories.js';

describe('workerRepositories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates files in processing state and can mark them ready', async () => {
    mockExecute.mockResolvedValue([{ affectedRows: 1 }]);

    await filesRepo.createFile({
      fileId: 'file-1',
      userId: 'user-1',
      kind: 'image',
      storageUri: 's3://bucket/file.png',
      mimeType: 'image/png',
      bytes: 123,
      width: null,
      height: null,
      displayName: 'file.png',
    });
    await filesRepo.markReady?.('file-1');

    const [insertSql, insertParams] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(insertSql).toContain("VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'processing')");
    expect(insertParams).toEqual([
      'file-1',
      'user-1',
      'image',
      's3://bucket/file.png',
      'image/png',
      123,
      null,
      null,
      'file.png',
    ]);
    const [readySql, readyParams] = mockExecute.mock.calls[1] as [string, unknown[]];
    expect(readySql).toContain("SET status = 'ready'");
    expect(readyParams).toEqual(['file-1']);
  });

  it('marks AI jobs completed and links draft files when draft_id exists', async () => {
    mockExecute
      .mockResolvedValueOnce([[{ draft_id: 'draft-1' }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    await aiGenerationJobRepo.setOutputFile('job-1', 'file-1');

    expect(mockExecute).toHaveBeenCalledTimes(3);
    expect(mockExecute.mock.calls[1][0]).toContain("SET status = 'completed'");
    expect(mockExecute.mock.calls[1][1]).toEqual(['file-1', 'job-1']);
    expect(mockExecute.mock.calls[2][0]).toContain('INSERT IGNORE INTO draft_files');
    expect(mockExecute.mock.calls[2][1]).toEqual(['draft-1', 'file-1']);
  });

  it('marks storyboard AI jobs failed with sanitized worker errors', async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }]);

    await storyboardAiGenerationJobRepo.markFailed('job-1', 'safe failure');

    const [sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("SET status = 'failed'");
    expect(sql).toContain('error_message = ?');
    expect(params).toEqual(['safe failure', 'job-1']);
  });

  it('filters storyboard image references by user, image kind, non-deleted status, and requested ids', async () => {
    mockQuery.mockResolvedValueOnce([
      [
        {
          file_id: 'file-1',
          storage_uri: 's3://bucket/ref.png',
          mime_type: 'image/png',
          display_name: 'ref.png',
        },
        {
          file_id: 'file-2',
          storage_uri: 's3://bucket/no-mime.png',
          mime_type: null,
          display_name: 'no-mime.png',
        },
      ],
    ]);

    const rows = await storyboardImageFileReadRepo.findFilesByIds({
      userId: 'user-1',
      fileIds: ['file-1', 'file-2'],
    });

    expect(rows).toEqual([
      {
        fileId: 'file-1',
        storageUri: 's3://bucket/ref.png',
        mimeType: 'image/png',
        displayName: 'ref.png',
      },
    ]);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('WHERE user_id = ?');
    expect(sql).toContain("AND kind = 'image'");
    expect(sql).toContain('AND deleted_at IS NULL');
    expect(sql).toContain('file_id IN (?,?)');
    expect(params).toEqual(['user-1', 'file-1', 'file-2']);
  });

  it('updates storyboard reference ready and failed states', async () => {
    mockExecute.mockResolvedValue([{ affectedRows: 1 }]);

    await storyboardReferenceRepo.setOutput({
      aiJobId: 'job-1',
      outputFileId: 'file-1',
    });
    await storyboardReferenceRepo.markFailed('job-2', 'failed safely');

    const [readySql, readyParams] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(readySql).toContain("SET status = 'ready'");
    expect(readySql).toContain('active_lock = 1');
    expect(readyParams).toEqual(['file-1', 'job-1']);

    const [failedSql, failedParams] = mockExecute.mock.calls[1] as [string, unknown[]];
    expect(failedSql).toContain("SET status = 'failed'");
    expect(failedSql).toContain('active_lock = NULL');
    expect(failedParams).toEqual(['failed safely', 'job-2']);
  });

  it('updates storyboard scene mappings and idempotently attaches generated media', async () => {
    mockExecute.mockResolvedValue([{ affectedRows: 1 }]);

    await storyboardIllustrationRepo.attachOutputToBlock({
      id: 'media-1',
      aiJobId: 'job-1',
      outputFileId: 'file-1',
    });

    expect(mockExecute).toHaveBeenCalledTimes(2);
    const [readySql, readyParams] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(readySql).toContain('UPDATE storyboard_scene_illustration_jobs');
    expect(readySql).toContain("SET status = 'ready'");
    expect(readySql).toContain('output_file_id = ?');
    expect(readyParams).toEqual(['file-1', 'job-1']);

    const [attachSql, attachParams] = mockExecute.mock.calls[1] as [string, unknown[]];
    expect(attachSql).toContain('INSERT INTO storyboard_block_media');
    expect(attachSql).toContain('SELECT ?, sj.block_id, ?,');
    expect(attachSql).toContain('NOT EXISTS');
    expect(attachSql).toContain('duplicate.file_id = ?');
    expect(attachParams).toEqual(['media-1', 'file-1', 'job-1', 'file-1', 'file-1']);
  });

  it('marks storyboard scene mappings failed with sanitized worker errors', async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }]);

    await storyboardIllustrationRepo.markFailed('job-1', 'scene failed safely');

    const [sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('UPDATE storyboard_scene_illustration_jobs');
    expect(sql).toContain("SET status = 'failed'");
    expect(sql).toContain('error_message = ?');
    expect(params).toEqual(['scene failed safely', 'job-1']);
  });
});
