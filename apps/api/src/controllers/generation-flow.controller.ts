/**
 * generation-flow.controller — thin HTTP adapter for the Flow resource.
 *
 * Responsibilities (T14):
 *   - Parse and Zod-validate request bodies/params.
 *   - Delegate to generation-flow.service.
 *   - Shape the HTTP response (camelCase, per OpenAPI contract).
 *   - Forward all errors to next() — the centralized handler in index.ts maps
 *     typed errors to status codes (NotFoundError→404, OptimisticLockError→409, …).
 *
 * NOTE: T15 will ADD estimate + generate handlers to this file — keep extensible.
 */
import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';

import { ValidationError } from '@/lib/errors.js';
import * as flowService from '@/services/generation-flow.service.js';
import * as flowGenerateService from '@/services/flow-generate.service.js';
import type { FlowRecord } from '@/repositories/generation-flow.repository.js';
import type { AiGenerationJob } from '@/repositories/aiGenerationJob.repository.js';
import type { FlowWithBadge } from '@/services/generation-flow.service.js';

// ── Zod schemas ───────────────────────────────────────────────────────────────

export const createFlowSchema = z.object({
  title: z.string().max(255).optional(),
});

export const renameFlowSchema = z.object({
  title: z.string().min(1).max(255),
});

/**
 * Canvas save body: `{ version, canvas }`.
 * canvas is validated minimally here (object); project-schema Zod validation is
 * applied inside the service/repository layer (ADR-0002 — canvas is an opaque JSON
 * document from the controller's perspective).
 */
export const saveCanvasSchema = z.object({
  version: z.number().int().min(1),
  canvas: z.record(z.unknown()),
});

/**
 * Generate body: `{ version, acknowledgedCost? }`.
 * `version` is the flow version the Creator generated against — a stale value is
 * rejected with 409 by the service (OptimisticLockError). `acknowledgedCost` is
 * advisory only (the server is authoritative on price) and is not forwarded.
 */
export const generateSchema = z.object({
  version: z.number().int().min(1),
  acknowledgedCost: z
    .object({
      currency: z.string(),
      amount: z.number().min(0),
    })
    .optional(),
});

// ── Response helpers ──────────────────────────────────────────────────────────

/** Maps a FlowRecord to the FlowSummary wire shape (no canvas). */
function toSummary(flow: FlowRecord) {
  return {
    flowId: flow.flowId,
    title: flow.title,
    version: flow.version,
    createdAt: flow.createdAt.toISOString(),
    updatedAt: flow.updatedAt.toISOString(),
  };
}

/**
 * Maps a FlowWithBadge to the FlowSummary wire shape extended with draftBadge.
 * AC-12 / ADR-0010: draftBadge is derived from the block→flow link and must
 * appear on the list endpoint wire response.
 */
function toSummaryWithBadge(flow: FlowWithBadge) {
  return {
    ...toSummary(flow),
    draftBadge: flow.draftBadge,
  };
}

/** Maps an AiGenerationJob to the JobState wire shape for the Flow read. */
function toJobState(job: AiGenerationJob) {
  return {
    jobId: job.jobId,
    blockId: job.blockId,
    status: job.status,
    progress: job.progress,
    outputFileId: job.outputFileId ?? null,
    resultUrl: job.resultUrl ?? null,
    errorMessage: job.errorMessage ?? null,
    // Lets the client pick the LATEST run per block (a later successful run must
    // override an earlier failed one on reload).
    createdAt: job.createdAt.toISOString(),
  };
}

/** Maps a FlowRecord + jobs to the full Flow wire shape (canvas included). */
function toFullFlow(flow: FlowRecord, jobs: AiGenerationJob[]) {
  return {
    ...toSummary(flow),
    canvas: flow.canvas,
    jobs: jobs.map(toJobState),
  };
}

// ── Handlers ──────────────────────────────────────────────────────────────────

/**
 * GET /generation-flows
 * Returns { items, nextCursor } — owner-scoped, most-recent first.
 * Pagination note: cursor-based pagination is implemented at the service/repo layer
 * in a later task; for now the full list is returned with nextCursor=null.
 */
