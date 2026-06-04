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

import { randomUUID } from 'node:crypto';

import {
  AssetMissingError,
  ContentInvalidError,
  ExclusivityViolationError,
  NotFoundError,
  OptimisticLockError,
  RateLimitedError,
  RequiredInputMissingError,
  UnprocessableEntityError,
} from '@/lib/errors.js';
import { getPriceForModel } from '@/lib/flow-pricing.js';
import { getPricingForModel } from '@/repositories/flow-model-pricing.repository.js';
import { checkFlowRateLimit } from '@/lib/flow-rate-limit.js';
import { redis } from '@/lib/redis.js';
import { publishAiJobUpdatedById } from '@/lib/realtimePublisher.js';
import { enqueueAiGenerateJob } from '@/queues/jobs/enqueue-ai-generate.js';
import { resolveAssetImageUrls } from '@/services/aiGeneration.assetResolver.js';
import * as aiGenerationJobRepository from '@/repositories/aiGenerationJob.repository.js';
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

  // 5. DB-backed pricing (ADR-0008 / AC-20) with static-table fallback (AC-11).
  //    Attempt to fetch a row from flow_model_pricing. If found, compute the
  //    param-reactive amount; otherwise fall back to the static FLOW_PRICE_TABLE.
  const pricingRow = await getPricingForModel(modelId);

  let amount: number;
  let currency: string;

  if (pricingRow) {
    // Resolve catalog model for default param values.
    const catalogModel = AI_MODELS.find((m) => m.id === modelId);
    // block is guaranteed non-undefined here (we threw above if absent), but
    // TypeScript's control-flow analysis doesn't propagate into nested functions,
    // so we capture it in a const to make the narrowing explicit.
    const resolvedBlock = block;

    // Resolve duration_s:
    //   1. params['duration'] finite > 0
    //   2. params['music_length_ms'] / 1000 finite > 0
    //   3. catalog default for 'duration' field finite > 0
    //   4. catalog default for 'music_length_ms' field / 1000 finite > 0
    //   5. 0
    function resolveDurationSeconds(): number {
      const p = resolvedBlock.params;
      const d = Number(p['duration']);
      if (isFinite(d) && d > 0) return d;
      const ms = Number(p['music_length_ms']);
      if (isFinite(ms) && ms > 0) return ms / 1000;
      if (catalogModel) {
        const dField = catalogModel.inputSchema.fields.find((f) => f.name === 'duration');
        const dDefault = Number(dField?.default);
        if (isFinite(dDefault) && dDefault > 0) return dDefault;
        const msField = catalogModel.inputSchema.fields.find((f) => f.name === 'music_length_ms');
        const msDefault = Number(msField?.default);
        if (isFinite(msDefault) && msDefault > 0) return msDefault / 1000;
      }
      return 0;
    }

    // Resolve num_images:
    //   1. params['num_images'] finite > 0
    //   2. catalog default for 'num_images' field finite > 0
    //   3. 1
    function resolveNumImages(): number {
      const n = Number(resolvedBlock.params['num_images']);
      if (isFinite(n) && n > 0) return n;
      if (catalogModel) {
        const f = catalogModel.inputSchema.fields.find((fld) => fld.name === 'num_images');
        const def = Number(f?.default);
        if (isFinite(def) && def > 0) return def;
      }
      return 1;
    }

    const durationS = resolveDurationSeconds();
    const numImages = resolveNumImages();
    const resolution = String(
      resolvedBlock.params['resolution'] ??
        catalogModel?.inputSchema.fields.find((f) => f.name === 'resolution')?.default ??
        '',
    );

    const mult = pricingRow.resolutionMult?.[resolution] ?? 1;
    const raw =
      (pricingRow.baseAmount +
        (pricingRow.perSecond ?? 0) * durationS +
        (pricingRow.perImage ?? 0) * numImages) *
      mult;
    amount = Math.round(raw * 100) / 100;
    currency = pricingRow.currency;
  } else {
    // No DB row — static FLOW_PRICE_TABLE fallback (bestEffort: true, AC-11).
    amount = getPriceForModel(modelId) ?? 0;
    currency = 'USD';
  }

  return {
    flowId,
    blockId,
    modelId,
    estimate: {
      currency,
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
  /** The resolved canvas — reused by the enqueue step so it need not re-read (T12). */
  canvas: FlowCanvas;
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
  if (active) {
    // F7 / AC-17: an owned asset that is not `ready` (ingest still processing, or
    // failed) carries no usable bytes — block the run before any provider call
    // rather than send an empty input to the paid model.
    if (active.status !== 'ready') {
      throw new ContentInvalidError(
        'A library asset this block uses is not ready yet (it is still processing or its upload failed). ' +
          'Replace it or wait for it to finish, then try again.',
        { blockId: contentBlockId, fileId, reason: 'asset_not_ready' },
      );
    }
    return; // exists, owned, ready — fine
  }

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
    canvas: flow.canvas,
  };
}

