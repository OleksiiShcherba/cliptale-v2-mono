/**
 * T10 — per-Creator Redis sliding-window generation rate limit
 *
 * Integration tests against real Redis (localhost:6380).
 * Each test run uses a unique key prefix so tests are fully repeatable.
 *
 * NFR §6 / ADR-0004: ≤ 30 Generate runs / minute / Creator
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Redis from 'ioredis';

// Override the URL before the module loads — vitest.setup.ts defaults to :6379.
// The house rules say: override APP_REDIS_URL to :6380 in any test that talks to real Redis.
process.env['APP_REDIS_URL'] = 'redis://localhost:6380';

// Import after env override
const { checkFlowRateLimit, FLOW_RATE_LIMIT_MAX, FLOW_RATE_LIMIT_WINDOW_MS } = await import(
  './flow-rate-limit.js'
);

// Unique run-id so test keys don't collide with parallel/previous runs.
const RUN_ID = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function creatorId(suffix: string): string {
  return `${RUN_ID}:creator-${suffix}`;
}

let redis: Redis;

beforeAll(() => {
  redis = new Redis('redis://localhost:6380');
});

afterAll(async () => {
  // Clean up every key we created by scanning for the run-id prefix.
  const keys = await redis.keys(`flow:generate:rate:${RUN_ID}*`);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
  await redis.quit();
});

describe('checkFlowRateLimit — exports', () => {
  it('exports FLOW_RATE_LIMIT_MAX = 30', () => {
    expect(FLOW_RATE_LIMIT_MAX).toBe(30);
  });

  it('exports FLOW_RATE_LIMIT_WINDOW_MS = 60_000', () => {
    expect(FLOW_RATE_LIMIT_WINDOW_MS).toBe(60_000);
  });
});

describe('checkFlowRateLimit — allow path (under the cap)', () => {
  it('allows the first request for a new Creator', async () => {
    const result = await checkFlowRateLimit(creatorId('allow-1'));
    expect(result.allowed).toBe(true);
    expect(result.retryAfterSeconds).toBe(0);
  });

  it('allows requests up to the limit (30 total)', async () => {
    const creator = creatorId('allow-30');
    // Run 29 more after the first (total = 30) — all must be allowed.
    for (let i = 0; i < FLOW_RATE_LIMIT_MAX; i++) {
      const result = await checkFlowRateLimit(creator);
      expect(result.allowed).toBe(true);
    }
  });

  it('two different Creators have independent buckets', async () => {
    const a = creatorId('indep-a');
    const b = creatorId('indep-b');

    // Drive creator-a to the limit.
    for (let i = 0; i < FLOW_RATE_LIMIT_MAX; i++) {
      await checkFlowRateLimit(a);
    }
    const aResult = await checkFlowRateLimit(a);
    expect(aResult.allowed).toBe(false);

    // creator-b must still be allowed.
    const bResult = await checkFlowRateLimit(b);
    expect(bResult.allowed).toBe(true);
  });
});

describe('checkFlowRateLimit — deny path (over the cap)', () => {
  it('denies the 31st request within the window', async () => {
    const creator = creatorId('deny-31');

    // Burn 30 allowed slots.
    for (let i = 0; i < FLOW_RATE_LIMIT_MAX; i++) {
      const r = await checkFlowRateLimit(creator);
      expect(r.allowed).toBe(true);
    }

    // 31st must be denied.
    const denied = await checkFlowRateLimit(creator);
    expect(denied.allowed).toBe(false);
  });

  it('denied result includes a positive retry-after (≤ 60 s)', async () => {
    const creator = creatorId('retry-after');

    for (let i = 0; i < FLOW_RATE_LIMIT_MAX; i++) {
      await checkFlowRateLimit(creator);
    }

    const denied = await checkFlowRateLimit(creator);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBeGreaterThan(0);
    expect(denied.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it('returns retryAfterSeconds = 0 when allowed', async () => {
    const creator = creatorId('retry-zero');
    const result = await checkFlowRateLimit(creator);
    expect(result.allowed).toBe(true);
    expect(result.retryAfterSeconds).toBe(0);
  });
});
