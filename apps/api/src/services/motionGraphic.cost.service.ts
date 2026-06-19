/**
 * motionGraphic.cost.service.ts — T7 (server-side cost estimate compute + re-validate)
 *
 * Mirror of `storyboardPipeline.cost.service.ts`: computes a generation cost estimate
 * SERVER-SIDE and re-validates a client-supplied estimate under the SAME exact-match rule,
 * refusing the run on mismatch (AC-11 / spec §6.1 abuse: cost-estimate manipulation).
 *
 * Design contract (mirrors ADR-0006 of the pipeline cost gate):
 *  - Instrument-only: compute the estimate; do NOT build a credits/ledger/deduction.
 *  - Client estimate is NEVER trusted: `revalidateEstimate` is the authoritative check;
 *    a mismatch throws `MotionGraphicEstimateRevalidationFailedError`
 *    (`motion_graphic.estimate_revalidation_failed`, HTTP 422).
 *  - Cost is produced as a DECIMAL(10,4)-compatible string (e.g. "0.2000").
 *
 * Pricing source: `flow_model_pricing` via `getPricingForModel` (same source as the
 * pipeline cost service — reused, not reinvented), keyed by the configured Claude
 * authoring model id (ADR-0002, `config.anthropic.model`).
 *
 * Cost formula (per generation/refinement):
 *   The only authoring-request size driver available before the stream opens is the
 *   animation `durationSeconds` the Creator set (the AI authors code to fit that length —
 *   longer animations cost more authoring tokens). The estimate scales linearly with it:
 *     if pricingRow.perSecond != null → perSecond × durationSeconds
 *     else                            → baseAmount × durationSeconds  (flat per-run base)
 *   If no pricing row → 0.0000 (safe fallback, mirroring the pipeline service).
 */

import { getPricingForModel } from '@/repositories/flow-model-pricing.repository.js';
import { GateError } from '@/lib/errors.js';
import { config } from '@/config.js';

// ── Error type ────────────────────────────────────────────────────────────────

/**
 * Raised when the client-supplied cost estimate does not match the server-recomputed
 * value (spec §6.1 abuse guard: cost-estimate manipulation; AC-11).
 *
 * Maps to HTTP 422 (GateError → UnprocessableEntityError) with code
 * `motion_graphic.estimate_revalidation_failed` and `details: { serverEstimate, clientEstimate }`.
 */
export class MotionGraphicEstimateRevalidationFailedError extends GateError {
  constructor(details: { serverEstimate: string; clientEstimate: string | null }) {
    super(
      'The cost estimate shown to you could not be confirmed. Please reload and try again.',
      'motion_graphic.estimate_revalidation_failed',
      details,
    );
    this.name = 'MotionGraphicEstimateRevalidationFailedError';
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Formats a numeric cost as a DECIMAL(10,4)-compatible string (e.g. 0.2 → "0.2000").
 * Rounds to 4 dp to avoid float drift.
 */
function toDecimalString(amount: number): string {
  return amount.toFixed(4);
}

/**
 * Per-second cost for the configured authoring model.
 *
 * Priority:
 *   1. pricingRow.perSecond (explicit per-second charge)
 *   2. pricingRow.baseAmount (flat per-run charge, scaled by duration)
 *   3. 0 (no row)
 */
async function computePerSecondCost(): Promise<number> {
  const pricingRow = await getPricingForModel(config.anthropic.model);
  if (!pricingRow) return 0;
  return pricingRow.perSecond ?? pricingRow.baseAmount;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Computes the server-side cost estimate for authoring a Motion Graphic of
 * `durationSeconds` length, as a DECIMAL(10,4)-formatted string (e.g. "0.2000").
 *
 * Deterministic for given inputs (no randomness, no wall-clock). Called before the
 * generate/refine stream opens (T9); the result is re-validated against the client's
 * shown estimate via `revalidateEstimate`.
 *
 * AC-11 — the shown estimate must be confirmable by this independent re-computation.
 */
export async function computeGenerationEstimate(params: {
  durationSeconds: number;
}): Promise<string> {
  const { durationSeconds } = params;
  if (durationSeconds <= 0) return toDecimalString(0);

  const perSecond = await computePerSecondCost();
  const total = perSecond * durationSeconds;
  return toDecimalString(total);
}

/**
 * Re-validates a client-supplied cost estimate against the server-recomputed value.
 *
 * The client estimate is NEVER trusted (spec §6.1 abuse case: "cost-estimate manipulation").
 * Called at generate/refine time, after `computeGenerationEstimate` has been run.
 *
 * Throws `MotionGraphicEstimateRevalidationFailedError` when:
 *   - `clientEstimate` is null/undefined (not supplied)
 *   - `clientEstimate` differs numerically from `serverEstimate`
 *
 * The server estimate is the source of truth: an EXACT numeric match is required — the
 * same rule `storyboardPipeline.cost.service.revalidateEstimate` applies. No tolerance is
 * applied, so any mismatch (including off-by-epsilon) is rejected.
 */
export function revalidateEstimate(params: {
  serverEstimate: string;
  clientEstimate: string | null | undefined;
}): void {
  const { serverEstimate, clientEstimate } = params;

  // Null/undefined client value → never supplied → reject.
  if (clientEstimate == null) {
    throw new MotionGraphicEstimateRevalidationFailedError({
      serverEstimate,
      clientEstimate: null,
    });
  }

  const serverNum = parseFloat(serverEstimate);
  const clientNum = parseFloat(clientEstimate);

  if (!isFinite(clientNum) || clientNum !== serverNum) {
    throw new MotionGraphicEstimateRevalidationFailedError({
      serverEstimate,
      clientEstimate,
    });
  }
}