// ── generate (enqueue) ──────────────────────────────────────────────────────────
//
// T12 — the spend-path accept half (AC-01/12/13). Order, fail-fast, spend-last:
//   0. idempotency claim — a repeated Idempotency-Key returns the FIRST job and
//      NEVER creates a second job or enqueues twice (F-3 submit-side dedupe, 24h).
//   1. validateGenerateGate (T11) — owner + all input checks, BEFORE any spend.
//   2. optimistic version check — a stale flow version → OptimisticLockError (409).
//   3. rate limit (T10) — over the per-Creator cap → RateLimitedError (429), no spend.
//   4. create the ai_generation_job (flow_id, block_id) and enqueue the ONE
//      `ai-generate` BullMQ job — the same queue/path the existing generate uses
//      (aiGeneration.service.submitGeneration). image / video / audio all route here.

export type GenerateParams = {
  flowId: string;
  blockId: string;
  userId: string;
  /** The flow version the Creator generated against; a mismatch → 409 (AC-10b). */
  version?: number;
  /** Client-generated key; a repeat returns the first run's job (24h TTL). */
  idempotencyKey: string;
};

/** Accepted shape — mirrors POST .../generate 202 GenerateAccepted in openapi.yaml. */
export type GenerateAccepted = {
  jobId: string;
  blockId: string;
  status: 'queued';
};

/** Submit-side idempotency: TTL for the Idempotency-Key dedupe record (24h, per openapi). */
const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
/** Marker stored under the key while the first run is still being created. */
const IDEMPOTENCY_PENDING = '__pending__';

function idempotencyRedisKey(userId: string, idempotencyKey: string): string {
  return `flow:generate:idem:${userId}:${idempotencyKey}`;
}

/**
 * Builds the worker-consumable `options` map for a generation block by merging
 * the block's own supplied params (minus the routing-only `modelId`) with the
 * value carried by each connected content/result block, keyed by the catalog
 * field name (the target handle). Text sources contribute their text; asset and
 * result sources contribute their fileId. This keeps the canvas → job mapping in
 * one place so every modality (image/video/audio) flows through this single path.
 */
export function buildJobOptions(validated: ValidatedGate, canvas: FlowCanvas): Record<string, unknown> {
  const { block, model } = validated;

  const options: Record<string, unknown> = {};
  // 1. Directly-supplied params from the generation block (excluding modelId).
  for (const [key, value] of Object.entries(block.params)) {
    if (key === 'modelId') continue;
    options[key] = value;
  }

  // 2. Values fed in by connected content/result blocks, keyed by target handle.
  //    A multi handle (`image_url_list`, e.g. nano-banana-2/edit's `image_urls`) may
  //    have several incoming edges and MUST be an array — the asset resolver requires
  //    a list and the provider rejects a bare string (422 list_type). Single-value
  //    fields keep the first connection's value.
  for (const field of model.inputSchema.fields) {
    const fieldEdges = canvas.edges.filter(
      (e) => e.targetBlockId === block.blockId && e.targetHandle === field.name,
    );
    if (fieldEdges.length === 0) continue;

    const values: unknown[] = [];
    for (const e of fieldEdges) {
      const source = canvas.blocks.find((b) => b.blockId === e.sourceBlockId);
      if (!source) continue;
      const contentType =
        typeof source.params['contentType'] === 'string' ? source.params['contentType'] : undefined;

      if (contentType === 'text' || field.modality === 'text') {
        if (typeof source.params['text'] === 'string') values.push(source.params['text']);
      } else if (typeof source.params['fileId'] === 'string') {
        // Asset or result source → its library file id; resolveAssetImageUrls (below)
        // rewrites image/audio file ids to presigned URLs before enqueue.
        values.push(source.params['fileId']);
      }
    }
    if (values.length === 0) continue;

    options[field.name] = field.type === 'image_url_list' ? values : values[0];
  }

  return options;
}

/** Derives the non-null `prompt` column value from the assembled options. */
function derivePrompt(options: Record<string, unknown>): string {
  const prompt = options['prompt'];
  if (typeof prompt === 'string' && prompt.length > 0) return prompt;
  const text = options['text'];
  if (typeof text === 'string' && text.length > 0) return text;
  const mp = options['multi_prompt'];
  if (Array.isArray(mp) && typeof mp[0] === 'string' && mp[0].length > 0) return mp[0];
  return '';
}

