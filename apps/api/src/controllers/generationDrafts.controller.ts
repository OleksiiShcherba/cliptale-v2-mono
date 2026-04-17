import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import * as generationDraftService from '@/services/generationDraft.service.js';

/**
 * Zod schema for POST /generation-drafts and PUT /generation-drafts/:id request bodies.
 *
 * The payload wraps the PromptDoc rather than flattening it, consistent with
 * the project convention (confirmed by reading assets.controller.ts where the
 * upload body wraps distinct fields; wrapping here keeps the shape unambiguous
 * and allows future addition of metadata alongside promptDoc without a breaking change).
 *
 * The promptDoc value is passed as-is to the service, which runs the full
 * promptDocSchema validation and throws UnprocessableEntityError on failure.
 */
export const upsertDraftBodySchema = z.object({
  promptDoc: z.record(z.unknown()),
});

type UpsertDraftBody = z.infer<typeof upsertDraftBodySchema>;

/**
 * POST /generation-drafts
 * Creates a new draft. Body is pre-validated by validateBody(upsertDraftBodySchema).
 */
export async function createDraft(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { promptDoc } = req.body as UpsertDraftBody;
    const draft = await generationDraftService.create(req.user!.userId, promptDoc);
    res.status(201).json(draft);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /generation-drafts/:id
 * Returns a single draft owned by the authenticated user.
 */
export async function getDraft(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const draft = await generationDraftService.getById(req.user!.userId, req.params['id']!);
    res.json(draft);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /generation-drafts?mine=true
 * Returns all drafts belonging to the authenticated user.
 * The `mine` query param is required to prevent accidental exposure of all drafts.
 */
export async function listDrafts(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const drafts = await generationDraftService.listMine(req.user!.userId);
    res.json(drafts);
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /generation-drafts/:id
 * Replaces the promptDoc of an existing draft. Body pre-validated by validateBody(upsertDraftBodySchema).
 */
export async function updateDraft(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { promptDoc } = req.body as UpsertDraftBody;
    const draft = await generationDraftService.update(
      req.user!.userId,
      req.params['id']!,
      promptDoc,
    );
    res.json(draft);
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /generation-drafts/:id
 * Deletes a draft owned by the authenticated user. Returns 204 No Content.
 */
export async function deleteDraft(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await generationDraftService.remove(req.user!.userId, req.params['id']!);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

/**
 * POST /generation-drafts/:id/enhance
 * Enqueues an AI Enhance job for the specified draft.
 * Returns 202 Accepted with { jobId } on success.
 */
export async function startEnhance(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await generationDraftService.startEnhance(
      req.user!.userId,
      req.params['id']!,
    );
    res.status(202).json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /generation-drafts/:id/enhance/:jobId
 * Polls the status of a previously enqueued enhance job.
 * Returns 200 with { status, result?, error? }.
 */
export async function getEnhanceStatus(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await generationDraftService.getEnhanceStatus(
      req.user!.userId,
      req.params['id']!,
      req.params['jobId']!,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}
