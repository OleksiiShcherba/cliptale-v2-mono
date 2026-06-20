import { randomUUID } from 'node:crypto';

import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import * as storyboardService from '@/services/storyboard.service.js';
import * as motionGraphicService from '@/services/motionGraphic.service.js';
import * as motionGraphicRepository from '@/repositories/motionGraphic.repository.js';
import { GateError, NotFoundError } from '@/lib/errors.js';
import { saveStoryboardBodySchema, pushHistoryBodySchema } from '@/controllers/storyboard.controller.schemas.js';

export { saveStoryboardBodySchema, pushHistoryBodySchema } from '@/controllers/storyboard.controller.schemas.js';

/**
 * POST /storyboards/:draftId/blocks/:blockId/media/motion-graphic body schema.
 * Mirrors AttachMotionGraphicRequest in contracts/openapi.yaml.
 */
export const attachMotionGraphicBodySchema = z.object({
  motionGraphicId: z.string().uuid(),
  sortOrder: z.number().int().min(0).optional(),
});

type AttachMotionGraphicBody = z.infer<typeof attachMotionGraphicBodySchema>;

type SaveBody = z.infer<typeof saveStoryboardBodySchema>;
type PushHistoryBody = z.infer<typeof pushHistoryBodySchema>;

/**
 * GET /storyboards/:draftId
 * Returns { blocks, edges } for the authenticated user's draft.
 * Throws 404 when the draft does not exist, 403 when it belongs to another user.
 */
