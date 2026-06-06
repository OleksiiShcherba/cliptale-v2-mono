/**
 * Controller for GET/PUT /users/me/settings (storyboard-autosave-checkpoints).
 *
 * Responsibilities:
 * - Parse the validated request body.
 * - Call the service layer.
 * - Return the correct HTTP response.
 *
 * Owner-scoping (AC-11c) is structural: the path addresses only the
 * authenticated account (req.user) — another user's settings are not
 * addressable. The preset whitelist (ADR-0004) is enforced by the Zod schema
 * below via validateBody; no business logic lives here.
 */

import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import * as settingsService from '@/services/settings.service.js';
import { AUTOSAVE_INTERVAL_PRESETS } from '@/services/settings.service.js';

/**
 * Zod schema for PUT /users/me/settings (OpenAPI UserSettingsUpdate).
 * Only the literal presets 30/60/120/300/600 pass — anything else is a 400.
 */
export const putSettingsSchema = z.object({
  autosaveIntervalSeconds: z
    .number()
    .refine((v) => (AUTOSAVE_INTERVAL_PRESETS as readonly number[]).includes(v), {
      message: `autosaveIntervalSeconds must be one of ${AUTOSAVE_INTERVAL_PRESETS.join(', ')}`,
    }),
});

type PutSettingsBody = z.infer<typeof putSettingsSchema>;

/**
 * GET /users/me/settings
 * Returns the effective settings: stored values, or app-layer defaults
 * (60 s, updatedAt null) when no row exists yet (AC-11b).
 */
export async function getMySettings(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await settingsService.getMySettings(req.user!.userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /users/me/settings
 * Lazily upserts the caller's settings row and returns the persisted
 * effective settings (AC-09). Body is pre-validated by
 * `validateBody(putSettingsSchema)` in the route.
 */
export async function putMySettings(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as PutSettingsBody;
    const result = await settingsService.updateMySettings(req.user!.userId, body);
    res.json(result);
  } catch (err) {
    next(err);
  }
}
