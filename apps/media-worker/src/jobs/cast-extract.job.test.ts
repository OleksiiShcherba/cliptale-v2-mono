import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnrecoverableError, type Job } from 'bullmq';
import type { Pool } from 'mysql2/promise';

vi.mock('@/lib/realtime.js', () => ({
  publishCastExtractionStatus: vi.fn().mockResolvedValue(undefined),
}));

import {
  processCastExtractJob,
  CAST_SIZE_LIMIT,
  type CastExtractJobPayload,
  type CastExtractLlmClient,
  type CastExtractJobRepository,
} from './cast-extract.job.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const JOB_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DRAFT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SCENE_ID_1 = '11111111-1111-4111-8111-111111111111';
const SCENE_ID_2 = '22222222-2222-4222-8222-222222222222';
const SCENE_ID_3 = '33333333-3333-4333-8333-333333333333';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJob(
  data: unknown = { jobId: JOB_ID, draftId: DRAFT_ID, userId: USER_ID },
  overrides: Partial<Job<CastExtractJobPayload>> = {},
): Job<CastExtractJobPayload> {
  return { data, ...overrides } as unknown as Job<CastExtractJobPayload>;
}

/**
 * Minimal valid cast proposal entry — matches the cast Zod schema from spec §6.1.
 */
function makeCastEntry(
  overrides: {
    name?: string;
    type?: 'character' | 'environment';
    description?: string;
    image_file_ids?: string[];
    scene_block_ids?: string[];
    per_run_estimate?: number;
  } = {},
) {
  return {
    type: 'character' as const,
    name: 'Test Character',
    description: 'A test character description.',
    image_file_ids: [],
    scene_block_ids: [SCENE_ID_1],
    per_run_estimate: 0.05,
    ...overrides,
  };
}

/**
 * Build a valid cast proposal with exactly `count` entries, each appearing in exactly
 * `sceneCount` scenes. Used for the >12 truncation test.
 */
function makeCastProposal(entries: ReturnType<typeof makeCastEntry>[]) {
  return { cast: entries };
}

function makeLlmMock(responseBody: unknown): CastExtractLlmClient {
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: JSON.stringify(responseBody) } }],
        }),
      },
    },
  };
}

function makeRepository(events: string[] = []): CastExtractJobRepository {
  return {
    markRunning: vi.fn(async () => { events.push('running'); }),
    markCompleted: vi.fn(async () => { events.push('completed'); }),
    markFailed: vi.fn(async () => { events.push('failed'); }),
    getScriptText: vi.fn(async () => 'Alice, Bob, and the forest appear throughout the story.'),
  };
}

