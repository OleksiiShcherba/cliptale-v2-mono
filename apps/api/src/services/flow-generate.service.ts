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

import {
  AssetMissingError,
  ContentInvalidError,
  ExclusivityViolationError,
  NotFoundError,
  RequiredInputMissingError,
  UnprocessableEntityError,
} from '@/lib/errors.js';
import { getPriceForModel } from '@/lib/flow-pricing.js';
import { findFlowById } from '@/repositories/generation-flow.repository.js';
import {
  findByIdForUser,
  findByIdIncludingDeleted,
} from '@/repositories/file.repository.js';
import { AI_MODELS } from '@ai-video-editor/api-contracts';
import type { AiModel, FalFieldSchema } from '@ai-video-editor/api-contracts';
import type { FlowBlock, FlowCanvas } from '@ai-video-editor/project-schema';

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

// ── validateGenerateGate ────────────────────────────────────────────────────────
//
// T11 — the SERVER-AUTHORITATIVE Generate validation gate (AC-03/04/05/06/17).
//
// Runs BEFORE any enqueue / provider call. The browser is untrusted: every check
// here is re-derived from the persisted canvas + the model catalog + the files
// table, never from anything the client asserts.
//
// Order of checks (fail-fast, security-first):
//   1. owner            — flow absent / not owned → NotFoundError (404, existence hiding).
//   2. block resolution — generation block + a catalog model.
//   3. per required input — resolve a source; if unmet → RequiredInputMissingError (422).
//   4. exclusivity      — each exclusiveGroup must have exactly one provided field (422).
//   5. content validity — every PROVIDED input's content is non-empty / modality-valid;
//                          referenced assets must exist + be owned. A previously-owned-but-
//                          missing asset → AssetMissingError (422); a never-owned asset →
//                          NotFoundError (404, same as a non-owner flow). Get this exact.

export type ValidateGenerateGateParams = {
  flowId: string;
  blockId: string;
  userId: string;
};

/** What the gate resolved on a pass — handed to the enqueue step (T12). */
export type ValidatedGate = {
  flow: { flowId: string; userId: string; version: number };
  block: FlowBlock;
  model: AiModel;
  modelId: string;
};

/** Maps a catalog field's modality to the `files.kind` it must be fed by. */
function modalityToFileKind(modality: string | undefined): string | undefined {
  switch (modality) {
    case 'image':
      return 'image';
    case 'audio':
      return 'audio';
    case 'video':
      return 'video';
    default:
      return undefined; // text / untyped fields are not asset-backed
  }
}

/** True when a directly-supplied param value counts as "provided" (non-empty). */
function isSuppliedNonEmpty(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'number' || typeof value === 'boolean') return true;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return false;
}

/**
 * Resolves how a single model input field is provided to the generation block.
 * Returns the incoming edge's source content block (connection), or a sentinel for
 * a directly-supplied param, or null when the input is not provided at all.
 */
function resolveInput(
  field: FalFieldSchema,
  block: FlowBlock,
  canvas: FlowCanvas,
): { kind: 'connection'; source: FlowBlock } | { kind: 'supplied' } | null {
  const edge = canvas.edges.find(
    (e) => e.targetBlockId === block.blockId && e.targetHandle === field.name,
  );
  if (edge) {
    const source = canvas.blocks.find((b) => b.blockId === edge.sourceBlockId);
    // A dangling edge (source block deleted) is treated as not-connected.
    if (source) return { kind: 'connection', source };
  }
  if (isSuppliedNonEmpty(block.params[field.name])) {
    return { kind: 'supplied' };
  }
  return null;
}

/**
 * Validates a referenced library asset for owner + existence, applying the
 * existence-hiding rule precisely:
 *   - present + owned + active            → OK
 *   - previously owned, now soft-deleted  → AssetMissingError (422, AC-05)
 *   - never owned (no row OR another user's row) → NotFoundError (404, AC-04)
 */
async function assertAssetUsable(
  fileId: string,
  userId: string,
  contentBlockId: string,
): Promise<void> {
  const active = await findByIdForUser(fileId, userId);
  if (active) return; // exists, owned, not deleted — fine

  // Not active for this user. Distinguish previously-owned-missing from never-owned.
  const anyRow = await findByIdIncludingDeleted(fileId);
  if (anyRow && anyRow.userId === userId) {
    // The Creator DID own this asset; it is now gone (soft-deleted) → 422.
    throw new AssetMissingError(
      'A library asset this block uses is missing. Replace it and try again.',
      { blockId: contentBlockId, fileId },
    );
  }
  // No row, or a row owned by someone else → never owned by this Creator. 404, no leak.
  throw new NotFoundError('Flow not found.');
}

/**
 * Validates the content carried by a provided input — empties and modality
 * mismatches surface as ContentInvalidError; referenced assets go through the
 * owner/existence gate above.
 */
