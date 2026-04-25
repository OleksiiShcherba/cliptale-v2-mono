/**
 * Zod schemas for the assets controller — extracted to keep
 * `assets.controller.ts` under the §9.7 300-line cap.
 *
 * Exported schemas:
 *   createUploadUrlSchema  — POST /assets/upload-url body
 *   patchAssetSchema       — PATCH /assets/:id body
 *   listAssetsQuerySchema  — GET /assets query string
 *   projectAssetsQuerySchema — GET /projects/:id/assets query string
 */
import { z } from 'zod';

/** Zod schema for the POST /assets/upload-url request body. Exported for use in route middleware. */
export const createUploadUrlSchema = z.object({
  filename: z.string().min(1).max(512),
  contentType: z.string().min(1),
  fileSizeBytes: z.number().int().positive(),
});

/** Zod schema for the PATCH /assets/:id request body. Exported for use in route middleware. */
export const patchAssetSchema = z.object({
  name: z.string().trim().min(1).max(255),
});

/**
 * Zod schema for the GET /assets query string — validates the `type`, `cursor`,
 * and `limit` query params used by the wizard gallery endpoint. Parsed inline
 * in the `listAssets` handler because `validateBody` only runs on `req.body`.
 */
export const listAssetsQuerySchema = z.object({
  type: z.enum(['video', 'image', 'audio', 'all']).default('all'),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(24),
});

/**
 * Zod schema for `GET /projects/:id/assets` query string.
 * Accepts `scope`, `cursor`, and `limit`; invalid `scope` or `limit` → 400.
 * `draft` is not valid here — use the generation-drafts endpoint.
 */
export const projectAssetsQuerySchema = z.object({
  scope: z.enum(['all', 'project']).default('project'),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(24),
});