/**
 * The single, server-authoritative spend path for a flow generation.
 *
 * On a passed gate + version + rate-limit check, creates exactly one
 * ai_generation_job (carrying flow_id + block_id) and enqueues exactly one
 * `ai-generate` BullMQ job. Idempotent on a repeated Idempotency-Key.
 *
 * Throws:
 *  - NotFoundError (404)        — flow/asset absent or not owned (existence hiding).
 *  - GateError (422)            — required-input / exclusivity / asset-missing / content (T11).
 *  - OptimisticLockError (409)  — the flow changed since the Creator opened it (AC-10b).
 *  - RateLimitedError (429)     — over the per-Creator cap (ADR-0004), before any spend.
 */
export async function generate(params: GenerateParams): Promise<GenerateAccepted> {
  const { flowId, blockId, userId, version, idempotencyKey } = params;

  const idemKey = idempotencyRedisKey(userId, idempotencyKey);

  // 0. Idempotency claim. SET NX wins the race for the FIRST run; a loser reads
  //    the stored result and returns it — no second gate, job, charge, or enqueue.
  const claimed = await redis.set(idemKey, IDEMPOTENCY_PENDING, 'EX', IDEMPOTENCY_TTL_SECONDS, 'NX');
  if (claimed !== 'OK') {
    const stored = await redis.get(idemKey);
    if (stored && stored !== IDEMPOTENCY_PENDING) {
      return JSON.parse(stored) as GenerateAccepted;
    }
    // The first run is still in flight (or its claim record vanished). Surface a
    // conflict rather than risk a duplicate charge — the client retries shortly.
    throw new RateLimitedError(
      'A generation for this request is already being processed. Try again in a moment.',
      1,
      { idempotent: true },
    );
  }

  try {
    // 1. Gate FIRST — owner + every input check, before any spend (T11).
    const validated = await validateGenerateGate({ flowId, blockId, userId });

    // 2. Optimistic version check — a stale version → 409 (AC-10b), before spend.
    if (version !== undefined && validated.flow.version !== version) {
      throw new OptimisticLockError(
        'This flow changed since you opened it. Reload before generating.',
      );
    }

    // 3. Rate limit — over the per-Creator cap → 429 (ADR-0004), before spend.
    const rate = await checkFlowRateLimit(userId);
    if (!rate.allowed) {
      throw new RateLimitedError(
        'Too many generations. Try again in a moment.',
        rate.retryAfterSeconds,
        { limitPerMinute: 30 },
      );
    }

    // 4. Create the job + enqueue — the ONE ai-generate path. All modalities here.
    //    Image/audio file ids are rewritten to short-lived presigned HTTPS URLs the
    //    worker forwards verbatim — the provider needs real URLs, not internal ids.
    const builtOptions = buildJobOptions(validated, validated.canvas);
    const options = await resolveAssetImageUrls({
      model: validated.model,
      options: builtOptions,
      userId,
    });
    const prompt = derivePrompt(options);
    const jobId = randomUUID();

    await aiGenerationJobRepository.createJob({
      jobId,
      userId,
      modelId: validated.modelId,
      capability: validated.model.capability,
      prompt,
      options,
    });
    // Write the flow back-links (T7) so the worker can link the result (T13) and
    // the reattach query (AC-08b) can find this run.
    await aiGenerationJobRepository.setFlowLink(jobId, flowId, blockId);

    try {
      await enqueueAiGenerateJob({
        jobId,
        userId,
        modelId: validated.modelId,
        capability: validated.model.capability,
        provider: validated.model.provider,
        prompt,
        options,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to enqueue generation job';
      await aiGenerationJobRepository.updateJobStatus(jobId, 'failed', message);
      await publishAiJobUpdatedById(jobId, {
        resource: 'aiGenerationJob',
        jobId,
        status: 'failed',
        errorMessage: message,
      });
      throw error;
    }

    await publishAiJobUpdatedById(jobId, {
      resource: 'aiGenerationJob',
      jobId,
      status: 'queued',
      progress: 0,
      outputFileId: null,
      errorMessage: null,
    });

    const result: GenerateAccepted = { jobId, blockId, status: 'queued' };

    // Persist the result under the idempotency key so a retry returns this job.
    await redis.set(idemKey, JSON.stringify(result), 'EX', IDEMPOTENCY_TTL_SECONDS);

    return result;
  } catch (error) {
    // A failed attempt must not "burn" the key — release it so the Creator can
    // legitimately retry (a fresh, charged Generate, AC-09) with the same key.
    await redis.del(idemKey).catch(() => undefined);
    throw error;
  }
}
