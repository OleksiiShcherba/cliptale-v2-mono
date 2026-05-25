import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery, mockGetConnection, mockConn } = vi.hoisted(() => {
  const mockConn = {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    query: vi.fn(),
    release: vi.fn(),
    rollback: vi.fn(),
  };
  return {
    mockQuery: vi.fn(),
    mockGetConnection: vi.fn(() => mockConn),
    mockConn,
  };
});

vi.mock('@/db/connection.js', () => ({
  pool: { query: mockQuery, getConnection: mockGetConnection },
}));

import type { StoryboardPlan } from '@ai-video-editor/project-schema';
import {
  createQueuedJob,
  findByJobId,
  findLatestCompletedByDraftId,
  markCompleted,
  markFailed,
  markRunning,
  reserveQueuedJob,
  sanitizeStoryboardPlanJobError,
} from './storyboardPlanJob.repository.js';

const NOW = new Date('2026-05-13T10:00:00.000Z');

const VALID_PLAN: StoryboardPlan = {
  schemaVersion: 1,
  videoLengthSeconds: 30,
  sceneCount: 5,
  scenes: [
    {
      sceneNumber: 1,
      prompt: 'Open with the product on a desk.',
      visualPrompt: 'Cinematic desk shot with soft morning light.',
      videoPrompt: 'Animate the scene with natural subject motion and a smooth camera move.',
      durationSeconds: 6,
      referencedMedia: [],
      transitionNotes: 'Cut on action.',
      style: 'cinematic',
    },
    {
      sceneNumber: 2,
      prompt: 'Show the user picking it up.',
      visualPrompt: 'Close handheld shot of the product in use.',
      videoPrompt: 'Animate the scene with natural subject motion and a smooth camera move.',
      durationSeconds: 6,
      referencedMedia: [],
      transitionNotes: 'Quick push transition.',
      style: 'cinematic',
    },
    {
      sceneNumber: 3,
      prompt: 'Highlight the key feature.',
      visualPrompt: 'Macro feature detail with crisp reflections.',
      videoPrompt: 'Animate the scene with natural subject motion and a smooth camera move.',
      durationSeconds: 6,
      referencedMedia: [],
      transitionNotes: 'Match cut.',
      style: 'cinematic',
    },
    {
      sceneNumber: 4,
      prompt: 'Show the benefit in context.',
      visualPrompt: 'Wide lifestyle scene showing the outcome.',
      videoPrompt: 'Animate the scene with natural subject motion and a smooth camera move.',
      durationSeconds: 6,
      referencedMedia: [],
      transitionNotes: 'Soft dissolve.',
      style: 'cinematic',
    },
    {
      sceneNumber: 5,
      prompt: 'End on a clean call to action.',
      visualPrompt: 'Hero product shot with simple background.',
      videoPrompt: 'Animate the scene with natural subject motion and a smooth camera move.',
      durationSeconds: 6,
      referencedMedia: [],
      transitionNotes: 'Fade out.',
      style: 'cinematic',
    },
  ],
};

const PROMPT_SNAPSHOT = {
  schemaVersion: 1,
  blocks: [{ type: 'text', value: 'Make a product launch storyboard.' }],
};

const MEDIA_CONTEXT = {
  files: [
    {
      fileId: '00000000-0000-4000-8000-000000000001',
      mediaType: 'image',
      storageUri: 's3://bucket/stable-key.jpg',
      hasThumbnail: true,
    },
  ],
};

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    job_id: '00000000-0000-4000-8000-000000000010',
    draft_id: '00000000-0000-4000-8000-000000000020',
    user_id: '00000000-0000-4000-8000-000000000030',
    status: 'completed',
    model: 'gpt-4.1',
    prompt_snapshot_json: PROMPT_SNAPSHOT,
    media_context_json: MEDIA_CONTEXT,
    plan_json: VALID_PLAN,
    error_message: null,
    created_at: NOW,
    updated_at: NOW,
    completed_at: NOW,
    failed_at: null,
    ...overrides,
  };
}