export async function getStoryboard(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const state = await storyboardService.loadStoryboard(
      req.user!.userId,
      req.params['draftId']!,
    );
    res.json(state);
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /storyboards/:draftId
 * Full-replaces all blocks and edges in a single DB transaction.
 * Body is pre-validated by validateBody(saveStoryboardBodySchema).
 * Returns 200 with the saved state.
 */
export async function putStoryboard(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as SaveBody;
    // Normalise each media item to the repository's BlockMediaItem shape: a
    // motion_graphic row carries its frozen snapshot under `motionGraphic` so
    // replaceStoryboard re-inserts the FK and the autosave round-trip is safe.
    const blocks = body.blocks.map((b) => ({
      ...b,
      mediaItems: b.mediaItems?.map((m) => ({
        id: m.id,
        fileId: m.fileId ?? null,
        mediaType: m.mediaType,
        sortOrder: m.sortOrder,
        ...(m.motionGraphicSnapshotId
          ? { motionGraphic: { snapshotId: m.motionGraphicSnapshotId } }
          : {}),
      })),
    }));
    const state = await storyboardService.saveStoryboard(
      req.user!.userId,
      req.params['draftId']!,
      blocks,
      body.edges,
      body.musicBlocks,
    );
    res.json(state);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /storyboards/:draftId/apply-latest-plan
 * Applies the latest completed storyboard planning job to the draft.
 * Returns 200 with the authoritative storyboard state.
 */
export async function applyLatestPlan(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const state = await storyboardService.applyLatestCompletedPlan(
      req.user!.userId,
      req.params['draftId']!,
    );
    res.json(state);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /storyboards/:draftId/history
 * Returns the last 50 snapshots ordered newest-first.
 */
export async function getHistory(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const entries = await storyboardService.listHistory(
      req.user!.userId,
      req.params['draftId']!,
    );
    res.json(entries);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /storyboards/:draftId/history — checkpoint push (CheckpointPush).
 * Accepts { snapshot: object, previewKind: 'screenshot' | 'minimap' }, inserts
 * the row stamped origin='checkpoint' (server-side, ADR-0003) and prunes
 * beyond 50 rows. Returns 201 { id }.
 * Body is pre-validated by validateBody(pushHistoryBodySchema).
 */
export async function postHistory(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { snapshot, previewKind } = req.body as PushHistoryBody;
    const id = await storyboardService.pushHistory(
      req.user!.userId,
      req.params['draftId']!,
      snapshot,
      previewKind,
    );
    res.status(201).json({ id });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /storyboards/:draftId/blocks/:blockId/media/motion-graphic
 *
 * Server-authored attach (Flow 2 / US-07 / AC-04, AC-07, AC-08, AC-10). The snapshot
 * must be frozen server-side — it cannot go through the opaque client-driven PUT.
 *
 * Orchestration lives HERE in the storyboard controller (per the T12 constraint),
 * composing the existing T6 service + T5 repository:
 *   1. Draft ownership — `storyboardService.loadStoryboard` reuses the existing
 *      storyboard ownership guard (404 absent / 403 non-owner) AND returns the blocks,
 *      so the target block can be verified to belong to the draft (else 404, AC-07).
 *   2. Graphic read — owner-scoped via `motionGraphicService.getWithChat`; a non-owner
 *      or absent graphic raises NotFoundError → 404, indistinguishable (AC-07).
 *   3. Ready-state invariant — a `generating`/`failed` graphic → 422
 *      `motion_graphic.not_ready` with `details.status` (AC-08); nothing is written.
 *   4. On `ready`, the T5 atomic insert freezes a COPY of code/duration/geometry +
 *      a `motion_graphic` block-media row (fileId: null) and the response is read back
 *      from the join (AC-04). The copy never references the live graphic (AC-10).
 *
 * Body is pre-validated by validateBody(attachMotionGraphicBodySchema).
 */
export async function attachMotionGraphic(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const draftId = req.params['draftId']!;
    const blockId = req.params['blockId']!;
    const { motionGraphicId, sortOrder } = req.body as AttachMotionGraphicBody;

    // 1. Draft ownership + block-belongs-to-draft (reuses the existing guard, AC-07).
    const { blocks } = await storyboardService.loadStoryboard(userId, draftId);
    if (!blocks.some((b) => b.id === blockId)) {
      // The block is absent from the owned draft — answer as not-found (existence hiding).
      throw new NotFoundError(`Storyboard block ${blockId} not found`);
    }

    // 2. Read the graphic owner-scoped — non-owner / absent → NotFoundError (404, AC-07).
    const { graphic } = await motionGraphicService.getWithChat(userId, motionGraphicId);

    // 3. Ready-state invariant — only a ready, working graphic can be attached (AC-08).
    if (graphic.status !== 'ready') {
      throw new GateError(
        'Only a ready, working motion graphic can be added to a block.',
        'motion_graphic.not_ready',
        { status: graphic.status },
      );
    }

    // 4. Freeze the snapshot + write the block-media row atomically (AC-04/AC-10).
    const snapshotId = randomUUID();
    const mediaId = randomUUID();
    await motionGraphicRepository.insertBlockSnapshotWithMedia({
      snapshotId,
      mediaId,
      blockId,
      sourceMotionGraphicId: graphic.id,
      code: graphic.code ?? '',
      propsSchema: graphic.propsSchema,
      durationSeconds: graphic.durationSeconds,
      fps: graphic.fps,
      width: graphic.width,
      height: graphic.height,
      runtimeVersion: graphic.runtimeVersion,
      sourceVersion: graphic.version,
      sortOrder: sortOrder ?? 0,
    });

    const attached = await motionGraphicRepository.findBlockMediaSnapshot(mediaId);
    if (!attached) {
      throw new Error(`block-media snapshot not found after insert: ${mediaId}`);
    }

    res.status(201).json({
      id: attached.mediaId,
      blockId: attached.blockId,
      mediaType: attached.mediaType,
      sortOrder: attached.sortOrder,
      snapshot: {
        id: attached.snapshot.id,
        code: attached.snapshot.code,
        propsSchema: attached.snapshot.propsSchema ?? null,
        durationSeconds: attached.snapshot.durationSeconds,
        fps: attached.snapshot.fps,
        width: attached.snapshot.width,
        height: attached.snapshot.height,
        runtimeVersion: attached.snapshot.runtimeVersion,
        sourceVersion: attached.snapshot.sourceVersion,
        createdAt: attached.snapshot.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
}
