/**
 * T5 — storyboardPipeline.cost.service unit tests
 *
 * Covers:
 *   (a) computeReferenceImageEstimate — for N references
 *   (b) computeSceneImageEstimate     — for N scenes
 *   (c) revalidateEstimate            — ACCEPTS a matching client estimate
 *   (d) revalidateEstimate            — REJECTS a mismatched client estimate (pipeline.estimate_revalidation_failed)
 *
 * Test level: unit — NO database, NO network.
 *
 * AC-03 / AC-04 / §6.1 (abuse: cost-estimate manipulation — client estimate is never trusted).
 * ADR-0006: instrument-only; no credit deduction built here.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks — must precede module import ───────────────────────────────────────

vi.mock('@/repositories/flow-model-pricing.repository.js', () => ({
  getPricingForModel: vi.fn(),
}));

import { getPricingForModel } from '@/repositories/flow-model-pricing.repository.js';
import type { FlowModelPricing } from '@/repositories/flow-model-pricing.repository.js';

import {
  computeReferenceImageEstimate,
  computeSceneImageEstimate,
  revalidateEstimate,
  estimateActualDeltaPct,
  EstimateRevalidationFailedError,
} from './storyboardPipeline.cost.service.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makePricingRow(overrides: Partial<FlowModelPricing> = {}): FlowModelPricing {
  return {
    modelId: 'openai/gpt-image-2',
    currency: 'USD',
    baseAmount: 0.04,
    perSecond: null,
    perImage: null,
    resolutionMult: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── (a) computeReferenceImageEstimate ─────────────────────────────────────────

describe('computeReferenceImageEstimate', () => {
  it('returns "0.0000" when referenceCount is 0', async () => {
    vi.mocked(getPricingForModel).mockResolvedValue(makePricingRow({ baseAmount: 0.04, perImage: null }));

    const result = await computeReferenceImageEstimate({ referenceCount: 0 });

    expect(result).toBe('0.0000');
  });

  it('computes N × perImage when perImage is set', async () => {
    vi.mocked(getPricingForModel).mockResolvedValue(
      makePricingRow({ baseAmount: 0, perImage: 0.05, resolutionMult: null }),
    );

    const result = await computeReferenceImageEstimate({ referenceCount: 4 });

    // 4 × 0.05 = 0.20
    expect(result).toBe('0.2000');
  });

  it('computes N × baseAmount when perImage is null (flat per-run model)', async () => {
    // openai/gpt-image-2 has baseAmount 0.04 and no perImage
    vi.mocked(getPricingForModel).mockResolvedValue(
      makePricingRow({ baseAmount: 0.04, perImage: null }),
    );

    const result = await computeReferenceImageEstimate({ referenceCount: 3 });

    // 3 × 0.04 = 0.12
    expect(result).toBe('0.1200');
  });

  it('falls back to 0.0000 when no pricing row exists for the model', async () => {
    vi.mocked(getPricingForModel).mockResolvedValue(null);

    const result = await computeReferenceImageEstimate({ referenceCount: 5 });

    expect(result).toBe('0.0000');
  });

  it('does NOT call fetch / any network (no external calls)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    vi.mocked(getPricingForModel).mockResolvedValue(makePricingRow());

    await computeReferenceImageEstimate({ referenceCount: 1 });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns a string with exactly 4 decimal places', async () => {
    vi.mocked(getPricingForModel).mockResolvedValue(
      makePricingRow({ baseAmount: 0.03, perImage: null }),
    );

    const result = await computeReferenceImageEstimate({ referenceCount: 1 });

    expect(result).toMatch(/^\d+\.\d{4}$/);
  });
});

// ── (b) computeSceneImageEstimate ─────────────────────────────────────────────

describe('computeSceneImageEstimate', () => {
  it('returns "0.0000" when sceneCount is 0', async () => {
    vi.mocked(getPricingForModel).mockResolvedValue(makePricingRow({ baseAmount: 0.04, perImage: null }));

    const result = await computeSceneImageEstimate({ sceneCount: 0 });

    expect(result).toBe('0.0000');
  });

  it('computes N × perImage when perImage is set', async () => {
    vi.mocked(getPricingForModel).mockResolvedValue(
      makePricingRow({ baseAmount: 0, perImage: 0.06, resolutionMult: null }),
    );

    const result = await computeSceneImageEstimate({ sceneCount: 5 });

    // 5 × 0.06 = 0.30
    expect(result).toBe('0.3000');
  });

  it('computes N × baseAmount when perImage is null (flat per-run model)', async () => {
    vi.mocked(getPricingForModel).mockResolvedValue(
      makePricingRow({ baseAmount: 0.04, perImage: null }),
    );

    const result = await computeSceneImageEstimate({ sceneCount: 10 });

    // 10 × 0.04 = 0.40
    expect(result).toBe('0.4000');
  });

  it('falls back to 0.0000 when no pricing row exists', async () => {
    vi.mocked(getPricingForModel).mockResolvedValue(null);

    const result = await computeSceneImageEstimate({ sceneCount: 7 });

    expect(result).toBe('0.0000');
  });

  it('returns a string with exactly 4 decimal places', async () => {
    vi.mocked(getPricingForModel).mockResolvedValue(
      makePricingRow({ baseAmount: 0.04, perImage: null }),
    );

    const result = await computeSceneImageEstimate({ sceneCount: 2 });

    expect(result).toMatch(/^\d+\.\d{4}$/);
  });
});

// ── (c) revalidateEstimate — ACCEPTS a matching estimate ─────────────────────

describe('revalidateEstimate — accepts matching estimate', () => {
  it('does not throw when clientEstimate exactly matches serverEstimate', () => {
    expect(() =>
      revalidateEstimate({ serverEstimate: '0.1200', clientEstimate: '0.1200' }),
    ).not.toThrow();
  });

  it('does not throw when clientEstimate matches with different trailing zeros', () => {
    // "0.12" vs "0.1200" — same numeric value
    expect(() =>
      revalidateEstimate({ serverEstimate: '0.1200', clientEstimate: '0.12' }),
    ).not.toThrow();
  });

  it('does not throw when both estimates are zero', () => {
    expect(() =>
      revalidateEstimate({ serverEstimate: '0.0000', clientEstimate: '0.0000' }),
    ).not.toThrow();
  });
});

// ── (d) revalidateEstimate — REJECTS a mismatched estimate ───────────────────

describe('revalidateEstimate — rejects mismatched estimate (§6.1 abuse guard)', () => {
  it('throws EstimateRevalidationFailedError when clientEstimate is lower than serverEstimate', () => {
    expect(() =>
      revalidateEstimate({ serverEstimate: '0.1200', clientEstimate: '0.0500' }),
    ).toThrow(EstimateRevalidationFailedError);
  });

  it('throws EstimateRevalidationFailedError when clientEstimate is higher than serverEstimate', () => {
    expect(() =>
      revalidateEstimate({ serverEstimate: '0.1200', clientEstimate: '0.2000' }),
    ).toThrow(EstimateRevalidationFailedError);
  });

  it('throws EstimateRevalidationFailedError when clientEstimate is null (not supplied)', () => {
    expect(() =>
      revalidateEstimate({ serverEstimate: '0.1200', clientEstimate: null }),
    ).toThrow(EstimateRevalidationFailedError);
  });

  it('thrown error has code "pipeline.estimate_revalidation_failed"', () => {
    const err = (() => {
      try {
        revalidateEstimate({ serverEstimate: '0.1200', clientEstimate: '0.0500' });
      } catch (e) {
        return e;
      }
    })();

    expect(err).toBeInstanceOf(EstimateRevalidationFailedError);
    expect((err as EstimateRevalidationFailedError).code).toBe(
      'pipeline.estimate_revalidation_failed',
    );
  });

  it('thrown error details carry serverEstimate and clientEstimate', () => {
    const err = (() => {
      try {
        revalidateEstimate({ serverEstimate: '0.1200', clientEstimate: '0.0500' });
      } catch (e) {
        return e;
      }
    })() as EstimateRevalidationFailedError;

    expect(err.details).toMatchObject({
      serverEstimate: '0.1200',
      clientEstimate: '0.0500',
    });
  });

  it('never trusts a zero client estimate against a non-zero server estimate (§6.1)', () => {
    // Tampering with the shown estimate to "0" to under-charge
    expect(() =>
      revalidateEstimate({ serverEstimate: '0.4000', clientEstimate: '0.0000' }),
    ).toThrow(EstimateRevalidationFailedError);
  });
});

// ── (e) estimateActualDeltaPct — pure delta-percent helper (ADR-0006, SAD §7) ─

describe('estimateActualDeltaPct', () => {
  it('returns +10 when actual is 10% above estimate (estimate=1.0, actual=1.1)', () => {
    expect(estimateActualDeltaPct(1.0, 1.1)).toBeCloseTo(10, 5);
  });

  it('returns -10 when actual is 10% below estimate (estimate=1.0, actual=0.9)', () => {
    expect(estimateActualDeltaPct(1.0, 0.9)).toBeCloseTo(-10, 5);
  });

  it('returns 0 when estimate equals actual', () => {
    expect(estimateActualDeltaPct(0.08, 0.08)).toBe(0);
  });

  it('returns 0 when estimate is 0 (zero-guard to avoid division-by-zero)', () => {
    // A zero estimate with any actual → guard returns 0 (no meaningful percent)
    expect(estimateActualDeltaPct(0, 0.04)).toBe(0);
  });

  it('handles fractional sub-cent amounts correctly', () => {
    // estimate=0.04, actual=0.08 → +100%
    expect(estimateActualDeltaPct(0.04, 0.08)).toBeCloseTo(100, 5);
  });
});
