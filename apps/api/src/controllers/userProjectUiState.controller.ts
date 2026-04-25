/**
 * Controller for GET/PUT /projects/:id/ui-state.
 *
 * Responsibilities:
 * - Parse the validated request body.
 * - Call the service layer.
 * - Return the correct HTTP response.
 *
 * No business logic lives here. All validation is done by Zod middleware
 * before these handlers are invoked.
 */

import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import * as uiStateService from '@/services/userProjectUiState.service.js';

/**
 * Permissive Zod schema for PUT /projects/:id/ui-state.
 *
 * The `state` field accepts any JSON-serialisable value (object, array, string,
 * number, boolean, null). `undefined` is explicitly excluded because it is not
 * a valid JSON value and would corrupt the stored blob. The shape is owned by
 * the web-editor; the API treats the value as an opaque blob.
 */
export const putUiStateSchema = z.object({
  // z.unknown() accepts undefined; the refine narrows to valid JSON values only.
  state: z.unknown().refine((v) => v !== undefined, {
    message: 'state is required and must be a valid JSON value',
  }),
});

type PutUiStateBody = z.infer<typeof putUiStateSchema>;

/**
 * GET /projects/:id/ui-state
 * Returns `{ state: unknown | null, updatedAt: string | null }`.
 */
export async function getUiState(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await uiStateService.getUiState(
      req.user!.userId,
      req.params['id']!,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /projects/:id/ui-state
 * Accepts `{ state: unknown }`, upserts the record, and returns 204 No Content.
 * Body is pre-validated by `validateBody(putUiStateSchema)` in the route.
 */
export async function putUiState(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { state } = req.body as PutUiStateBody;
    await uiStateService.saveUiState(req.user!.userId, req.params['id']!, state);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
