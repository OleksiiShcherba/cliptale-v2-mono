/**
 * storyboardReference.controller — T13
 *
 * Thin HTTP adapter for the storyboard-reference-flows domain.
 *
 * Responsibilities:
 *   - Parse and Zod-validate request bodies/params/headers.
 *   - Delegate to service layer (extraction / confirm).
 *   - Shape the HTTP response per openapi.yaml (camelCase, envelope { error, code?, details? }).
 *   - Forward unexpected errors to next(); handle known domain errors inline (409).
 *
 * Contract: docs/features/storyboard-reference-flows/contracts/openapi.yaml
 *   - POST /storyboards/{draftId}/references/extract   → startCastExtraction
 *   - GET  /storyboards/{draftId}/references/extraction → getCastExtraction
 *   - POST /storyboards/{draftId}/references/confirm    → confirmCast
 */

import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';

import { NotFoundError, ValidationError, ConflictError } from '@/lib/errors.js';
import * as extractionService from '@/services/storyboardReference.extraction.service.js';
import * as confirmService from '@/services/storyboardReference.confirm.service.js';
import * as blocksService from '@/services/storyboardReference.blocks.service.js';
import * as starsService from '@/services/storyboardReference.stars.service.js';

// ── Zod schemas ───────────────────────────────────────────────────────────────

/** ConfirmCastEntry — one entry in the corrected cast. */
const confirmCastEntrySchema = z.object({
  castType: z.enum(['character', 'environment']),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  imageFileIds: z.array(z.string().uuid()).optional(),
  sceneBlockIds: z.array(z.string().uuid()).optional(),
});

/** ConfirmCastRequest body schema (openapi.yaml#/components/schemas/ConfirmCastRequest). */
const confirmCastRequestSchema = z.object({
  entries: z.array(confirmCastEntrySchema).min(1).max(12),
  acknowledgedAggregateCredits: z.number(),
});

// ── Error helpers ─────────────────────────────────────────────────────────────

/** Returns true when the error is the CastAlreadyExtractedError domain error. */
function isCastAlreadyExtracted(err: unknown): err is Error & { statusCode: 409 } {
  return (
    err instanceof Error &&
    err.name === 'CastAlreadyExtractedError'
  );
}

// ── POST /storyboards/:draftId/references/extract ─────────────────────────────

/**
 * POST /storyboards/:draftId/references/extract
 * AC-01, AC-01b, AC-13.
 *
 * Returns 202 { jobId, status } on success — status is the idempotent union
 * queued|running|completed (ADR-0001): a fresh start is `queued`, a converged-on
 * existing extraction returns its current status.
 * Returns 409 references.cast_already_confirmed on CastAlreadyExtractedError.
 * Non-owner: NotFoundError forwarded to next() (existence hiding, AC-13).
 */
export async function startCastExtraction(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const idempotencyKey = req.header('Idempotency-Key');
    if (!idempotencyKey || idempotencyKey.trim().length === 0) {
      throw new ValidationError('Missing required header: Idempotency-Key.');
    }

    const draftId = req.params['draftId']!;
    const userId = req.user!.userId;

    const result = await extractionService.startExtraction(userId, draftId);
    res.status(202).json({ jobId: result.jobId, status: result.status });
  } catch (err) {
    if (isCastAlreadyExtracted(err)) {
      res.status(409).json({
        error: (err as Error).message || 'This draft already has a confirmed cast.',
        code: 'references.cast_already_confirmed',
      });
      return;
    }
    next(err);
  }
}

// ── GET /storyboards/:draftId/references/extraction ───────────────────────────

/**
 * GET /storyboards/:draftId/references/extraction
 * AC-01, AC-13.
 *
 * Returns 200 CastExtractionJob when a job exists.
 * Returns 404 with code references.extraction_not_found when no job exists yet
 * (also used for the no-draft / non-owner path via NotFoundError → next()).
 */
