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
  castExtractJobRepo,
  filesRepo,
  sceneReferenceSelectionRepo,
  storyboardAiGenerationJobRepo,
  storyboardIllustrationRepo,
  storyboardImageFileReadRepo,
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

    expect(mockExecute).toHaveBeenCalledTimes(5);
    expect(mockExecute.mock.calls[1][0]).toContain("SET status = 'completed'");
    expect(mockExecute.mock.calls[1][1]).toEqual(['file-1', 'job-1']);
    expect(mockExecute.mock.calls[2][0]).toContain('UPDATE storyboard_scene_video_jobs');
    expect(mockExecute.mock.calls[2][0]).toContain("SET status = 'ready'");
    expect(mockExecute.mock.calls[2][1]).toEqual(['file-1', 'job-1']);
    expect(mockExecute.mock.calls[3][0]).toContain('UPDATE storyboard_music_generation_jobs');
    expect(mockExecute.mock.calls[3][0]).toContain("SET status = 'ready'");
    expect(mockExecute.mock.calls[3][1]).toEqual(['file-1', 'job-1']);
    expect(mockExecute.mock.calls[4][0]).toContain('INSERT IGNORE INTO draft_files');
    expect(mockExecute.mock.calls[4][1]).toEqual(['draft-1', 'file-1']);
  });

  it('marks storyboard AI jobs failed with sanitized worker errors', async () => {
    mockExecute.mockResolvedValue([{ affectedRows: 1 }]);

    await storyboardAiGenerationJobRepo.markFailed('job-1', 'safe failure');

    const [sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("SET status = 'failed'");
    expect(sql).toContain('error_message = ?');
    expect(params).toEqual(['safe failure', 'job-1']);

    const [videoSql, videoParams] = mockExecute.mock.calls[1] as [string, unknown[]];
    expect(videoSql).toContain('UPDATE storyboard_scene_video_jobs');
    expect(videoSql).toContain("SET status = 'failed'");
    expect(videoSql).toContain('active_lock = NULL');
    expect(videoParams).toEqual(['safe failure', 'job-1']);

    const [musicSql, musicParams] = mockExecute.mock.calls[2] as [string, unknown[]];
    expect(musicSql).toContain('UPDATE storyboard_music_generation_jobs');
    expect(musicSql).toContain("SET status = 'failed'");
    expect(musicSql).toContain('active_lock = NULL');
    expect(musicParams).toEqual(['safe failure', 'job-1']);
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

  // ── castExtractJobRepo (R1 — cast-extract worker now wired to the queue) ──────

  it('marks a cast-extract job running by id', async () => {
    mockExecute.mockResolvedValue([{ affectedRows: 1 }]);

    await castExtractJobRepo.markRunning('job-1');

    const [sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('UPDATE storyboard_cast_extraction_jobs');
    expect(sql).toContain("SET status = 'running'");
    expect(params).toEqual(['job-1']);
  });

  it('persists the trimmed proposal, the truncated flag and the aggregate estimate on completion', async () => {
    mockExecute.mockResolvedValue([{ affectedRows: 1 }]);
    const proposal = {
      cast: [
        {
          type: 'character' as const,
          name: 'Alice',
          description: '',
          image_file_ids: [],
          scene_block_ids: [],
          per_run_estimate: 0.03,
        },
      ],
    };

    // overflow=true must reach the DB as truncated=1 (F4 carrier the worker now writes).
    await castExtractJobRepo.markCompleted({
      jobId: 'job-1',
      proposal,
      aggregateEstimateCredits: 0.03,
      overflow: true,
    });

    const [sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('UPDATE storyboard_cast_extraction_jobs');
    expect(sql).toContain("SET status = 'completed'");
    expect(sql).toContain('proposal_json = ?');
    expect(sql).toContain('truncated = ?');
    expect(sql).toContain('aggregate_estimate_credits = ?');
    expect(params).toEqual([JSON.stringify(proposal), 1, 0.03, 'job-1']);
  });

  it('writes truncated=0 when the proposal was within the cast limit', async () => {
    mockExecute.mockResolvedValue([{ affectedRows: 1 }]);

    await castExtractJobRepo.markCompleted({
      jobId: 'job-1',
      proposal: { cast: [] },
      aggregateEstimateCredits: 0,
      overflow: false,
    });

    const [, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(params[1]).toBe(0);
  });

  it('marks a cast-extract job failed with a sanitized error message', async () => {
    mockExecute.mockResolvedValue([{ affectedRows: 1 }]);

    await castExtractJobRepo.markFailed('job-1', new Error('llm boom'));

    const [sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('UPDATE storyboard_cast_extraction_jobs');
    expect(sql).toContain("SET status = 'failed'");
    expect(sql).toContain('error_message = ?');
    expect(params[0]).toBe('llm boom');
    expect(params[1]).toBe('job-1');
  });

  it('reads the draft script text owner-scoped and non-deleted, joining only text blocks', async () => {
    mockQuery.mockResolvedValueOnce([
      [
        {
          prompt_doc: JSON.stringify({
            blocks: [
              { type: 'text', value: '  Alice meets Bob  ' },
              { type: 'media-ref', fileId: 'f1', mediaType: 'image', label: 'ref' },
              { type: 'text', value: 'In the forest.' },
            ],
          }),
        },
      ],
    ]);

    const text = await castExtractJobRepo.getScriptText('draft-1', 'user-1');

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('FROM generation_drafts');
    expect(sql).toContain('deleted_at IS NULL');
    expect(params).toEqual(['draft-1', 'user-1']);
    // media-ref dropped, text trimmed + joined (mirrors storyboardPlan.context promptText)
    expect(text).toBe('Alice meets Bob\n\nIn the forest.');
  });

  it('throws when the draft is missing or not owned by the user', async () => {
    mockQuery.mockResolvedValueOnce([[]]);

    await expect(castExtractJobRepo.getScriptText('draft-x', 'user-1')).rejects.toThrow();
  });

  // ── T8 — sceneReferenceSelectionRepo.loadBlocksForDraft (flow_files read) ──────

  describe('T8 / sceneReferenceSelectionRepo.loadBlocksForDraft — outputs from flow_files', () => {
    beforeEach(() => {
      // Reset mock queues fully so unconsumed once-values from a previous test
      // do not bleed into subsequent tests.
      mockQuery.mockReset();
    });

    /**
     * T8 DoD: loadBlocksForDraft must query flow_files for completed (non-deleted)
     * outputs and expose real createdAt timestamps — NOT derive outputs from
     * storyboard_reference_stars rows.
     *
     * The test seeds two blocks:
     *   block-A has flow_id "flow-A", two flow_files outputs.
     *   block-B has no flow_id (NULL) → zero outputs.
     * Stars are present for block-A (primary + non-primary) but must NOT drive outputs.
     * Expected result: block-A.outputs = the two flow_files rows with real createdAt;
     *                  block-B.outputs = [] (no flow_files without a flow_id).
     */
    it('queries flow_files for outputs (not star rows) with real createdAt timestamps', async () => {
      // Query 1: block rows
      mockQuery.mockResolvedValueOnce([
        [
          { id: 'block-A', flow_id: 'flow-A' },
          { id: 'block-B', flow_id: null },
        ],
      ]);
      // Query 2: scene link rows
      mockQuery.mockResolvedValueOnce([
        [
          { reference_block_id: 'block-A', scene_block_id: 'scene-1' },
        ],
      ]);
      // Query 3: star rows (primary star on block-A for file-star-1)
      mockQuery.mockResolvedValueOnce([
        [
          { reference_block_id: 'block-A', file_id: 'file-star-1', is_primary: 1 },
        ],
      ]);
      // Query 4: flow_files for block-A's flow (flow-A) — two outputs with real timestamps
      const CREATED_AT_NEWER = new Date('2025-06-02T10:00:00.000Z');
      const CREATED_AT_OLDER = new Date('2025-06-01T09:00:00.000Z');
      mockQuery.mockResolvedValueOnce([
        [
          { flow_id: 'flow-A', file_id: 'file-output-new', created_at: CREATED_AT_NEWER },
          { flow_id: 'flow-A', file_id: 'file-output-old', created_at: CREATED_AT_OLDER },
        ],
      ]);

      const blocks = await sceneReferenceSelectionRepo.loadBlocksForDraft('draft-1');

      // flow_files query must have been issued and must NOT query stars for outputs
      const queryCalls = mockQuery.mock.calls as [string, unknown[]][];
      const flowFilesCall = queryCalls.find(([sql]) =>
        sql.includes('flow_files') && sql.includes('deleted_at IS NULL'),
      );
      expect(flowFilesCall).toBeDefined();

      // outputs must come from flow_files, not from stars
      const blockA = blocks.find((b) => b.id === 'block-A');
      expect(blockA).toBeDefined();
      // Real timestamps must be present (not the T7 placeholder epoch new Date(0))
      const outputFileIds = blockA!.outputs.map((o) => o.fileId);
      expect(outputFileIds).toContain('file-output-new');
      expect(outputFileIds).toContain('file-output-old');
      // No placeholder-epoch outputs
      const hasEpochPlaceholder = blockA!.outputs.some(
        (o) => o.createdAt.getTime() === 0,
      );
      expect(hasEpochPlaceholder).toBe(false);

      // primaryStarFileId still populated from star rows
      expect(blockA!.primaryStarFileId).toBe('file-star-1');

      // block-B (null flow_id) has zero outputs
      const blockB = blocks.find((b) => b.id === 'block-B');
      expect(blockB).toBeDefined();
      expect(blockB!.outputs).toHaveLength(0);
    });

    /**
     * T8 DoD: star-only file IDs (files that appear in storyboard_reference_stars
     * but have no corresponding flow_files row) must NOT appear in outputs.
     * This ensures outputs reflect completed flow outputs, not curated selections.
     */
    it('excludes star-only file IDs from outputs — stars that lack a flow_files row are not outputs', async () => {
      mockQuery.mockResolvedValueOnce([
        [{ id: 'block-A', flow_id: 'flow-A' }],
      ]);
      // No scene links
      mockQuery.mockResolvedValueOnce([[]])
      // Stars: file-star-only has no corresponding flow_files row
      mockQuery.mockResolvedValueOnce([
        [{ reference_block_id: 'block-A', file_id: 'file-star-only', is_primary: 1 }],
      ]);
      // flow_files returns a DIFFERENT file (file-flow-output), not file-star-only
      mockQuery.mockResolvedValueOnce([
        [{ flow_id: 'flow-A', file_id: 'file-flow-output', created_at: new Date('2025-06-01') }],
      ]);

      const blocks = await sceneReferenceSelectionRepo.loadBlocksForDraft('draft-1');

      const blockA = blocks.find((b) => b.id === 'block-A')!;
      const outputFileIds = blockA.outputs.map((o) => o.fileId);
      // flow_files output present
      expect(outputFileIds).toContain('file-flow-output');
      // star-only file NOT in outputs
      expect(outputFileIds).not.toContain('file-star-only');
      // primaryStarFileId still set (selection rule checks usability separately)
      expect(blockA.primaryStarFileId).toBe('file-star-only');
    });
  });
});
