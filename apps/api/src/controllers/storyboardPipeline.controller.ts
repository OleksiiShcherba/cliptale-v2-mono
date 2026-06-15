/**
 * storyboardPipeline.controller — T9
 *
 * Thin HTTP adapter for the backend-owned, resumable Step-2 pipeline state machine.
 *
 * Responsibilities:
 *   - Parse + Zod-validate path params / request bodies.
 *   - Delegate to the pipeline service layer (resume / confirm / trigger / lifecycle).
 *   - Project the service's StoryboardPipelineRow → the contract `PipelineState`
 *     wire shape (snake_case, nested `phases`).
 *   - Forward every typed error to next() — the central errorHandler (index.ts) maps
 *     status + the `{ error, code, details }` envelope. GateError → 422 with code;
 *     NotFoundError → 404 opaque.
 *
 * Ownership-before-prerequisite (AC-13): each service calls assertDraftOwner FIRST
 * and throws NotFoundError for a non-owner BEFORE any prerequisite/order guard. The
 * controller therefore adds NO ownership or prerequisite check of its own — it only
 * validates the request shape (which never touches the draft) and delegates.
 *
 * Contract: docs/features/storyboard-generation-pipeline/contracts/openapi.yaml
 *   - GET  /storyboards/{draftId}/pipeline                          → getPipelineState
 *   - POST /storyboards/{draftId}/pipeline/confirm-cast             → confirmCast
 *   - POST /storyboards/{draftId}/pipeline/phases/{phase}/trigger   → triggerPhase
 *   - POST /storyboards/{draftId}/pipeline/phases/{phase}/cancel    → cancelPhase
 *   - POST /storyboards/{draftId}/pipeline/phases/{phase}/skip      → skipPhase
 */

import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';

import { ValidationError } from '@/lib/errors.js';
import * as resumeService from '@/services/storyboardPipeline.resume.service.js';
import * as confirmService from '@/services/storyboardPipeline.confirm.service.js';
import * as triggerService from '@/services/storyboardPipeline.trigger.service.js';
import * as lifecycleService from '@/services/storyboardPipeline.lifecycle.service.js';
import type { StoryboardPipelineRow } from '@/repositories/storyboardPipeline.repository.js';

// ── Zod schemas ───────────────────────────────────────────────────────────────

/** The four ordered phases (openapi.yaml#/components/schemas/PhaseName). */
const phaseNameSchema = z.enum(['scene', 'reference_data', 'reference_image', 'scene_image']);

/** :draftId path param — a UUID-shaped draft id. */
const draftIdSchema = z.string().min(1);

/**
 * Optional confirm-cast body (openapi.yaml#/components/schemas/CastConfirmation).
 * Omit it entirely to confirm the proposal as shown. `cost_estimate` is the estimate
 * the Creator was shown — re-validated server-side (never trusted, §6.1, ADR-0006).
 */
const confirmCastBodySchema = z
  .object({
    cost_estimate: z.string().nullable().optional(),
    references: z.array(z.unknown()).optional(),
  })
  .passthrough();

// ── Wire projection ─────────────────────────────────────────────────────────────

/**
 * Project a StoryboardPipelineRow (service/repo camelCase) to the contract
 * `PipelineState` (openapi.yaml). Internal columns (phase_started_at, heartbeat_at,
 * actual_cost, created_at) are intentionally NOT exposed (api-sync-report.md).
 */
function mapStateToWire(row: StoryboardPipelineRow): Record<string, unknown> {
  return {
    draft_id: row.draftId,
    active_phase: row.activePhase,
    active_run_phase: row.activeRunPhase,
    phases: {
      scene: { status: row.sceneStatus },
      reference_data: { status: row.referenceDataStatus },
      reference_image: { status: row.referenceImageStatus },
      scene_image: { status: row.sceneImageStatus },
    },
    payload: row.payloadJson ?? null,
    version: row.version,
    cost_estimate: row.costEstimate ?? null,
    error_message: row.errorMessage ?? null,
    updated_at: toIso(row.updatedAt),
  };
}

function toIso(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  return v;
}

/** Parse + validate the :draftId param, throwing ValidationError on a bad shape. */
function parseDraftId(req: Request): string {
  const parsed = draftIdSchema.safeParse(req.params['draftId']);
  if (!parsed.success) {
    throw new ValidationError('Invalid draft id.');
  }
  return parsed.data;
}