export async function listFlows(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const flows = await flowService.listFlows(req.user!.userId);
    res.json({ items: flows.map(toSummaryWithBadge), nextCursor: null });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /generation-flows
 * Creates a new empty flow. Optional body: { title }.
 * Returns 201 with the full Flow shape.
 */
export async function createFlow(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = createFlowSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(
        `Invalid request body: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
      );
    }
    const title = parsed.data.title?.trim() || 'Untitled flow';
    const flow = await flowService.createFlow(req.user!.userId, title);
    res.status(201).json(toFullFlow(flow, []));
  } catch (err) {
    next(err);
  }
}

/**
 * GET /generation-flows/:flowId
 * Returns the full Flow (canvas + job states). Non-owner/absent → 404 (existence hiding).
 */
export async function getFlow(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const flowId = req.params['flowId']!;
    const { flow, jobs } = await flowService.openFlow(flowId, req.user!.userId);
    res.json(toFullFlow(flow, jobs));
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /generation-flows/:flowId
 * Renames a flow. Body: { title }. Returns 200 with FlowSummary.
 */
export async function renameFlow(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = renameFlowSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(
        `Invalid request body: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
      );
    }
    const flowId = req.params['flowId']!;
    const updated = await flowService.renameFlow(flowId, req.user!.userId, parsed.data.title);
    res.json(toSummary(updated));
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /generation-flows/:flowId
 * Soft-deletes a flow. Non-owner/absent → 404. Returns 204 No Content.
 */
export async function deleteFlow(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const flowId = req.params['flowId']!;
    // OpenAPI lines 681-686: ?confirm=true lets the Creator force-delete a flow
    // that a storyboard block depends on (after the client has shown the warning).
    const confirm = req.query['confirm'] === 'true';
    await flowService.deleteFlow(flowId, req.user!.userId, confirm);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /generation-flows/:flowId/canvas
 * Autosave canvas with optimistic-lock guard. Body: { version, canvas }.
 * Returns 200 with { flowId, version (incremented), updatedAt }.
 * Stale version → service throws OptimisticLockError → next(err) → central handler → 409.
 */
export async function saveCanvas(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = saveCanvasSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(
        `Invalid request body: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
      );
    }
    const flowId = req.params['flowId']!;
    const saved = await flowService.saveCanvas(
      flowId,
      req.user!.userId,
      parsed.data.canvas as Parameters<typeof flowService.saveCanvas>[2],
      parsed.data.version,
    );
    res.json({
      flowId: saved.flowId,
      version: saved.version,
      updatedAt: saved.updatedAt.toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /generation-flows/:flowId/blocks/:blockId/estimate
 * Best-effort, non-mutating pre-flight cost estimate (AC-11 / ADR-0005).
 * Returns 200 with the CostEstimate shape. Non-owner/absent flow → service
 * throws NotFoundError → next(err) → 404. Bad block/model → 422 (service).
 */
export async function estimateCost(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const flowId = req.params['flowId']!;
    const blockId = req.params['blockId']!;
    const estimate = await flowGenerateService.estimateBlockCost({
      flowId,
      blockId,
      userId: req.user!.userId,
    });
    res.json(estimate);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /generation-flows/:flowId/blocks/:blockId/generate
 * The single spend path (AC-01). REQUIRES an `Idempotency-Key` header (missing →
 * 400 ValidationError) so a double-submit / network retry never double-charges.
 *
 * Maps to the central error handler:
 *   - gate failures (T11)  → 422 with { error, code, details }
 *   - rate-limited (T10)   → 429 with a Retry-After header
 *   - stale flow version   → 409 (OptimisticLockError)
 *   - non-owner/absent flow / never-owned asset → 404 (existence hiding)
 * On success returns 202 with { jobId, blockId, status }.
 */
export async function generateBlock(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const idempotencyKey = req.header('Idempotency-Key');
    if (!idempotencyKey || idempotencyKey.trim().length === 0) {
      throw new ValidationError('Missing required header: Idempotency-Key.');
    }

    const parsed = generateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(
        `Invalid request body: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
      );
    }

    const flowId = req.params['flowId']!;
    const blockId = req.params['blockId']!;
    const accepted = await flowGenerateService.generate({
      flowId,
      blockId,
      userId: req.user!.userId,
      version: parsed.data.version,
      idempotencyKey,
    });
    res.status(202).json(accepted);
  } catch (err) {
    next(err);
  }
}