export async function getCastExtraction(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const draftId = req.params['draftId']!;
    const userId = req.user!.userId;

    const job = await extractionService.getExtraction(userId, draftId);

    if (!job) {
      res.status(404).json({
        error: 'No cast extraction found for this draft.',
        code: 'references.extraction_not_found',
      });
      return;
    }

    // Map service result → CastExtractionJob wire shape (openapi.yaml#/components/schemas/CastExtractionJob).
    // proposalJson → proposal (camelCase array, re-shaped to CastProposalEntry wire keys).
    const proposal = mapProposal(job.proposalJson);

    res.json({
      jobId: job.jobId,
      draftId,
      status: job.status,
      proposal,
      truncated: job.truncated,
      aggregateEstimateCredits: job.aggregateEstimateCredits
        ? parseFloat(job.aggregateEstimateCredits)
        : null,
      errorMessage: job.errorMessage ?? null,
      completedAt: toIsoOrNull(job.completedAt),
      failedAt: toIsoOrNull(job.failedAt),
      createdAt: toIsoOrNull(job.createdAt),
    });
  } catch (err) {
    next(err);
  }
}

// ── POST /storyboards/:draftId/references/confirm ─────────────────────────────

/**
 * POST /storyboards/:draftId/references/confirm
 * AC-03, AC-13.
 *
 * Body: ConfirmCastRequest.
 * Returns 201 ReferenceBlockList { items: [...] } on success.
 * Returns 409 references.cast_already_confirmed on CastAlreadyExtractedError.
 * Non-owner: NotFoundError forwarded to next() (existence hiding, AC-13).
 */
export async function confirmCast(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const idempotencyKey = req.header('Idempotency-Key');
    if (!idempotencyKey || idempotencyKey.trim().length === 0) {
      throw new ValidationError('Missing required header: Idempotency-Key.');
    }

    const parsed = confirmCastRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(
        `Invalid request body: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
      );
    }

    const draftId = req.params['draftId']!;
    const userId = req.user!.userId;
    const { entries, acknowledgedAggregateCredits } = parsed.data;

    const blocks = await confirmService.confirmCast({
      draftId,
      userId,
      entries,
      acknowledgedAggregateCredits,
    });

    // Map confirmed blocks to the full ReferenceBlock wire shape
    // (openapi.yaml#/components/schemas/ReferenceBlock).
    // stars and previewFileId are empty/null immediately after confirm — no
    // generation result exists yet (windowStatus = 'pending').
    const items = blocks.map((b) => ({
      blockId: b.blockId,
      draftId: b.draftId,
      flowId: b.flowId,
      castType: b.castType,
      name: b.name,
      description: b.description ?? null,
      sortOrder: b.sortOrder,
      positionX: b.positionX,
      positionY: b.positionY,
      windowStatus: b.windowStatus,
      errorMessage: b.errorMessage ?? null,
      version: b.version,
      sceneBlockIds: b.sceneBlockIds,
      stars: [],
      previewFileId: null,
      createdAt: toIsoOrNull(b.createdAt),
      updatedAt: toIsoOrNull(b.updatedAt),
    }));

    res.status(201).json({ items });
  } catch (err) {
    if (isCastAlreadyExtracted(err)) {
      res.status(409).json({
        error: (err as Error).message || "This draft's cast is already confirmed.",
        code: 'references.cast_already_confirmed',
      });
      return;
    }
    next(err);
  }
}

// ── Zod schemas for T14 handlers ──────────────────────────────────────────────

/** CreateReferenceBlockRequest body (openapi.yaml#/components/schemas/CreateReferenceBlockRequest). */
const createReferenceBlockSchema = z.object({
  castType: z.enum(['character', 'environment']),
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
});

/** UpdateReferenceBlockRequest body (PATCH .../blocks/:blockId — versionless XY). */
const updateReferenceBlockSchema = z.object({
  positionX: z.number(),
  positionY: z.number(),
});

/** SaveSceneLinksRequest body (openapi.yaml#/components/schemas/SaveSceneLinksRequest). */
const saveSceneLinksSchema = z.object({
  sceneBlockIds: z.array(z.string().uuid()),
  version: z.number().int().min(1),
});

// ── GET /storyboards/:draftId/references/blocks ────────────────────────────────

/**
 * GET /storyboards/:draftId/references/blocks
 * AC-11, AC-13.
 *
 * Returns 200 ReferenceBlockList { items: [...] }.
 * Non-owner: NotFoundError forwarded to next() (existence hiding).
 */
export async function listReferenceBlocks(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const draftId = req.params['draftId']!;
    const userId = req.user!.userId;

    const blocks = await blocksService.listBlocks(userId, draftId);

    const items = blocks.map(mapBlockToWire);
    res.json({ items });
  } catch (err) {
    next(err);
  }
}

// ── POST /storyboards/:draftId/references/blocks ──────────────────────────────

/**
 * POST /storyboards/:draftId/references/blocks
 * AC-11, AC-13.
 *
 * Returns 201 ReferenceBlock on success.
 * Non-owner: NotFoundError forwarded to next() (existence hiding).
 */
export async function createReferenceBlock(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = createReferenceBlockSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(
        `Invalid request body: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
      );
    }

    const draftId = req.params['draftId']!;
    const userId = req.user!.userId;
    const { castType, name, description } = parsed.data;

    const block = await blocksService.createBlock({ draftId, userId, castType, name, description });

    res.status(201).json(mapBlockToWire(block));
  } catch (err) {
    next(err);
  }
}