describe('storyboardPlanJob.repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConnection.mockReturnValue(mockConn);
    mockConn.beginTransaction.mockResolvedValue(undefined);
    mockConn.commit.mockResolvedValue(undefined);
    mockConn.rollback.mockResolvedValue(undefined);
    mockConn.release.mockReturnValue(undefined);
  });

  it('creates queued jobs with serialized prompt and stable media context JSON', async () => {
    mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);

    await createQueuedJob({
      jobId: 'job-1',
      draftId: 'draft-1',
      userId: 'user-1',
      model: 'gpt-4.1',
      promptSnapshot: PROMPT_SNAPSHOT,
      mediaContext: MEDIA_CONTEXT,
    });

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('INSERT INTO storyboard_plan_jobs');
    expect(params).toEqual([
      'job-1',
      'draft-1',
      'user-1',
      'gpt-4.1',
      JSON.stringify(PROMPT_SNAPSHOT),
      JSON.stringify(MEDIA_CONTEXT),
    ]);
  });

  it('reserves a queued job inside a draft-row transaction', async () => {
    mockConn.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    const result = await reserveQueuedJob({
      jobId: 'job-1',
      draftId: 'draft-1',
      userId: 'user-1',
      model: 'gpt-4.1',
      promptSnapshot: PROMPT_SNAPSHOT,
      mediaContext: MEDIA_CONTEXT,
    });

    expect(result).toEqual({ jobId: 'job-1', status: 'queued', created: true });
    expect(mockConn.beginTransaction).toHaveBeenCalledTimes(1);
    expect(mockConn.query.mock.calls[0]![0]).toContain('FROM generation_drafts');
    expect(mockConn.query.mock.calls[0]![0]).toContain('FOR UPDATE');
    expect(mockConn.query.mock.calls[1]![0]).toContain("status IN ('queued', 'running')");
    expect(mockConn.query.mock.calls[2]![0]).toContain('INSERT INTO storyboard_plan_jobs');
    expect(mockConn.commit).toHaveBeenCalledTimes(1);
    expect(mockConn.rollback).not.toHaveBeenCalled();
    expect(mockConn.release).toHaveBeenCalledTimes(1);
  });

  it('reuses an active reserved planning job without inserting', async () => {
    mockConn.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ job_id: 'active-job', status: 'running' }]]);

    const result = await reserveQueuedJob({
      jobId: 'job-1',
      draftId: 'draft-1',
      userId: 'user-1',
      model: null,
      promptSnapshot: PROMPT_SNAPSHOT,
    });

    expect(result).toEqual({ jobId: 'active-job', status: 'running', created: false });
    expect(mockConn.query).toHaveBeenCalledTimes(2);
    expect(mockConn.commit).toHaveBeenCalledTimes(1);
    expect(mockConn.release).toHaveBeenCalledTimes(1);
  });

  it('rolls back and releases the connection when reservation insert fails', async () => {
    const error = new Error('insert failed');
    mockConn.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockRejectedValueOnce(error);

    await expect(
      reserveQueuedJob({
        jobId: 'job-1',
        draftId: 'draft-1',
        userId: 'user-1',
        model: null,
        promptSnapshot: PROMPT_SNAPSHOT,
      }),
    ).rejects.toThrow('insert failed');

    expect(mockConn.rollback).toHaveBeenCalledTimes(1);
    expect(mockConn.commit).not.toHaveBeenCalled();
    expect(mockConn.release).toHaveBeenCalledTimes(1);
  });

  it('rejects media context values that contain signed URLs', async () => {
    await expect(
      createQueuedJob({
        jobId: 'job-1',
        draftId: 'draft-1',
        userId: 'user-1',
        model: 'gpt-4.1',
        promptSnapshot: PROMPT_SNAPSHOT,
        mediaContext: { signedUrl: 'https://signed.example.com/file.jpg?X-Amz-Signature=abc' },
      }),
    ).rejects.toThrow('mediaContext must not contain signed URLs');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('maps MySQL JSON columns returned as strings', async () => {
    mockQuery.mockResolvedValueOnce([
      [
        makeRow({
          prompt_snapshot_json: JSON.stringify(PROMPT_SNAPSHOT),
          media_context_json: JSON.stringify(MEDIA_CONTEXT),
          plan_json: JSON.stringify(VALID_PLAN),
        }),
      ],
    ]);

    const job = await findByJobId('job-1');

    expect(job!.promptSnapshot).toEqual(PROMPT_SNAPSHOT);
    expect(job!.mediaContext).toEqual(MEDIA_CONTEXT);
    expect(job!.plan).toEqual(VALID_PLAN);
  });

  it('maps MySQL JSON columns returned as parsed objects', async () => {
    mockQuery.mockResolvedValueOnce([[makeRow()]]);

    const job = await findByJobId('job-1');

    expect(job!.promptSnapshot).toEqual(PROMPT_SNAPSHOT);
    expect(job!.mediaContext).toEqual(MEDIA_CONTEXT);
    expect(job!.plan).toEqual(VALID_PLAN);
  });

  it('normalizes legacy persisted completed plans that predate videoPrompt', async () => {
    const legacyPlan = {
      ...VALID_PLAN,
      scenes: VALID_PLAN.scenes.map(({ videoPrompt: _videoPrompt, ...scene }) => scene),
    };
    mockQuery.mockResolvedValueOnce([[makeRow({ plan_json: legacyPlan })]]);

    const job = await findByJobId('job-1');

    expect(job!.plan?.scenes[0]?.videoPrompt).toBe(VALID_PLAN.scenes[0]!.visualPrompt);
    expect(job!.plan?.scenes[4]?.videoPrompt).toBe(VALID_PLAN.scenes[4]!.visualPrompt);
  });

  it('validates completed plan JSON before persisting', async () => {
    mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);

    await markCompleted({ jobId: 'job-1', plan: VALID_PLAN, mediaContext: MEDIA_CONTEXT });

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("status = 'completed'");
    expect(params).toEqual([JSON.stringify(VALID_PLAN), JSON.stringify(MEDIA_CONTEXT), 'job-1']);
  });

  it('rejects completed media context that contains signed URLs', async () => {
    await expect(
      markCompleted({
        jobId: 'job-1',
        plan: VALID_PLAN,
        mediaContext: { previews: ['https://signed.example.com/preview.png?token=abc'] },
      }),
    ).rejects.toThrow('mediaContext must not contain signed URLs');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('rejects schema-invalid completed plans', async () => {
    const invalidPlan = {
      ...VALID_PLAN,
      sceneCount: 4,
    } as unknown as StoryboardPlan;

    await expect(markCompleted({ jobId: 'job-1', plan: invalidPlan })).rejects.toThrow();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('rejects schema-invalid completed rows when fetched', async () => {
    mockQuery.mockResolvedValueOnce([[makeRow({ plan_json: { ...VALID_PLAN, scenes: [] } })]]);

    await expect(findByJobId('job-1')).rejects.toThrow();
  });

  it('marks running without changing draft ownership or deleted-draft behavior in SQL', async () => {
    mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);

    await markRunning('job-1');

    const [sql, params] = mockQuery.mock.calls[0] as [string, string[]];
    expect(sql).toContain("status = 'running'");
    expect(sql).not.toMatch(/generation_drafts|deleted_at/i);
    expect(params).toEqual(['job-1']);
  });

  it('sanitizes failed job errors before persistence', async () => {
    mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);
    const error = new Error(
      'OpenAI failed with sk_test_1234567890 at https://signed.example.com/file?token=secret\n    at worker.js:42:1',
    );

    await markFailed('job-1', error);

    const [, params] = mockQuery.mock.calls[0] as [string, string[]];
    expect(params[0]).toBe('OpenAI failed with [redacted] at [redacted-url]');
    expect(params[0]).not.toContain('worker.js');
    expect(params[0]).not.toContain('sk_test');
    expect(params[1]).toBe('job-1');
  });

  it('keeps sanitized error messages concise', () => {
    const sanitized = sanitizeStoryboardPlanJobError(`failure ${'x'.repeat(700)}`);

    expect(sanitized).toHaveLength(512);
  });

  it('redacts common key-value secret formats', () => {
    const sanitized = sanitizeStoryboardPlanJobError('request failed OPENAI_API_KEY=sk-live-abcdef123456 token: abc123');

    expect(sanitized).toBe('request failed [redacted] [redacted]');
  });

  it('finds jobs by job ID without joining drafts or filtering deleted_at', async () => {
    mockQuery.mockResolvedValueOnce([[]]);

    const job = await findByJobId('job-1');

    expect(job).toBeNull();
    const [sql, params] = mockQuery.mock.calls[0] as [string, string[]];
    expect(sql).toContain('FROM storyboard_plan_jobs');
    expect(sql).not.toMatch(/generation_drafts|deleted_at/i);
    expect(params).toEqual(['job-1']);
  });

  it('finds the latest completed plan for a draft without raw deleted-draft shortcuts', async () => {
    mockQuery.mockResolvedValueOnce([[makeRow()]]);

    const job = await findLatestCompletedByDraftId('draft-1');

    expect(job!.status).toBe('completed');
    const [sql, params] = mockQuery.mock.calls[0] as [string, string[]];
    expect(sql).toContain("status = 'completed'");
    expect(sql).toContain('ORDER BY created_at DESC');
    expect(sql).not.toMatch(/generation_drafts|deleted_at/i);
    expect(params).toEqual(['draft-1']);
  });
});
