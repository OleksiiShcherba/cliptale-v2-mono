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

import { NotFoundError, ValidationError } from '@/lib/errors.js';
import * as extractionService from '@/services/storyboardReference.extraction.service.js';
import * as confirmService from '@/services/storyboardReference.confirm.service.js';

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

/**
 * Returns true when the error is an ExtractionInProgressError (resolved sequence gap,
 * openapi.yaml 2026-06-07): statusCode=409, code='references.extraction_in_progress'.
 */
function isExtractionInProgress(err: unknown): err is Error & { statusCode: 409; code: string } {
  return (
    err instanceof Error &&
    err.name === 'ExtractionInProgressError' &&
    (err as Error & { statusCode?: number }).statusCode === 409
  );
}

// ── POST /storyboards/:draftId/references/extract ─────────────────────────────

/**
 * POST /storyboards/:draftId/references/extract
 * AC-01, AC-01b, AC-13.
 *
 * Returns 202 { jobId, status:'queued' } on success.
 * Returns 409 with code on domain conflicts (CastAlreadyExtractedError,
 * ExtractionInProgressError).
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
    if (isExtractionInProgress(err)) {
      const e = err as Error & { code: string; details?: unknown };
      res.status(409).json({
        error: e.message || 'Cast extraction is already running for this draft.',
        code: 'references.extraction_in_progress',
        ...(e.details !== undefined ? { details: e.details } : {}),
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
      aggregateEstimateCredits: job.aggregateEstimateCredits
        ? parseFloat(job.aggregateEstimateCredits)
        : null,
      errorMessage: job.errorMessage ?? null,
      completedAt: (job as unknown as { completedAt?: Date | string | null }).completedAt
        ? toIsoOrNull((job as unknown as { completedAt: Date | string | null }).completedAt)
        : null,
      failedAt: (job as unknown as { failedAt?: Date | string | null }).failedAt
        ? toIsoOrNull((job as unknown as { failedAt: Date | string | null }).failedAt)
        : null,
      createdAt: (job as unknown as { createdAt: Date | string }).createdAt
        ? toIsoOrNull((job as unknown as { createdAt: Date | string }).createdAt)
        : null,
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

    res.status(201).json({ items: blocks });
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

// ── Private helpers ────────────────────────────────────────────────────────────

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
