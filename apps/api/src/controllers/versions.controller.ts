import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import * as versionService from '@/services/version.service.js';

/** Zod schema for POST /projects/:id/versions request body. */
export const saveVersionSchema = z.object({
  docJson: z.record(z.unknown()),
  docSchemaVersion: z.number().int().positive(),
  parentVersionId: z.number().int().positive().nullable(),
  patches: z.array(z.unknown()),
  inversePatches: z.array(z.unknown()),
});

type SaveVersionBody = z.infer<typeof saveVersionSchema>;

/**
 * POST /projects/:id/versions
 *
 * Persists a new project version with optimistic locking. Returns 201 with
 * `{ versionId, createdAt }` on success.
 */
export async function saveVersion(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as SaveVersionBody;
    const result = await versionService.saveVersion({
      projectId: req.params['id']!,
      docJson: body.docJson,
      docSchemaVersion: body.docSchemaVersion,
      parentVersionId: body.parentVersionId,
      patches: body.patches,
      inversePatches: body.inversePatches,
      createdByUserId: req.user?.id ?? null,
    });
    res.status(201).json({
      versionId: result.versionId,
      createdAt: result.createdAt instanceof Date
        ? result.createdAt.toISOString()
        : result.createdAt,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /projects/:id/versions
 *
 * Returns the last 50 version summaries for a project, newest first.
 * Each entry: `{ versionId, createdAt, createdByUserId, durationFrames }`.
 */
export async function listVersions(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const versions = await versionService.listVersions(req.params['id']!);
    res.status(200).json(
      versions.map((v) => ({
        versionId: v.versionId,
        createdAt: v.createdAt instanceof Date ? v.createdAt.toISOString() : v.createdAt,
        createdByUserId: v.createdByUserId,
        durationFrames: v.durationFrames,
      })),
    );
  } catch (err) {
    next(err);
  }
}

/**
 * POST /projects/:id/versions/:versionId/restore
 *
 * Restores the project to the specified version. Returns 200 with the full
 * `doc_json` of the restored version.
 */
export async function restoreVersion(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const versionId = parseInt(req.params['versionId']!, 10);
    if (!Number.isFinite(versionId) || versionId <= 0) {
      res.status(400).json({ error: 'Invalid versionId' });
      return;
    }
    const docJson = await versionService.restoreVersion({
      projectId: req.params['id']!,
      versionId,
      restoredByUserId: req.user?.id ?? null,
    });
    res.status(200).json({ docJson });
  } catch (err) {
    next(err);
  }
}