const pool = {} as Pool;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('processCastExtractJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // AC-01 happy path: LLM returns valid cast → mark running → completed, proposal stored.
  it('marks running, calls LLM with script text as data, validates output, and persists completion', async () => {
    const events: string[] = [];
    const proposal = makeCastProposal([
      makeCastEntry({ name: 'Test Character', scene_block_ids: [SCENE_ID_1, SCENE_ID_2] }),
      makeCastEntry({ name: 'Test Environment', type: 'environment', scene_block_ids: [SCENE_ID_3] }),
    ]);
    const llm = makeLlmMock(proposal);
    const repository = makeRepository(events);

    const result = await processCastExtractJob(makeJob(), { llm, pool, repository });

    expect(events).toEqual(['running', 'completed']);
    expect(result.cast).toHaveLength(2);
    expect(result.cast[0]).toMatchObject({ name: 'Test Character', type: 'character' });
    expect(result.cast[1]).toMatchObject({ name: 'Test Environment', type: 'environment' });
    expect(repository.markCompleted).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: JOB_ID,
        proposal: expect.objectContaining({ cast: expect.any(Array) }),
        aggregateEstimateCredits: expect.any(Number),
      }),
    );
  });

  // AC-01 realtime: storyboard.cast_extraction.updated published after each lifecycle write.
  it('publishes cast_extraction.updated realtime event after running and after completed', async () => {
    const { publishCastExtractionStatus } = await import('@/lib/realtime.js');
    const proposal = makeCastProposal([makeCastEntry()]);
    const repository = makeRepository();

    await processCastExtractJob(makeJob(), {
      llm: makeLlmMock(proposal),
      pool,
      repository,
    });

    expect(publishCastExtractionStatus).toHaveBeenCalledTimes(2);
    expect(publishCastExtractionStatus).toHaveBeenNthCalledWith(1, { pool, jobId: JOB_ID });
    expect(publishCastExtractionStatus).toHaveBeenNthCalledWith(2, { pool, jobId: JOB_ID });
    // running write must happen BEFORE the first publish
    expect(
      vi.mocked(repository.markRunning).mock.invocationCallOrder[0]!,
    ).toBeLessThan(vi.mocked(publishCastExtractionStatus).mock.invocationCallOrder[0]!);
    // completed write must happen BEFORE the second publish
    expect(
      vi.mocked(repository.markCompleted).mock.invocationCallOrder[0]!,
    ).toBeLessThan(vi.mocked(publishCastExtractionStatus).mock.invocationCallOrder[1]!);
  });

  // AC-02 cast size limit: >12 candidates → ranked by scene-appearance count → top 12 kept.
  it(`truncates proposals over ${CAST_SIZE_LIMIT} to the limit, keeping entries with most scene appearances`, async () => {
    // Build 15 entries: entries 0-2 appear in 3 scenes each (most frequent → kept first),
    // entries 3-11 appear in 2 scenes each, entry 12-14 appear in 1 scene each (should be dropped).
    const entries = Array.from({ length: 15 }, (_, i) => {
      const sceneCount = i < 3 ? 3 : i < 12 ? 2 : 1;
      return makeCastEntry({
        name: `Test Character ${i}`,
        scene_block_ids: Array.from({ length: sceneCount }, (__, s) => `scene-${i}-${s}`),
      });
    });

    const proposal = makeCastProposal(entries);
    const llm = makeLlmMock(proposal);
    const repository = makeRepository();

    const result = await processCastExtractJob(makeJob(), { llm, pool, repository });

    expect(result.cast).toHaveLength(CAST_SIZE_LIMIT); // exactly 12
    // All kept entries must have ≥2 scene appearances (the overflow entries had only 1)
    for (const entry of result.cast) {
      expect(entry.scene_block_ids.length).toBeGreaterThanOrEqual(2);
    }
    // Overflow flag must be present to tell Creator the rest can be added manually
    expect(result.overflow).toBe(true);
    expect(repository.markCompleted).toHaveBeenCalledWith(
      expect.objectContaining({
        proposal: expect.objectContaining({ cast: expect.any(Array) }),
      }),
    );
    const completedCall = vi.mocked(repository.markCompleted).mock.calls[0]![0] as {
      proposal: { cast: Array<{ scene_block_ids: string[] }> };
    };
    expect(completedCall.proposal.cast).toHaveLength(CAST_SIZE_LIMIT);
  });

  // AC-02 invariant: proposals at exactly the limit are not truncated, no overflow flag.
  it('does not truncate proposals at exactly the cast size limit and sets no overflow flag', async () => {
    const entries = Array.from({ length: CAST_SIZE_LIMIT }, (_, i) =>
      makeCastEntry({ name: `Test Character ${i}`, scene_block_ids: [SCENE_ID_1] }),
    );
    const llm = makeLlmMock(makeCastProposal(entries));
    const repository = makeRepository();

    const result = await processCastExtractJob(makeJob(), { llm, pool, repository });

    expect(result.cast).toHaveLength(CAST_SIZE_LIMIT);
    expect(result.overflow).toBe(false);
  });

  // AC-01 validation: LLM output that fails Zod cast schema → job failed, UnrecoverableError.
  it('marks failed with schema error and throws UnrecoverableError when LLM output is outside the Zod cast schema', async () => {
    const invalidOutput = { cast: [{ type: 'robot', name: 'Bleep' }] }; // invalid type field
    const llm = makeLlmMock(invalidOutput);
    const repository = makeRepository();

    await expect(
      processCastExtractJob(makeJob(), { llm, pool, repository }),
    ).rejects.toBeInstanceOf(UnrecoverableError);

    expect(repository.markFailed).toHaveBeenCalledWith(
      JOB_ID,
      expect.objectContaining({ name: 'CastExtractSchemaValidationError' }),
    );
    expect(repository.markCompleted).not.toHaveBeenCalled();
  });

  // AC-01 validation: malformed JSON from LLM → job failed, UnrecoverableError.
  it('marks failed and throws UnrecoverableError for malformed JSON from LLM', async () => {
    const llm: CastExtractLlmClient = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: 'not valid json {{{' } }],
          }),
        },
      },
    };
    const repository = makeRepository();

    await expect(
      processCastExtractJob(makeJob(), { llm, pool, repository }),
    ).rejects.toBeInstanceOf(UnrecoverableError);

    expect(repository.markFailed).toHaveBeenCalledWith(
      JOB_ID,
      expect.objectContaining({ name: 'CastExtractOutputParseError' }),
    );
  });

  // Redelivery idempotency: job re-runs overwrite proposal without side effects (free, at-least-once OK).
  it('marks running again and overwrites completion on redelivery without side effects', async () => {
    const proposal = makeCastProposal([makeCastEntry()]);
    const llm = makeLlmMock(proposal);
    const events: string[] = [];
    const repository = makeRepository(events);

    await processCastExtractJob(makeJob(), { llm, pool, repository });
    await processCastExtractJob(makeJob(), { llm, pool, repository });

    expect(events).toEqual(['running', 'completed', 'running', 'completed']);
    expect(repository.markFailed).not.toHaveBeenCalled();
    // Both completions refer to the same jobId
    const calls = vi.mocked(repository.markCompleted).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0]![0]).toMatchObject({ jobId: JOB_ID });
    expect(calls[1]![0]).toMatchObject({ jobId: JOB_ID });
  });

  // Malformed payload: invalid UUID for draftId → UnrecoverableError without running.
  it('throws UnrecoverableError and marks failed for malformed job payload', async () => {
    const llm = makeLlmMock(makeCastProposal([makeCastEntry()]));
    const repository = makeRepository();

    await expect(
      processCastExtractJob(makeJob({ jobId: JOB_ID, draftId: null, userId: USER_ID }), {
        llm,
        pool,
        repository,
      }),
    ).rejects.toBeInstanceOf(UnrecoverableError);

    expect(repository.markRunning).not.toHaveBeenCalled();
    expect(repository.markFailed).toHaveBeenCalledWith(
      JOB_ID,
      expect.objectContaining({ name: 'CastExtractJobPayloadValidationError' }),
    );
  });

  // Transient LLM failure on non-final attempt → does NOT mark failed (BullMQ retries).
  it('does not mark failed for transient LLM errors on non-final attempts', async () => {
    const transientError = new Error('LLM provider 503');
    const llm: CastExtractLlmClient = {
      chat: {
        completions: {
          create: vi.fn().mockRejectedValue(transientError),
        },
      },
    };
    const repository = makeRepository();

    await expect(
      processCastExtractJob(makeJob(undefined, { attemptsMade: 1, opts: { attempts: 3 } }), {
        llm,
        pool,
        repository,
      }),
    ).rejects.toBe(transientError);

    expect(repository.markFailed).not.toHaveBeenCalled();
  });

  // Transient LLM failure on final attempt → marks failed.
  it('marks failed for transient LLM errors on the final attempt', async () => {
    const transientError = new Error('LLM provider 503');
    const llm: CastExtractLlmClient = {
      chat: {
        completions: {
          create: vi.fn().mockRejectedValue(transientError),
        },
      },
    };
    const repository = makeRepository();

    await expect(
      processCastExtractJob(makeJob(undefined, { attemptsMade: 2, opts: { attempts: 3 } }), {
        llm,
        pool,
        repository,
      }),
    ).rejects.toBe(transientError);

    expect(repository.markFailed).toHaveBeenCalledWith(JOB_ID, transientError);
    expect(repository.markCompleted).not.toHaveBeenCalled();
  });
});
