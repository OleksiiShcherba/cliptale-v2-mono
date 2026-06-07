/**
 * T7 — Rolling-window completion-hook unit tests.
 *
 * Tests the `onReferenceBlockJobComplete` hook that runs inside the ai-generate
 * worker after every terminal outcome (success or failure) of a reference-block's
 * first generation job.
 *
 * ACs covered:
 *   AC-03 — done/failed window_status set correctly; completion claims the next
 *            pending block in cast order and enqueues its generation.
 *   AC-04 — failed status carries a plain-language error_message; failure of one
 *            block does NOT stop the window — the hook still claims and enqueues
 *            the next pending.
 *
 * Run from apps/media-worker:
 *   npx vitest run src/jobs/ai-generate.referenceWindow.test.ts
 *
 * All I/O is mocked: pool.execute, the enqueue function, and the realtime
 * publisher. No real MySQL or Redis needed at this level.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool } from 'mysql2/promise';
import type { Queue } from 'bullmq';

vi.mock('@/lib/realtime.js', () => ({
  publishReferenceBlockStatus: vi.fn().mockResolvedValue(undefined),
}));

import {
  onReferenceBlockJobComplete,
  type ReferenceWindowHookDeps,
  type ReferenceWindowHookParams,
} from './ai-generate.referenceWindow.js';

// ---------------------------------------------------------------------------
// UUIDs — fixed so tests are deterministic
// ---------------------------------------------------------------------------

const DRAFT_ID   = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BLOCK_ID_A = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; // first_job_id = JOB_ID_A
const BLOCK_ID_B = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'; // next pending in cast order
const JOB_ID_A   = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const USER_ID    = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const FLOW_ID_B  = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const MODEL_ID   = 'fal-ai/flux/schnell';

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

/**
 * The next-pending row returned by the atomic claim SELECT (before UPDATE).
 * Represents block B in cast order (sort_order 1).
 */
const NEXT_PENDING_ROW = {
  id:         BLOCK_ID_B,
  draft_id:   DRAFT_ID,
  flow_id:    FLOW_ID_B,
  sort_order: 1,
  user_id:    USER_ID,   // joins from generation_flows / generation_drafts
  model_id:   MODEL_ID,  // comes from the flow's last-known model
  name:       'Test Character B',
};

type MockExecuteCall = [string, unknown[]?];

function makePool(executeResults: Array<unknown[] | unknown>): {
  pool: Pool;
  calls: MockExecuteCall[];
} {
  const calls: MockExecuteCall[] = [];
  let callIndex = 0;

  const execute = vi.fn().mockImplementation(
    async (sql: string, params?: unknown[]) => {
      calls.push([sql, params]);
      const result = executeResults[callIndex++] ?? [[], []];
      return result;
    },
  );

  return { pool: { execute } as unknown as Pool, calls };
}

function makeEnqueue(): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue({ id: 'queued-job-1' });
}

function makeQueue(enqueue: ReturnType<typeof vi.fn>): Queue {
  return { add: enqueue } as unknown as Queue;
}

function makeSuccessParams(overrides: Partial<ReferenceWindowHookParams> = {}): ReferenceWindowHookParams {
  return {
    jobId:   JOB_ID_A,
    blockId: BLOCK_ID_A,
    draftId: DRAFT_ID,
    outcome: 'success',
    ...overrides,
  };
}

