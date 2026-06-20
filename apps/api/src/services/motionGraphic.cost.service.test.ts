/**
 * T7 — motionGraphic.cost.service unit tests
 *
 * Mirror of storyboardPipeline.cost.service.test.ts (same exact-match re-validation rule).
 *
 * Covers:
 *   (a) computeGenerationEstimate — deterministic server-side estimate for given inputs
 *   (b) revalidateEstimate        — ACCEPTS a client estimate that exactly matches the server estimate
 *   (c) revalidateEstimate        — REJECTS any mismatch (incl. off-by-epsilon / null)
 *       with GateError(motion_graphic.estimate_revalidation_failed, 422)
 *
 * Test level: unit — NO database, NO network.
 *
 * AC-11 (cost-guard) / spec §6.1 (abuse: cost-estimate manipulation — client estimate is never trusted).
 * ADR (instrument-only; no credit ledger built here).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks — must precede module import ───────────────────────────────────────

vi.mock('@/repositories/flow-model-pricing.repository.js', () => ({
  getPricingForModel: vi.fn(),
}));

vi.mock('@/config.js', () => ({
  config: {
    openai: { model: 'gpt-4o' },
  },
}));

import { getPricingForModel } from '@/repositories/flow-model-pricing.repository.js';
import type { FlowModelPricing } from '@/repositories/flow-model-pricing.repository.js';

import {
  computeGenerationEstimate,
  revalidateEstimate,
  MotionGraphicEstimateRevalidationFailedError,
} from './motionGraphic.cost.service.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makePricingRow(overrides: Partial<FlowModelPricing> = {}): FlowModelPricing {
  return {
    modelId: 'gpt-4o',
    currency: 'USD',
    baseAmount: 0.05,
    perSecond: null,
    perImage: null,
    resolutionMult: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── (a) computeGenerationEstimate — deterministic ────────────────────────────

describe('computeGenerationEstimate', () => {
  it('computes baseAmount × durationSeconds (per-run base scaled by duration)', async () => {
    vi.mocked(getPricingForModel).mockResolvedValue(makePricingRow({ baseAmount: 0.05 }));

    const result = await computeGenerationEstimate({ durationSeconds: 4 });

    // 0.05 × 4 = 0.20
    expect(result).toBe('0.2000');
  });

  it('prefers perSecond × durationSeconds when perSecond is set', async () => {
    vi.mocked(getPricingForModel).mockResolvedValue(
      makePricingRow({ baseAmount: 0, perSecond: 0.03 }),
    );

    const result = await computeGenerationEstimate({ durationSeconds: 10 });

    // 0.03 × 10 = 0.30
    expect(result).toBe('0.3000');
  });

  it('is deterministic — same inputs yield the same string', async () => {
    vi.mocked(getPricingForModel).mockResolvedValue(makePricingRow({ baseAmount: 0.04 }));

    const a = await computeGenerationEstimate({ durationSeconds: 3 });
    const b = await computeGenerationEstimate({ durationSeconds: 3 });

    expect(a).toBe(b);
    expect(a).toBe('0.1200');
  });

  it('queries pricing for the configured authoring model id', async () => {
    vi.mocked(getPricingForModel).mockResolvedValue(makePricingRow());

    await computeGenerationEstimate({ durationSeconds: 1 });

    expect(getPricingForModel).toHaveBeenCalledWith('gpt-4o');
  });

  it('falls back to 0.0000 when no pricing row exists for the model', async () => {
    vi.mocked(getPricingForModel).mockResolvedValue(null);

    const result = await computeGenerationEstimate({ durationSeconds: 5 });

    expect(result).toBe('0.0000');
  });

  it('returns a string with exactly 4 decimal places', async () => {
    vi.mocked(getPricingForModel).mockResolvedValue(makePricingRow({ baseAmount: 0.03 }));

    const result = await computeGenerationEstimate({ durationSeconds: 2 });

    expect(result).toMatch(/^\d+\.\d{4}$/);
  });

  it('does NOT call fetch / any network (no external calls)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    vi.mocked(getPricingForModel).mockResolvedValue(makePricingRow());

    await computeGenerationEstimate({ durationSeconds: 1 });

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ── (b) revalidateEstimate — ACCEPTS a matching estimate ─────────────────────

describe('revalidateEstimate — accepts matching estimate', () => {
  it('does not throw when clientEstimate exactly matches serverEstimate', () => {
    expect(() =>
      revalidateEstimate({ serverEstimate: '0.2000', clientEstimate: '0.2000' }),
    ).not.toThrow();
  });

  it('does not throw when clientEstimate matches with different trailing zeros', () => {
    // "0.2" vs "0.2000" — same numeric value
    expect(() =>
      revalidateEstimate({ serverEstimate: '0.2000', clientEstimate: '0.2' }),
    ).not.toThrow();
  });

  it('does not throw when both estimates are zero', () => {
    expect(() =>
      revalidateEstimate({ serverEstimate: '0.0000', clientEstimate: '0.0000' }),
    ).not.toThrow();
  });
});

// ── (c) revalidateEstimate — REJECTS a mismatched estimate (§6.1 abuse guard) ─

describe('revalidateEstimate — rejects mismatched estimate (AC-11)', () => {
  it('throws when clientEstimate is lower than serverEstimate', () => {
    expect(() =>
      revalidateEstimate({ serverEstimate: '0.2000', clientEstimate: '0.0500' }),
    ).toThrow(MotionGraphicEstimateRevalidationFailedError);
  });

  it('throws when clientEstimate is higher than serverEstimate', () => {
    expect(() =>
      revalidateEstimate({ serverEstimate: '0.2000', clientEstimate: '0.5000' }),
    ).toThrow(MotionGraphicEstimateRevalidationFailedError);
  });

  it('throws on an off-by-epsilon mismatch (exact match, no tolerance)', () => {
    expect(() =>
      revalidateEstimate({ serverEstimate: '0.2000', clientEstimate: '0.2001' }),
    ).toThrow(MotionGraphicEstimateRevalidationFailedError);
  });

  it('throws when clientEstimate is null (not supplied)', () => {
    expect(() =>
      revalidateEstimate({ serverEstimate: '0.2000', clientEstimate: null }),
    ).toThrow(MotionGraphicEstimateRevalidationFailedError);
  });

  it('never trusts a zero client estimate against a non-zero server estimate', () => {
    expect(() =>
      revalidateEstimate({ serverEstimate: '0.2000', clientEstimate: '0.0000' }),
    ).toThrow(MotionGraphicEstimateRevalidationFailedError);
  });

  it('thrown error has code "motion_graphic.estimate_revalidation_failed" and status 422', () => {
    const err = (() => {
      try {
        revalidateEstimate({ serverEstimate: '0.2000', clientEstimate: '0.0500' });
      } catch (e) {
        return e;
      }
    })() as MotionGraphicEstimateRevalidationFailedError;

    expect(err).toBeInstanceOf(MotionGraphicEstimateRevalidationFailedError);
    expect(err.code).toBe('motion_graphic.estimate_revalidation_failed');
    expect(err.statusCode).toBe(422);
  });

  it('thrown error details carry serverEstimate and clientEstimate', () => {
    const err = (() => {
      try {
        revalidateEstimate({ serverEstimate: '0.2000', clientEstimate: '0.0500' });
      } catch (e) {
        return e;
      }
    })() as MotionGraphicEstimateRevalidationFailedError;

    expect(err.details).toMatchObject({
      serverEstimate: '0.2000',
      clientEstimate: '0.0500',
    });
  });
});