async function assertContentValid(
  field: FalFieldSchema,
  source: FlowBlock,
  userId: string,
): Promise<void> {
  const params = source.params;
  const contentType = typeof params['contentType'] === 'string' ? params['contentType'] : undefined;

  // Text source (or a text-typed handle fed by a text block).
  if (contentType === 'text' || field.modality === 'text') {
    const text = params['text'];
    if (typeof text !== 'string' || text.trim().length === 0) {
      throw new ContentInvalidError('The text content block is empty.', {
        blockId: source.blockId,
        reason: 'empty',
      });
    }
    return;
  }

  // Asset-backed source (image / audio / video).
  if (contentType === 'asset') {
    const fileId = params['fileId'];
    if (typeof fileId !== 'string' || fileId.length === 0) {
      throw new ContentInvalidError('A content block has no asset selected.', {
        blockId: source.blockId,
        reason: 'empty',
      });
    }
    // Owner + existence (asset_missing vs 404).
    await assertAssetUsable(fileId, userId, source.blockId);

    // Modality must match the input handle (e.g. an image handle can't take audio).
    const expectedKind = modalityToFileKind(field.modality);
    if (expectedKind) {
      const asset = await findByIdForUser(fileId, userId);
      if (asset && asset.kind !== expectedKind) {
        throw new ContentInvalidError(
          `This input expects ${field.modality}, but the connected asset is ${asset.kind}.`,
          { blockId: source.blockId, reason: 'modality_mismatch', expected: field.modality },
        );
      }
    }
    return;
  }

  // A result-block source (AC-18) carries produced media; if it declares a fileId, gate it.
  const resultFileId = params['fileId'];
  if (typeof resultFileId === 'string' && resultFileId.length > 0) {
    await assertAssetUsable(resultFileId, userId, source.blockId);
  }
}

/**
 * The server-authoritative Generate gate. Throws a typed error on any failure;
 * returns the resolved flow/block/model on a clean pass (for the enqueue step).
 */
export async function validateGenerateGate(
  params: ValidateGenerateGateParams,
): Promise<ValidatedGate> {
  const { flowId, blockId, userId } = params;

  // 1. Owner check — absent / non-owner are indistinguishable (AC-04).
  const flow = await findFlowById(flowId, userId);
  if (!flow) {
    throw new NotFoundError('Flow not found.');
  }

  // 2. Resolve the target generation block + its catalog model.
  const block = flow.canvas.blocks.find((b) => b.blockId === blockId);
  if (!block) {
    throw new UnprocessableEntityError(`Block "${blockId}" not found in canvas.`);
  }
  if (block.type !== 'generation') {
    throw new UnprocessableEntityError(
      `Block "${blockId}" is not a generation block (type: ${block.type}).`,
    );
  }
  const modelId = typeof block.params['modelId'] === 'string' ? block.params['modelId'] : undefined;
  if (!modelId) {
    throw new UnprocessableEntityError(`Generation block "${blockId}" has no model selected.`);
  }
  const model = AI_MODELS.find((m) => m.id === modelId);
  if (!model) {
    throw new UnprocessableEntityError(`Unknown model "${modelId}".`);
  }

  const fields = model.inputSchema.fields;

  // 3. Required-input resolution — every required field must be provided (AC-03).
  for (const field of fields) {
    if (!field.required) continue;
    // Fields in an exclusiveGroup are checked by the XOR pass below, not here
    // (a required field is normally not also grouped, but guard anyway).
    if (field.exclusiveGroup) continue;
    if (resolveInput(field, block, flow.canvas) === null) {
      throw new RequiredInputMissingError('Connect a required input before generating.', {
        blockId,
        input: field.name,
      });
    }
  }

  // 4. Exactly-one-of exclusivity — each exclusiveGroup must have exactly one provided (AC-06).
  const groups = new Map<string, FalFieldSchema[]>();
  for (const field of fields) {
    if (!field.exclusiveGroup) continue;
    const list = groups.get(field.exclusiveGroup) ?? [];
    list.push(field);
    groups.set(field.exclusiveGroup, list);
  }
  for (const [groupName, groupFields] of groups) {
    const provided = groupFields
      .filter((f) => resolveInput(f, block, flow.canvas) !== null)
      .map((f) => f.name);
    if (provided.length !== 1) {
      throw new ExclusivityViolationError(
        `Provide exactly one of: ${groupFields.map((f) => f.name).join(', ')}.`,
        { blockId, exclusiveGroup: groupName, provided },
      );
    }
  }

  // 5. Content validity — every PROVIDED input via a connection is non-empty / valid,
  //    and referenced assets exist + are owned (asset_missing vs 404).
  for (const field of fields) {
    const resolved = resolveInput(field, block, flow.canvas);
    if (!resolved || resolved.kind !== 'connection') continue;
    await assertContentValid(field, resolved.source, userId);
  }

  return {
    flow: { flowId: flow.flowId, userId: flow.userId, version: flow.version },
    block,
    model,
    modelId,
  };
}