function makeFailureParams(overrides: Partial<ReferenceWindowHookParams> = {}): ReferenceWindowHookParams {
  return {
    jobId:   JOB_ID_A,
    blockId: BLOCK_ID_A,
    draftId: DRAFT_ID,
    outcome: 'failure',
    errorMessage: 'Provider returned empty output',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

describe('T7 — onReferenceBlockJobComplete rolling-window hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── AC-03 (success path) ─────────────────────────────────────────────────

  describe('AC-03 success: block status set to done, next pending claimed and enqueued', () => {
    it('sets window_status=done on the completed block', async () => {
      const enqueue = makeEnqueue();
      // execute calls: (1) UPDATE block done, (2) SELECT next pending (none found)
      const { pool, calls } = makePool([
        [[], []], // UPDATE block → done
        [[], []], // SELECT next pending → empty
      ]);

      await onReferenceBlockJobComplete(makeSuccessParams(), {
        pool,
        aiGenerateQueue: makeQueue(enqueue),
      } satisfies ReferenceWindowHookDeps);

      // First execute must UPDATE window_status to 'done' for the correct block
      const [updateSql, updateParams] = calls[0]!;
      expect(updateSql).toMatch(/UPDATE\s+storyboard_reference_blocks/i);
      expect(updateSql).toMatch(/window_status\s*=\s*['"]?done['"]?/i);
      expect(updateParams).toContain(BLOCK_ID_A);
    });

    it('claims the next pending block in cast order and enqueues its generation', async () => {
      const enqueue = makeEnqueue();
      // execute calls: (1) UPDATE done, (2) SELECT next pending → one row, (3) UPDATE next running
      const { pool } = makePool([
        [[], []], // UPDATE block A → done
        [[NEXT_PENDING_ROW], []], // SELECT next pending → block B found
        [[], []], // UPDATE block B → running
      ]);

      await onReferenceBlockJobComplete(makeSuccessParams(), {
        pool,
        aiGenerateQueue: makeQueue(enqueue),
      } satisfies ReferenceWindowHookDeps);

      // Queue must have been called exactly once for block B
      expect(enqueue).toHaveBeenCalledOnce();
      const enqueueCall = enqueue.mock.calls[0];
      // First arg: job name
      expect(typeof enqueueCall[0]).toBe('string');
      // Second arg: payload containing the next block / flow identifiers
      const payload = enqueueCall[1] as Record<string, unknown>;
      expect(payload).toMatchObject({
        draftId:  DRAFT_ID,
      });
    });

    it('does NOT enqueue when no pending block exists after success', async () => {
      const enqueue = makeEnqueue();
      const { pool } = makePool([
        [[], []],   // UPDATE block A → done
        [[], []],   // SELECT next pending → empty
      ]);

      await onReferenceBlockJobComplete(makeSuccessParams(), {
        pool,
        aiGenerateQueue: makeQueue(enqueue),
      } satisfies ReferenceWindowHookDeps);

      expect(enqueue).not.toHaveBeenCalled();
    });
  });

  // ── AC-03 (idempotency) ──────────────────────────────────────────────────

  describe('AC-03 idempotency: redelivery of a completed job is a no-op', () => {
    it('does not claim or enqueue a second time when the block is already done', async () => {
      const enqueue = makeEnqueue();
      // Simulate: UPDATE affects 0 rows (already done) → hook detects and stops
      // Two pool calls: UPDATE (0 affected rows) + nothing else
      const { pool, calls } = makePool([
        // UPDATE returns OkPacket with affectedRows=0 when already done
        [{ affectedRows: 0 }, []],
      ]);

      await onReferenceBlockJobComplete(makeSuccessParams(), {
        pool,
        aiGenerateQueue: makeQueue(enqueue),
      } satisfies ReferenceWindowHookDeps);

      // If affectedRows=0, the hook must stop: no SELECT next, no enqueue
      expect(enqueue).not.toHaveBeenCalled();
      // Only the guarded UPDATE should have been called
      expect(calls).toHaveLength(1);
    });
  });

  // ── AC-04 (failure path) ─────────────────────────────────────────────────

  describe('AC-04 failure: failed block stores plain-language reason; window continues', () => {
    it('sets window_status=failed and persists the plain-language error_message', async () => {
      const enqueue = makeEnqueue();
      const { pool, calls } = makePool([
        [[], []],  // UPDATE block A → failed
        [[], []],  // SELECT next pending → empty
      ]);

      const errorMsg = 'Provider returned empty output';
      await onReferenceBlockJobComplete(makeFailureParams({ errorMessage: errorMsg }), {
        pool,
        aiGenerateQueue: makeQueue(enqueue),
      } satisfies ReferenceWindowHookDeps);

      const [updateSql, updateParams] = calls[0]!;
      expect(updateSql).toMatch(/UPDATE\s+storyboard_reference_blocks/i);
      expect(updateSql).toMatch(/window_status\s*=\s*['"]?failed['"]?/i);
      expect(updateSql).toMatch(/error_message/i);
      expect(updateParams).toContain(errorMsg);
      expect(updateParams).toContain(BLOCK_ID_A);
    });

    it('still claims and enqueues the next pending block after a failed generation', async () => {
      const enqueue = makeEnqueue();
      const { pool } = makePool([
        [[], []],                 // UPDATE block A → failed
        [[NEXT_PENDING_ROW], []], // SELECT next pending → block B
        [[], []],                 // UPDATE block B → running
      ]);

      await onReferenceBlockJobComplete(makeFailureParams(), {
        pool,
        aiGenerateQueue: makeQueue(enqueue),
      } satisfies ReferenceWindowHookDeps);

      // AC-04 core: window is NOT stopped by a single block failure
      expect(enqueue).toHaveBeenCalledOnce();
      const payload = enqueue.mock.calls[0]![1] as Record<string, unknown>;
      expect(payload).toMatchObject({ draftId: DRAFT_ID });
    });

    it('does not affect other blocks — only the failed block row is updated', async () => {
      const enqueue = makeEnqueue();
      const { pool, calls } = makePool([
        [[], []],  // UPDATE block A → failed
        [[], []],  // SELECT next pending → empty
      ]);

      await onReferenceBlockJobComplete(makeFailureParams(), {
        pool,
        aiGenerateQueue: makeQueue(enqueue),
      } satisfies ReferenceWindowHookDeps);

      // Every UPDATE call must be scoped to BLOCK_ID_A (the failed block only)
      const updateCalls = calls.filter(([sql]) =>
        /UPDATE\s+storyboard_reference_blocks/i.test(sql),
      );
      for (const [, params] of updateCalls) {
        expect(params).toContain(BLOCK_ID_A);
        // Must NOT inadvertently update other blocks
        if (Array.isArray(params)) {
          expect(params).not.toContain(BLOCK_ID_B);
        }
      }
    });
  });
});
