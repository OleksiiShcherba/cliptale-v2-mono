/**
 * storyboardPipeline.cost.service.ts — T5 (server-side cost estimate compute + re-validate)
 *
 * Computes the reference-image and scene-image cost estimates SERVER-SIDE from the
 * existing `flow_model_pricing` table (ADR-0006 / AC-03 / AC-04 / §6.1).
 *
 * Design contract (ADR-0006):
 *  - Instrument-only: compute + persist the estimate; do NOT build a credits/ledger/deduction.
 *  - Client estimate is NEVER trusted: the `revalidateEstimate` function is the authoritative
 *    check; a mismatch throws `EstimateRevalidationFailedError` (pipeline.estimate_revalidation_failed).
 *  - Cost is produced as a DECIMAL(10,4)-compatible string (e.g. "0.1200") matching the column type.
 *
 * Pricing source: `flow_model_pricing` via `getPricingForModel` (same source as
 * `estimateBlockCost` in flow-generate.service.ts — reused, not reinvented).
 *
 * Models:
 *  - Reference-image: STORYBOARD_ILLUSTRATION_MODEL_ID  ("openai/gpt-image-2")
 *  - Scene-image:     same model (both pipeline phases use the same illustration model)
 *
 * Cost formula (per unit):
 *   if pricingRow.perImage != null → perImage × count
 *   else                           → baseAmount × count  (flat per-run)
 *   If no pricing row → 0.0000 (safe fallback; logged by caller if needed)
 */

import { getPricingForModel } from '@/repositories/flow-model-pricing.repository.js';
import { GateError } from '@/lib/errors.js';
import { STORYBOARD_ILLUSTRATION_MODEL_ID } from './storyboardIllustration.config.js';

// ── Error type ────────────────────────────────────────────────────────────────

/**
 * Raised when the client-supplied cost estimate does not match the server-recomputed
 * value (§6.1 abuse guard: cost-estimate manipulation).
 *
 * Maps to HTTP 422 with code `pipeline.estimate_revalidation_failed`.
 */
export class EstimateRevalidationFailedError extends GateError {
  constructor(details: { serverEstimate: string; clientEstimate: string | null }) {
    super(
      'The cost estimate shown to you does not match the server-computed price. ' +
        'Please reload and try again.',
      'pipeline.estimate_revalidation_failed',
      details,
    );
    this.name = 'EstimateRevalidationFailedError';
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Formats a numeric cost as a DECIMAL(10,4)-compatible string (e.g. 0.12 → "0.1200").
 * Rounds to 4 dp to avoid float drift.
 */
function toDecimalString(amount: number): string {
  return amount.toFixed(4);
}

/**
 * Computes the per-unit cost for the illustration model.
 *
 * Priority:
 *   1. pricingRow.perImage (explicit per-image charge)
 *   2. pricingRow.baseAmount (flat per-run charge — one call = one image)
 *   3. 0 (no row)
 */
async function computePerUnitCost(): Promise<number> {
  const pricingRow = await getPricingForModel(STORYBOARD_ILLUSTRATION_MODEL_ID);
  if (!pricingRow) return 0;
  return pricingRow.perImage ?? pricingRow.baseAmount;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Computes the server-side cost estimate for generating `referenceCount` reference images.
 *
 * Returns a DECIMAL(10,4)-formatted string (e.g. "0.1200"), ready to be persisted in
 * `storyboard_pipeline.cost_estimate` via `casUpdateState`.
 *
 * AC-03 — shown in the cast-proposal modal before the Creator commits.
 * ADR-0006 — instrument only; no credit deduction.
 */
export async function computeReferenceImageEstimate(params: {
  referenceCount: number;
}): Promise<string> {
  const { referenceCount } = params;
  if (referenceCount === 0) return toDecimalString(0);

  const perUnit = await computePerUnitCost();
  const total = perUnit * referenceCount;
  return toDecimalString(total);
}

/**
 * Computes the server-side cost estimate for generating `sceneCount` scene images.
 *
 * Returns a DECIMAL(10,4)-formatted string (e.g. "0.4000"), ready to be persisted in
 * `storyboard_pipeline.cost_estimate` via `casUpdateState`.
 *
 * AC-04 — shown in the scene-image offer modal before the Creator commits.
 * ADR-0006 — instrument only; no credit deduction.
 */
export async function computeSceneImageEstimate(params: { sceneCount: number }): Promise<string> {
  const { sceneCount } = params;
  if (sceneCount === 0) return toDecimalString(0);

  const perUnit = await computePerUnitCost();
  const total = perUnit * sceneCount;
  return toDecimalString(total);
}

/**
 * Computes the estimate-vs-actual delta as a signed percentage.
 *
 *   delta = ((actual - estimate) / estimate) × 100
 *
 * A positive value means actual exceeded the estimate; negative means underrun.
 * Returns 0 when estimate is 0 (zero-guard to prevent division by zero — a zero estimate
 * makes the percent meaningless; the absolute actual is in the log alongside it).
 *
 * This is the canonical formula for the KPI metric `cost_estimate_actual_delta_pct`
 * (SAD §7, ADR-0006). The worker duplicates the 3-line body because it cannot import
 * API services; both copies are unit-tested to stay in sync.
 *
 * AC-03 / AC-04 / ADR-0006.
 */
export function estimateActualDeltaPct(estimate: number, actual: number): number {
  if (estimate === 0) return 0;
  return ((actual - estimate) / estimate) * 100;
}

/**
 * Re-validates a client-supplied cost estimate against the server-recomputed value.
 *
 * The client estimate is NEVER trusted (§6.1 abuse case: "cost-estimate manipulation").
 * This function is called at confirm/trigger time, after `computeReferenceImageEstimate`
 * or `computeSceneImageEstimate` has been run.
 *
 * Throws `EstimateRevalidationFailedError` when:
 *   - `clientEstimate` is null/undefined (not supplied)
 *   - `clientEstimate` differs numerically from `serverEstimate`
 *
 * The server estimate is the source of truth: an exact numeric match is required.
 * No tolerance is applied — the server recomputes from the same model × count, so
 * a mismatch always means the client sent a different value (tampered or stale).
 */
export function revalidateEstimate(params: {
  serverEstimate: string;
  clientEstimate: string | null | undefined;
}): void {
  const { serverEstimate, clientEstimate } = params;

  // Null/undefined client value → never supplied → reject.
  if (clientEstimate == null) {
    throw new EstimateRevalidationFailedError({
      serverEstimate,
      clientEstimate: null,
    });
  }

  const serverNum = parseFloat(serverEstimate);
  const clientNum = parseFloat(clientEstimate);

  if (!isFinite(clientNum) || clientNum !== serverNum) {
    throw new EstimateRevalidationFailedError({
      serverEstimate,
      clientEstimate,
    });
  }
}
