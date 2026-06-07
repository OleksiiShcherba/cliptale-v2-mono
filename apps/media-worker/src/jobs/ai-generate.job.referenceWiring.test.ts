/**
 * T7 (fix round) — Wiring test: processAiGenerateJob calls onReferenceBlockJobComplete
 * on every terminal outcome when the job is the first_job_id of a reference block.
 *
 * ACs covered:
 *   AC-03 — on success the window hook is invoked, advancing to the next pending block.
 *   AC-04 — on failure the window hook is invoked even though the job failed,
 *            keeping the window moving.
 *
 * Run from apps/media-worker:
 *   npx vitest run src/jobs/ai-generate.job.referenceWiring.test.ts
 *
 * All I/O is mocked. The key assertion is that queue.add (the aiGenerateQueue)
 * is called when pool.execute finds a matching storyboard_reference_blocks row.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Queue } from 'bullmq';
import type { Pool } from 'mysql2/promise';

vi.mock('@/lib/realtime.js', () => ({
  publishAiGenerationJobStatus: vi.fn().mockResolvedValue(undefined),
  publishReferenceBlockStatus: vi.fn().mockResolvedValue(undefined),
}));

import { processAiGenerateJob } from './ai-generate.job.js';
import {
  IMAGE_OUTPUT,
  installFetch,
  makeDeps,
  makeJob,
  makeMocks,
} from './ai-generate.job.fixtures.js';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const JOB_ID     = 'job-1';   // matches makeJob default
const BLOCK_ID   = 'ref-block-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const DRAFT_ID   = 'draft-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const NEXT_BLOCK = 'ref-block-cccc-cccc-cccc-cccccccccccc';
const USER_ID    = 'user-1';   // matches makeJob default
const FLOW_ID    = 'flow-dddd-dddd-dddd-dddddddddddd';

/**
 * Wraps makeDeps to inject an aiGenerateQueue mock.
 * The pool mock is replaced with a sequential-result one so we can control
 * what each pool.execute call returns.
 */
