/**
 * cost.test.ts — pins the client-side Motion Graphic cost mirror (AC-11).
 *
 * The server (motionGraphic.cost.service) re-validates the client's `acknowledgedCost`
 * under an EXACT-match rule against `per_second × durationSeconds`, where `per_second`
 * comes from the seeded flow_model_pricing row (migration 062 → 0.010000). If this client
 * constant ever diverges from that seeded rate, EVERY generate/refine is rejected with a
 * 422, silently breaking the whole live authoring path. These tests pin the constant and
 * the formula so a drift fails here instead of in production.
 *
 * Cross-reference: apps/api/src/db/migrations/062_seed_motion_graphic_authoring_pricing.sql
 * and apps/api/src/db/__tests__/062-motion-graphic-authoring-pricing.migration.test.ts.
 */
import { describe, it, expect } from 'vitest';

import {
  MOTION_GRAPHIC_COST_PER_SECOND,
  MOTION_GRAPHIC_COST_CURRENCY,
  estimateGenerationCost,
} from './cost';

describe('motion graphic client cost mirror', () => {
  it('per-second rate equals the seeded server rate (migration 062: per_second 0.010000)', () => {
    // MUST equal the seeded flow_model_pricing.per_second for the authoring models —
    // an exact-match cost gate rejects 100% of generations on any divergence (AC-11).
    expect(MOTION_GRAPHIC_COST_PER_SECOND).toBe(0.01);
    expect(MOTION_GRAPHIC_COST_CURRENCY).toBe('USD');
  });

  it('mirrors the server formula: per_second × duration, rounded to DECIMAL(10,4)', () => {
    expect(estimateGenerationCost(4)).toEqual({ currency: 'USD', amount: 0.04 });
    expect(estimateGenerationCost(1)).toEqual({ currency: 'USD', amount: 0.01 });
  });

  it('treats non-positive / non-finite durations as 0 (matches server)', () => {
    expect(estimateGenerationCost(0).amount).toBe(0);
    expect(estimateGenerationCost(-5).amount).toBe(0);
    expect(estimateGenerationCost(Number.NaN).amount).toBe(0);
  });
});