// ── PATCH /storyboards/:draftId/references/blocks/:blockId ───────────────────

/**
 * PATCH /storyboards/:draftId/references/blocks/:blockId
 * AC-14, AC-13.
 *
 * Versionless commutative XY update (ADR-0005 override, SAD §1 ¶4).
 * Returns 200 ReferenceBlock on success.
 * Non-owner: NotFoundError forwarded to next().
 */
export async function updateReferenceBlock(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = updateReferenceBlockSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(
        `Invalid request body: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
      );
    }

    const draftId = req.params['draftId']!;
    const blockId = req.params['blockId']!;
    const userId = req.user!.userId;
    const { positionX, positionY } = parsed.data;

    const block = await blocksService.updateBlock({ blockId, draftId, userId, positionX, positionY });

    res.json(mapBlockToWire(block));
  } catch (err) {
    next(err);
  }
}

// ── DELETE /storyboards/:draftId/references/blocks/:blockId ──────────────────

/**
 * DELETE /storyboards/:draftId/references/blocks/:blockId
 * AC-14, AC-13.
 *
 * Returns 204 No Content on success.
 * Non-owner: NotFoundError forwarded to next().
 */
export async function deleteReferenceBlock(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const draftId = req.params['draftId']!;
    const blockId = req.params['blockId']!;
    const userId = req.user!.userId;

    await blocksService.deleteBlock({ blockId, draftId, userId });

    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

// ── POST /storyboards/:draftId/references/blocks/:blockId/retry ───────────────

/**
 * POST /storyboards/:draftId/references/blocks/:blockId/retry
 * AC-04, AC-13.
 *
 * Returns 202 RetryAccepted { blockId, windowStatus:'pending' } on success.
 * Returns 409 { error, code:'references.block_not_failed' } when block is not failed.
 * Requires Idempotency-Key header.
 * Non-owner: NotFoundError forwarded to next().
 */
export async function retryReferenceBlockGeneration(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const idempotencyKey = req.header('Idempotency-Key');
    if (!idempotencyKey || idempotencyKey.trim().length === 0) {
      throw new ValidationError('Missing required header: Idempotency-Key.');
    }

    const draftId = req.params['draftId']!;
    const blockId = req.params['blockId']!;
    const userId = req.user!.userId;

    const block = await blocksService.retryBlock({ blockId, draftId, userId });

    res.status(202).json({ blockId: block.id, windowStatus: block.windowStatus });
  } catch (err) {
    if (err instanceof ConflictError) {
      res.status(409).json({
        error: (err as Error).message || 'Block generation is not in failed state.',
        code: 'references.block_not_failed',
      });
      return;
    }
    next(err);
  }
}

// ── PUT /storyboards/:draftId/references/blocks/:blockId/scene-links ──────────

/**
 * PUT /storyboards/:draftId/references/blocks/:blockId/scene-links
 * AC-10, AC-13.
 *
 * Returns 200 SceneLinksSaveResponse { sceneBlockIds, version } on success.
 * Returns 409 { error, code:'references.version_conflict' } on stale version.
 * Non-owner: NotFoundError forwarded to next().
 */
export async function saveSceneLinks(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = saveSceneLinksSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(
        `Invalid request body: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
      );
    }

    const draftId = req.params['draftId']!;
    const blockId = req.params['blockId']!;
    const userId = req.user!.userId;
    const { sceneBlockIds, version } = parsed.data;

    const result = await blocksService.saveSceneLinks({ blockId, draftId, userId, sceneBlockIds, version });

    res.json({ sceneBlockIds: result.sceneBlockIds, version: result.version });
  } catch (err) {
    if (err instanceof ConflictError) {
      res.status(409).json({
        error: (err as Error).message || 'Version conflict — reload and retry.',
        code: 'references.version_conflict',
      });
      return;
    }
    next(err);
  }
}