/** Parse + validate the :phase param, throwing ValidationError on an unknown phase. */
function parsePhase(req: Request): z.infer<typeof phaseNameSchema> {
  const parsed = phaseNameSchema.safeParse(req.params['phase']);
  if (!parsed.success) {
    throw new ValidationError('Invalid phase.');
  }
  return parsed.data;
}

// ── GET /storyboards/:draftId/pipeline ─────────────────────────────────────────

/**
 * GET /storyboards/:draftId/pipeline (AC-05, AC-13).
 *
 * Returns 200 PipelineState (resume read; lazily creates + auto-starts scene
 * generation on a fresh draft, releases stuck phases). Non-owner / no-draft →
 * NotFoundError → opaque 404 (existence hiding).
 */
export async function getPipelineState(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const draftId = parseDraftId(req);
    const userId = req.user!.userId;

    const row = await resumeService.getPipelineState(draftId, userId);
    res.json(mapStateToWire(row));
  } catch (err) {
    next(err);
  }
}

// ── POST /storyboards/:draftId/pipeline/confirm-cast ───────────────────────────

/**
 * POST /storyboards/:draftId/pipeline/confirm-cast (AC-03, AC-13, AC-14).
 *
 * Re-validates the estimate server-side, creates reference blocks below music, claims
 * the reference_image run. Idempotent. Returns 200 PipelineState.
 * 422 pipeline.estimate_revalidation_failed / pipeline.not_awaiting_review on gate.
 * Non-owner → opaque 404.
 */
export async function confirmCast(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const draftId = parseDraftId(req);
    const userId = req.user!.userId;

    const parsed = confirmCastBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new ValidationError(
        `Invalid request body: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
      );
    }

    const row = await confirmService.confirmCast({
      draftId,
      userId,
      clientEstimate: parsed.data.cost_estimate ?? null,
    });
    res.json(mapStateToWire(row));
  } catch (err) {
    next(err);
  }
}

// ── POST /storyboards/:draftId/pipeline/phases/:phase/trigger ──────────────────

/**
 * POST /storyboards/:draftId/pipeline/phases/:phase/trigger (US-07, AC-04/06/08/13/14/15).
 *
 * Starts or re-triggers a phase (accept scene-image offer / manual trigger /
 * incremental re-trigger). Returns 200 PipelineState. 422 pipeline.phase_out_of_order
 * / pipeline.scenes_required on gate. Non-owner → opaque 404 (checked BEFORE any
 * prerequisite/order guard, AC-13).
 */
export async function triggerPhase(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const draftId = parseDraftId(req);
    const phase = parsePhase(req);
    const userId = req.user!.userId;

    const row = await triggerService.triggerPhase({ draftId, userId, phase });
    res.json(mapStateToWire(row));
  } catch (err) {
    next(err);
  }
}

// ── POST /storyboards/:draftId/pipeline/phases/:phase/cancel ───────────────────

/**
 * POST /storyboards/:draftId/pipeline/phases/:phase/cancel (US-06, AC-06, AC-13).
 *
 * Cancels a running phase, keeping every produced result; idempotent no-op when not
 * running. Returns 200 PipelineState. Non-owner → opaque 404.
 */
export async function cancelPhase(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const draftId = parseDraftId(req);
    const phase = parsePhase(req);
    const userId = req.user!.userId;

    const row = await lifecycleService.cancelPhase({ draftId, userId, phase });
    res.json(mapStateToWire(row));
  } catch (err) {
    next(err);
  }
}

// ── POST /storyboards/:draftId/pipeline/phases/:phase/skip ─────────────────────

/**
 * POST /storyboards/:draftId/pipeline/phases/:phase/skip (US-07, AC-07, AC-13).
 *
 * Records a pending review phase as `skipped` (distinct from idle). Returns 200
 * PipelineState. 422 pipeline.not_awaiting_review when nothing to skip. Non-owner →
 * opaque 404.
 */
export async function skipPhase(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const draftId = parseDraftId(req);
    const phase = parsePhase(req);
    const userId = req.user!.userId;

    const row = await lifecycleService.skipPhase({ draftId, userId, phase });
    res.json(mapStateToWire(row));
  } catch (err) {
    next(err);
  }
}
