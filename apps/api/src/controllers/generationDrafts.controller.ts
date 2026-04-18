import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import { s3Client } from '@/lib/s3.js';
import * as generationDraftService from '@/services/generationDraft.service.js';
import * as fileLinksService from '@/services/fileLinks.service.js';
import * as fileLinksResponseService from '@/services/fileLinks.response.service.js';

/**
 * Zod schema for POST /generation-drafts/:draftId/ai/generate.
 *
 * Mirrors aiGeneration.controller.submitGenerationSchema but lives here to keep
 * the controller files decoupled. No `projectId` compat shim needed — this is a
 * new endpoint, not a migration of the project-scoped one.
 */
export const submitDraftAiGenerationSchema = z.object({
  modelId: z.string().min(1),
  prompt: z.string().min(1).max(4000).optional(),
  options: z.record(z.unknown()).default({}),
});

/** Zod schema for POST /generation-drafts/:draftId/files body. Exported for route middleware. */
export const linkFileToDraftSchema = z.object({
  fileId: z.string().uuid(),
});

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
 * GET /generation-drafts/cards
 * Returns storyboard card summaries for all drafts owned by the authenticated user.
 * Sorted by updated_at DESC. Media previews are capped at 3 per card; text preview
 * is truncated to 140 characters. Missing/deleted asset refs are silently skipped.
 */
export async function listCards(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const items = await generationDraftService.listStoryboardCardsForUser(req.user!.userId);
    res.json({ items });
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

/**
 * POST /generation-drafts/:draftId/files
 * Links a file (by `fileId`) to a generation draft. Both the draft and the
 * file must be owned by the authenticated user. Double-link is idempotent —
 * if the pair already exists, returns 204 No Content.
 * Body is pre-validated by validateBody(linkFileToDraftSchema) in the route.
 */
export async function linkFileToDraft(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const draftId = req.params['draftId']!;
    const { fileId } = req.body as z.infer<typeof linkFileToDraftSchema>;

    await fileLinksService.linkFileToDraft(userId, draftId, fileId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

/**
 * GET /generation-drafts/:id/assets
 * Returns all files linked to a generation draft via the `draft_files` pivot
 * table, serialized as an `AssetApiResponse[]` array.
 */
export async function getDraftAssets(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const assets = await fileLinksResponseService.getDraftFilesResponse(
      req.params['id']!,
      s3Client,
      baseUrl,
    );
    res.json(assets);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /generation-drafts/:draftId/ai/generate
 * Submits an AI generation request scoped to a generation draft.
 * Returns 202 Accepted with { jobId, status: 'queued' } on success.
 * Body is pre-validated by validateBody(submitDraftAiGenerationSchema) in the route.
 */
export async function submitDraftAiGeneration(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as z.infer<typeof submitDraftAiGenerationSchema>;
    const result = await generationDraftService.submitDraftAiGeneration(
      req.user!.userId,
      req.params['draftId']!,
      {
        modelId: body.modelId,
        prompt: body.prompt,
        options: body.options,
      },
    );
    res.status(202).json(result);
  } catch (err) {
    next(err);
  }
}