// ── PUT /storyboards/:draftId/references/blocks/:blockId/stars/:fileId ────────

/**
 * PUT /storyboards/:draftId/references/blocks/:blockId/stars/:fileId
 * AC-06, AC-13.
 *
 * Returns 200 BlockStarsState { blockId, stars, previewFileId }.
 * Body: { isPrimary?: boolean } — optional, defaults to false.
 * Non-owner: NotFoundError forwarded to next().
 */
export async function starReferenceResult(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const draftId = req.params['draftId']!;
    const blockId = req.params['blockId']!;
    const fileId = req.params['fileId']!;
    const userId = req.user!.userId;
    const isPrimary = req.body && typeof req.body.isPrimary === 'boolean' ? req.body.isPrimary : false;

    const state = await starsService.starResult({ blockId, draftId, userId, fileId, isPrimary });

    res.json(state);
  } catch (err) {
    next(err);
  }
}

// ── DELETE /storyboards/:draftId/references/blocks/:blockId/stars/:fileId ─────

/**
 * DELETE /storyboards/:draftId/references/blocks/:blockId/stars/:fileId
 * AC-06, AC-13.
 *
 * Returns 200 BlockStarsState { blockId, stars, previewFileId }.
 * Non-owner: NotFoundError forwarded to next().
 */
export async function unstarReferenceResult(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const draftId = req.params['draftId']!;
    const blockId = req.params['blockId']!;
    const fileId = req.params['fileId']!;
    const userId = req.user!.userId;

    const state = await starsService.unstarResult({ blockId, draftId, userId, fileId });

    res.json(state);
  } catch (err) {
    next(err);
  }
}

// ── Private helpers ────────────────────────────────────────────────────────────

/**
 * Maps a BlockResult (service layer) to the full ReferenceBlock wire shape
 * (openapi.yaml#/components/schemas/ReferenceBlock).
 * stars and previewFileId are not stored on BlockResult — callers that need
 * star data enrich separately; here we default to empty/null (safe for CRUD ops).
 */
function mapBlockToWire(b: {
  id: string;
  draftId: string;
  flowId: string | null;
  castType: 'character' | 'environment';
  name: string;
  description: string | null;
  sortOrder: number;
  positionX: number;
  positionY: number;
  windowStatus: 'pending' | 'running' | 'done' | 'failed' | null;
  errorMessage: string | null;
  version: number;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
  sceneBlockIds?: string[];
  stars?: unknown[];
  previewFileId?: string | null;
}) {
  return {
    blockId: b.id,
    draftId: b.draftId,
    flowId: b.flowId ?? null,
    castType: b.castType,
    name: b.name,
    description: b.description ?? null,
    sortOrder: b.sortOrder,
    positionX: b.positionX,
    positionY: b.positionY,
    windowStatus: b.windowStatus,
    errorMessage: b.errorMessage ?? null,
    version: b.version,
    sceneBlockIds: b.sceneBlockIds ?? [],
    stars: b.stars ?? [],
    previewFileId: b.previewFileId ?? null,
    createdAt: toIsoOrNull(b.createdAt),
    updatedAt: toIsoOrNull(b.updatedAt),
  };
}

function toIsoOrNull(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  return v;
}

/**
 * Maps proposalJson (snake_case DB storage) to the CastProposalEntry wire shape
 * (camelCase, openapi.yaml).
 */
function mapProposal(proposalJson: unknown): unknown[] | null {
  if (!Array.isArray(proposalJson)) return null;
  return proposalJson.map((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null) return entry;
    const e = entry as Record<string, unknown>;
    return {
      type: e['type'],
      name: e['name'],
      description: e['description'] ?? null,
      imageFileIds: e['image_file_ids'] ?? e['imageFileIds'] ?? [],
      sceneBlockIds: e['scene_block_ids'] ?? e['sceneBlockIds'] ?? [],
      perRunEstimate: e['per_run_estimate'] ?? e['perRunEstimate'] ?? null,
    };
  });
}
