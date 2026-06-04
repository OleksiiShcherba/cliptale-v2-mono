/**
 * Unit tests for flow-model-pricing.repository.ts (U3b / AC-20).
 *
 * Tests cover:
 *  - getPricingForModel returns a parsed row (DECIMAL strings → numbers;
 *    resolution_mult JSON string → object)
 *  - a second call within the TTL does NOT hit the pool again (read-through cache)
 *  - unknown model → null
 *  - cache expires after TTL (fake timers advance past TTL → pool is hit again)
 *
 * All external dependencies (pool) are mocked — no real DB needed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Pool mock — hoisted so it is available when vi.mock factory runs ──────────
const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock('@/db/connection.js', () => ({
  pool: { query: mockQuery },
}));

import { getPricingForModel, clearPricingCache } from './flow-model-pricing.repository.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** A raw DB row as mysql2 returns it: DECIMAL columns are strings. */
function makeRawRow(overrides: Record<string, unknown> = {}) {
  return {
    model_id: 'fal-ai/test-model',
    currency: 'USD',
    base_amount: '0.10',
    per_second: '0.02',
    per_image: null,
    resolution_mult: null,
    ...overrides,
  };
}

// ── getPricingForModel — row parsing ──────────────────────────────────────────

describe('flow-model-pricing.repository — row parsing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearPricingCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns a parsed row with numeric base_amount and per_second', async () => {
    mockQuery.mockResolvedValueOnce([[makeRawRow()]]);

    const row = await getPricingForModel('fal-ai/test-model');

    expect(row).not.toBeNull();
    expect(typeof row!.baseAmount).toBe('number');
    expect(row!.baseAmount).toBeCloseTo(0.10);
    expect(typeof row!.perSecond).toBe('number');
    expect(row!.perSecond).toBeCloseTo(0.02);
    expect(row!.currency).toBe('USD');
  });

  it('parses per_image as a number when present', async () => {
    mockQuery.mockResolvedValueOnce([[makeRawRow({ per_image: '0.01' })]]);

    const row = await getPricingForModel('fal-ai/test-model');

    expect(typeof row!.perImage).toBe('number');
    expect(row!.perImage).toBeCloseTo(0.01);
  });

  it('returns null per_second / per_image for NULL columns', async () => {
    mockQuery.mockResolvedValueOnce([[makeRawRow({ per_second: null, per_image: null })]]);

    const row = await getPricingForModel('fal-ai/test-model');

    expect(row!.perSecond).toBeNull();
    expect(row!.perImage).toBeNull();
  });

  it('parses resolution_mult from a JSON string into an object', async () => {
    mockQuery.mockResolvedValueOnce([
      [makeRawRow({ resolution_mult: JSON.stringify({ '720p': 1, '1080p': 2 }) })],
    ]);

    const row = await getPricingForModel('fal-ai/test-model');

    expect(row!.resolutionMult).toEqual({ '720p': 1, '1080p': 2 });
  });

  it('returns null resolutionMult when the column is NULL', async () => {
    mockQuery.mockResolvedValueOnce([[makeRawRow({ resolution_mult: null })]]);

    const row = await getPricingForModel('fal-ai/test-model');

    expect(row!.resolutionMult).toBeNull();
  });

  it('returns null for an unknown model', async () => {
    mockQuery.mockResolvedValueOnce([[]]);

    const row = await getPricingForModel('unknown/model-xyz');

    expect(row).toBeNull();
  });
});

// ── Read-through cache ────────────────────────────────────────────────────────

describe('flow-model-pricing.repository — read-through cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearPricingCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does NOT hit the pool a second time within the TTL', async () => {
    mockQuery.mockResolvedValue([[makeRawRow({ model_id: 'fal-ai/cached-model' })]]);

    await getPricingForModel('fal-ai/cached-model');
    await getPricingForModel('fal-ai/cached-model');

    // Should have queried only once — second call is served from cache.
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('hits the pool again after the TTL has expired', async () => {
    mockQuery.mockResolvedValue([[makeRawRow({ model_id: 'fal-ai/ttl-model' })]]);

    await getPricingForModel('fal-ai/ttl-model');

    // Advance beyond any reasonable TTL (5 minutes = 300 000 ms is the expected upper bound).
    vi.advanceTimersByTime(310_000);

    await getPricingForModel('fal-ai/ttl-model');

    // Should have queried twice — cache expired after TTL.
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });
});
