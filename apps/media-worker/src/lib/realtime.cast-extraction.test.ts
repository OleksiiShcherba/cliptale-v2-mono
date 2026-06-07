/**
 * realtime.cast-extraction.test.ts
 *
 * Verifies that publishCastExtractionStatus publishes the events.md §87-104
 * schema: a distinct `storyboard.cast_extraction.updated` event with required
 * fields type / jobId / draftId / status plus aggregateEstimateCredits and
 * errorMessage (not routed as a storyboard plan event).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool } from 'mysql2/promise';
import { REALTIME_REDIS_CHANNEL } from '@ai-video-editor/project-schema';

// ---------------------------------------------------------------------------
// Mock ioredis so no real Redis connection is opened.
// ---------------------------------------------------------------------------

const mockPublish = vi.fn().mockResolvedValue(1);

vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    publish: mockPublish,
  })),
}));

// ---------------------------------------------------------------------------
// Mock config to provide a non-null redis URL (activates the publisher).
// ---------------------------------------------------------------------------

vi.mock('@/config.js', () => ({
  config: { redis: { url: 'redis://localhost:6380' } },
}));

import { publishCastExtractionStatus } from './realtime.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const JOB_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DRAFT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function makePool(row: Record<string, unknown>): Pool {
  return {
    query: vi.fn().mockResolvedValue([[row]]),
  } as unknown as Pool;
}

function lastPublishedEvent(): Record<string, unknown> {
  const calls = mockPublish.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  const lastCall = calls[calls.length - 1]!;
  return JSON.parse(lastCall[1] as string) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('publishCastExtractionStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // events.md §104: required fields type, jobId, draftId, status
  it('publishes storyboard.cast_extraction.updated with required events.md fields', async () => {
    const pool = makePool({
      job_id: JOB_ID,
      draft_id: DRAFT_ID,
      user_id: USER_ID,
      status: 'running',
      aggregate_estimate_credits: null,
      error_message: null,
    });

    await publishCastExtractionStatus({ pool, jobId: JOB_ID });

    expect(mockPublish).toHaveBeenCalledWith(
      REALTIME_REDIS_CHANNEL,
      expect.any(String),
    );

    const event = lastPublishedEvent();
    // Distinct type — must NOT be storyboard.status.updated (which routes to plan modal)
    expect(event.type).toBe('storyboard.cast_extraction.updated');
    // Required fields per events.md §104
    expect(event.jobId).toBe(JOB_ID);
    expect(event.draftId).toBe(DRAFT_ID);
    expect(event.status).toBe('running');
    // aggregateEstimateCredits null until completed
    expect(event.aggregateEstimateCredits).toBeNull();
    expect(event.errorMessage).toBeNull();
  });

  // events.md §99: aggregateEstimateCredits published when available (completed state)
  it('publishes aggregateEstimateCredits as a number when the job is completed', async () => {
    const pool = makePool({
      job_id: JOB_ID,
      draft_id: DRAFT_ID,
      user_id: USER_ID,
      status: 'completed',
      aggregate_estimate_credits: '0.0900',
      error_message: null,
    });

    await publishCastExtractionStatus({ pool, jobId: JOB_ID });

    const event = lastPublishedEvent();
    expect(event.type).toBe('storyboard.cast_extraction.updated');
    expect(event.status).toBe('completed');
    expect(event.aggregateEstimateCredits).toBe(0.09);
  });

  // events.md §99: errorMessage published when job failed
  it('publishes errorMessage when the job has failed', async () => {
    const pool = makePool({
      job_id: JOB_ID,
      draft_id: DRAFT_ID,
      user_id: USER_ID,
      status: 'failed',
      aggregate_estimate_credits: null,
      error_message: 'LLM output did not match cast schema',
    });

    await publishCastExtractionStatus({ pool, jobId: JOB_ID });

    const event = lastPublishedEvent();
    expect(event.type).toBe('storyboard.cast_extraction.updated');
    expect(event.status).toBe('failed');
    expect(event.errorMessage).toBe('LLM output did not match cast schema');
  });

  // Payload must NOT include resource:'storyboardPlan' — that would mis-route on the client
  it('does not include a storyboardPlan resource discriminator in the payload', async () => {
    const pool = makePool({
      job_id: JOB_ID,
      draft_id: DRAFT_ID,
      user_id: USER_ID,
      status: 'queued',
      aggregate_estimate_credits: null,
      error_message: null,
    });

    await publishCastExtractionStatus({ pool, jobId: JOB_ID });

    const event = lastPublishedEvent();
    expect(event).not.toHaveProperty('payload');
    expect((event as Record<string, unknown>).resource).toBeUndefined();
  });

  // No publish if pool.query throws (graceful degradation)
  it('does not throw and does not publish if the DB query fails', async () => {
    const pool = {
      query: vi.fn().mockRejectedValue(new Error('DB down')),
    } as unknown as Pool;

    await expect(publishCastExtractionStatus({ pool, jobId: JOB_ID })).resolves.toBeUndefined();
    expect(mockPublish).not.toHaveBeenCalled();
  });
});
