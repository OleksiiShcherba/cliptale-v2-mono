import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import { ValidationError } from '@/lib/errors.js';
import { s3Client } from '@/lib/s3.js';
import * as generationDraftService from '@/services/generationDraft.service.js';
import * as generationDraftRestoreService from '@/services/generationDraft.restore.service.js';
import * as fileLinksService from '@/services/fileLinks.service.js';
import * as fileLinksResponseService from '@/services/fileLinks.response.service.js';

export {
  draftAssetsScopeSchema,
  submitDraftAiGenerationSchema,
  linkFileToDraftSchema,
  upsertDraftBodySchema,
} from '@/controllers/generationDrafts.controller.schemas.js';

import {
  draftAssetsScopeSchema,
  submitDraftAiGenerationSchema,
  linkFileToDraftSchema,
  upsertDraftBodySchema,
} from '@/controllers/generationDrafts.controller.schemas.js';

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
 * POST /generation-drafts/:id/restore
 * Restores a soft-deleted generation draft owned by the authenticated user.
 * Returns 200 with the restored draft on success.
 * Returns 404 when the draft belongs to another user, 410 when gone/TTL expired.
 */
export async function restoreDraft(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const restored = await generationDraftRestoreService.restoreDraft(
      req.user!.userId,
      req.params['id']!,
    );
    res.json(restored);
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
 * Returns draft files in the paginated envelope. `?scope=draft` (default) — linked only;
 * `?scope=all` — full library. Ownership is verified via `generationDraftService.getById`
 * which throws `ForbiddenError` when the draft belongs to a different user.
 */
export async function getDraftAssets(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = draftAssetsScopeSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ValidationError(
        `Invalid query parameters: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
      );
    }
    const userId = req.user!.userId;
    const draftId = req.params['id']!;
    // Ownership check — throws ForbiddenError if the draft does not belong to this user.
    await generationDraftService.getById(userId, draftId);

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const page = await fileLinksResponseService.getDraftFilesResponse(
      draftId,
      s3Client,
      baseUrl,
      parsed.data.scope,
      userId,
    );
    res.json(page);
  } catch (err) {
    next(err);
  }
}

/** POST /generation-drafts/:draftId/ai/generate — submit AI generation; returns 202 { jobId, status }. */
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
