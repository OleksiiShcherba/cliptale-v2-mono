/**
 * cost.ts — the client-side cost estimate for a Motion Graphic generation (T16 / AC-11).
 *
 * There is NO cost-estimate endpoint for motion graphics (unlike generate-ai-flow's
 * POST .../estimate). Instead `POST /motion-graphics/generate` re-validates the
 * `acknowledgedCost` the client sends under an EXACT-match rule against its own
 * server-side recompute (motionGraphic.cost.service: `perSecond × durationSeconds`,
 * rounded to DECIMAL(10,4)).
 *
 * So the client mirrors that formula here to (a) DISPLAY the estimate in the cost
 * gate and (b) send the SAME value as `acknowledgedCost` — what is shown is exactly
 * what is sent, so the server's confirmation matches (AC-11). The per-second rate
 * mirrors the configured authoring model's `flow_model_pricing` row; keep it in sync
 * with the server pricing source.
 */

import type { Money } from './types';

/** Mirrors the server authoring model's per-second authoring cost (USD). */
export const MOTION_GRAPHIC_COST_PER_SECOND = 0.01;

export const MOTION_GRAPHIC_COST_CURRENCY = 'USD';

/**
 * Compute the estimate for a generation of `durationSeconds` length. Matches the
 * server's `computeGenerationEstimate`: linear in duration, 0 for non-positive
 * durations, rounded to 4 decimal places (DECIMAL(10,4)).
 */
export function estimateGenerationCost(durationSeconds: number): Money {
  const seconds = Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 0;
  const amount = Number((seconds * MOTION_GRAPHIC_COST_PER_SECOND).toFixed(4));
  return { currency: MOTION_GRAPHIC_COST_CURRENCY, amount };
}