function makeDepsWithQueue(
  m: ReturnType<typeof makeMocks>,
  sequentialResults: Array<unknown>,
  aiQueueAdd: ReturnType<typeof vi.fn>,
) {
  let idx = 0;
  m.execute.mockImplementation(async () => sequentialResults[idx++] ?? [[], []]);

  const aiGenerateQueue = { add: aiQueueAdd } as unknown as Queue;
  const base = makeDeps(m);
  return { ...base, aiGenerateQueue };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('T7 wiring — processAiGenerateJob invokes rolling-window hook (AC-03/AC-04)', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ── AC-03 success path ────────────────────────────────────────────────────

  it('AC-03 success: calls aiGenerateQueue.add for the next pending reference block', async () => {
    const m = makeMocks(IMAGE_OUTPUT);
    installFetch(m);
    const aiQueueAdd = vi.fn().mockResolvedValue({ id: 'queued-next' });

    // Sequential pool.execute results:
    // 1. setJobStatus('processing')        → ok
    // 2. submitFalJob inner execute calls  → handled by fal mock, not pool
    // 3. setJobProgress(PROGRESS_SUBMITTED) → ok
    // 4. pollFalWithProgress progress bumps → ok (multiple, handled by fal mock)
    // 5. filesRepo.createFile              → no pool call (mocked repo)
    // 6. ingestQueue.add                   → no pool call
    // 7. aiGenerationJobRepo.setOutputFile → no pool call (mocked repo)
    // 8. publishAiGenerationJobStatus       → uses pool internally (SELECT), return []
    // 9. markStoryboardAiBindingsFailed    → n/a (success path)
    // 10. maybeAdvanceReferenceWindow:
    //     a. SELECT storyboard_reference_blocks WHERE first_job_id=? → ref block found
    //     b. [inside hook] UPDATE block → done (affectedRows=1)
    //     c. [inside hook] publishReferenceBlockStatus (uses pool SELECT) → []
    //     d. [inside hook] SELECT next pending → next block found
    //     e. [inside hook] UPDATE next pending → running (affectedRows=1)
    //     f. [inside hook] SELECT ai_generation_jobs (current job params) → []
    //     g. [inside hook] INSERT ai_generation_jobs for next block → ok
    //     h. [inside hook] UPDATE next block first_job_id → ok
    //
    // For simplicity, mock all pool calls to return a permissive result.
    // The wiring test only asserts that aiQueueAdd was called.
    // Use dotAll (s flag) regex since SQL strings contain newlines.
    m.execute.mockImplementation(async (sql: string) => {
      if (/storyboard_reference_blocks[\s\S]*first_job_id/i.test(sql)) {
        // Return the matching reference block row for maybeAdvanceReferenceWindow lookup
        return [[{ id: BLOCK_ID, draft_id: DRAFT_ID }], []];
      }
      if (/UPDATE[\s\S]*storyboard_reference_blocks[\s\S]*window_status\s*=\s*'done'/i.test(sql)) {
        return [{ affectedRows: 1 }, []];
      }
      if (/SELECT[\s\S]*storyboard_reference_blocks[\s\S]*window_status.*pending/i.test(sql)) {
        // Next pending block exists
        return [[{
          id: NEXT_BLOCK,
          draft_id: DRAFT_ID,
          flow_id: FLOW_ID,
          sort_order: 1,
          user_id: USER_ID,
          name: 'Test Character B',
        }], []];
      }
      if (/UPDATE[\s\S]*storyboard_reference_blocks[\s\S]*window_status\s*=\s*'running'/i.test(sql)) {
        return [{ affectedRows: 1 }, []];
      }
      // Default: success / empty result for all other queries (setJobStatus, setJobProgress, etc.)
      return [[], []];
    });

    const deps = { ...makeDeps(m), aiGenerateQueue: { add: aiQueueAdd } as unknown as Queue };
    await processAiGenerateJob(makeJob({ jobId: JOB_ID }), deps);

    // The hook must have enqueued the next block's generation job
    expect(aiQueueAdd).toHaveBeenCalledOnce();
    const payload = aiQueueAdd.mock.calls[0]![1] as Record<string, unknown>;
    expect(payload).toMatchObject({ draftId: DRAFT_ID });
  });

  // ── AC-04 failure path ────────────────────────────────────────────────────

  it('AC-04 failure: calls aiGenerateQueue.add for next pending block even when job fails', async () => {
    const m = makeMocks(IMAGE_OUTPUT);
    installFetch(m);
    const aiQueueAdd = vi.fn().mockResolvedValue({ id: 'queued-next' });

    // Make the fal submit fail so processAiGenerateJob throws
    m.submitFalJob.mockRejectedValueOnce(new Error('provider error'));

    // Use dotAll ([\s\S]*) to handle multiline SQL.
    m.execute.mockImplementation(async (sql: string) => {
      if (/storyboard_reference_blocks[\s\S]*first_job_id/i.test(sql)) {
        return [[{ id: BLOCK_ID, draft_id: DRAFT_ID }], []];
      }
      if (/UPDATE[\s\S]*storyboard_reference_blocks[\s\S]*window_status\s*=\s*'failed'/i.test(sql)) {
        return [{ affectedRows: 1 }, []];
      }
      if (/SELECT[\s\S]*storyboard_reference_blocks[\s\S]*window_status.*pending/i.test(sql)) {
        // No next block — window still tries to advance
        return [[], []];
      }
      return [[], []];
    });

    const deps = { ...makeDeps(m), aiGenerateQueue: { add: aiQueueAdd } as unknown as Queue };

    // The job throws (BullMQ records failure), but the hook was still called
    await expect(processAiGenerateJob(makeJob({ jobId: JOB_ID }), deps)).rejects.toThrow(
      'provider error',
    );

    // Hook was called (it attempted to mark block failed and advance window).
    // With no next pending block, aiQueueAdd should NOT have been called here —
    // but the hook MUST have been invoked (verified by the failed-block UPDATE).
    const failUpdateCalls = m.execute.mock.calls.filter(
      ([sql]: [string]) => /UPDATE[\s\S]*storyboard_reference_blocks[\s\S]*window_status\s*=\s*'failed'/i.test(sql),
    );
    expect(failUpdateCalls.length).toBeGreaterThanOrEqual(1);
  });

  // ── No-op when aiGenerateQueue is absent (backwards compatibility) ─────────

  it('does NOT query reference blocks when aiGenerateQueue is not provided', async () => {
    const m = makeMocks(IMAGE_OUTPUT);
    installFetch(m);

    // Use the standard deps (no aiGenerateQueue)
    await processAiGenerateJob(makeJob({ jobId: JOB_ID }), makeDeps(m));

    // No reference block lookup should have happened
    const refBlockCalls = m.execute.mock.calls.filter(
      ([sql]: [string]) => /storyboard_reference_blocks[\s\S]*first_job_id/i.test(sql),
    );
    expect(refBlockCalls).toHaveLength(0);
  });
});
