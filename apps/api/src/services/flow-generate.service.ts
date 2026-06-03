/**
 * flow-generate.service.ts — T9 (estimate) | T11 (validation gate) | T12 (enqueue)
 *
 * This file grows across three tasks:
 *  - T9:  `estimateBlockCost` — non-mutating, no provider call; static pricing.
 *  - T11: validation gate (to be added) — owner, required-input, exclusivity,
 *         content non-empty/valid, referenced-asset presence — all BEFORE any enqueue.
 *  - T12: `generateBlock`    — job create + enqueue + idempotency (to be added).
 *
 * Each exported function is focused and self-contained so later tasks can extend
 * without touching earlier ones.
 */

import { NotFoundError, UnprocessableEntityError } from '@/lib/errors.js';
import { getPriceForModel } from '@/lib/flow-pricing.js';
import { findFlowById } from '@/repositories/generation-flow.repository.js';

// ── Shared types ──────────────────────────────────────────────────────────────

/**
 * ISO 4217 money value — mirrors the `Money` schema in contracts/openapi.yaml.
 */
export type Money = {
  /** ISO 4217 currency code, e.g. "USD". */
  currency: string;
  /** Estimated cost in the currency's major unit (e.g. dollars). */
  amount: number;
};

/**
 * Cost estimate response — mirrors `CostEstimate` in contracts/openapi.yaml.
 */
export type CostEstimate = {
  flowId: string;
  blockId: string;
  modelId: string;
  estimate: Money;
  /** Always true — static-table estimate, reconciled against actuals out of band (ADR-0005). */
  bestEffort: true;
};

// ── estimateBlockCost ─────────────────────────────────────────────────────────

export type EstimateBlockCostParams = {
  flowId: string;
  blockId: string;
  userId: string;
};

/**
 * Returns a best-effort cost estimate for generating a single canvas block.
 *
 * AC-11 / ADR-0005 / openapi POST .../blocks/{blockId}/estimate
 *
 * Behaviour:
 *  - Resolves the block's model from the saved canvas (generation-flow.repository).
 *  - Looks up the static price in flow-pricing.ts.
 *  - Unknown model → amount: 0, bestEffort: true (still a valid estimate per openapi).
 *  - Non-mutating: the canvas and the DB row are never modified.
 *  - No provider call: purely reads local state.
 *
 * Throws:
 *  - `NotFoundError`            when the flow is absent or not owned by `userId`.
 *  - `UnprocessableEntityError` when `blockId` is not found in the canvas, or the
 *                                block is not a generation block (has no modelId).
 */
export async function estimateBlockCost(params: EstimateBlockCostParams): Promise<CostEstimate> {
  const { flowId, blockId, userId } = params;

  // 1. Resolve the flow (owner-scoped; returns null for non-owner or missing — AC-04).
  const flow = await findFlowById(flowId, userId);
  if (!flow) {
    throw new NotFoundError('Flow not found.');
  }

  // 2. Find the block in the canvas (non-mutating read).
  const block = flow.canvas.blocks.find((b) => b.blockId === blockId);
  if (!block) {
    throw new UnprocessableEntityError(
      `Block "${blockId}" not found in canvas.`,
    );
  }

  // 3. Validate that the block is a generation block (only generation blocks have modelId).
  if (block.type !== 'generation') {
    throw new UnprocessableEntityError(
      `Block "${blockId}" is not a generation block (type: ${block.type}).`,
    );
  }

  // 4. Resolve the model id from the block's params.
  const modelId = typeof block.params['modelId'] === 'string'
    ? block.params['modelId']
    : undefined;

  if (!modelId) {
    throw new UnprocessableEntityError(
      `Generation block "${blockId}" has no model selected.`,
    );
  }

  // 5. Look up the static price — unknown model falls back to 0 (bestEffort: true, AC-11).
  const knownPrice = getPriceForModel(modelId);
  const amount = knownPrice ?? 0;

  return {
    flowId,
    blockId,
    modelId,
    estimate: {
      currency: 'USD',
      amount,
    },
    bestEffort: true,
  };
}
