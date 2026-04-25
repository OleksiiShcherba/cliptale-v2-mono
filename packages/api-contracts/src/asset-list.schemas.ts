/**
 * Zod schemas for the GET /projects/:id/assets paginated response envelope.
 *
 * These schemas are the runtime-checkable counterpart of the OpenAPI
 * `AssetListResponse` / `AssetApiResponseItem` / `ProjectAssetsTotals`
 * component schemas defined in openapi.ts.
 *
 * Import them anywhere you need to assert or narrow the wire shape:
 *   import { AssetListResponseSchema } from '@ai-video-editor/api-contracts';
 */
import { z } from 'zod';

/** Ingest lifecycle status of a file asset. */
export const AssetStatusSchema = z.enum(['pending', 'processing', 'ready', 'error']);

/**
 * One file/asset item as returned inside the GET /projects/:id/assets envelope.
 * Mirrors the `AssetApiResponseItem` OpenAPI schema component.
 */
export const AssetApiResponseItemSchema = z.object({
  id:              z.string().uuid(),
  projectId:       z.string(),
  filename:        z.string(),
  displayName:     z.string().nullable().optional(),
  contentType:     z.string(),
  downloadUrl:     z.string(),
  status:          AssetStatusSchema,
  durationSeconds: z.number().nullable().optional(),
  width:           z.number().int().nullable().optional(),
  height:          z.number().int().nullable().optional(),
  fileSizeBytes:   z.number().int().nullable().optional(),
  thumbnailUri:    z.string().nullable().optional(),
  waveformPeaks:   z.array(z.number()).nullable().optional(),
  createdAt:       z.string(),
  updatedAt:       z.string(),
});

/**
 * Usage totals in the paginated envelope.
 * Mirrors the `ProjectAssetsTotals` OpenAPI schema component.
 */
export const ProjectAssetsTotalsSchema = z.object({
  count:     z.number().int().min(0),
  bytesUsed: z.number().int().min(0),
});

/**
 * Paginated response envelope for GET /projects/:id/assets.
 * Mirrors the `AssetListResponse` OpenAPI schema component.
 */
export const AssetListResponseSchema = z.object({
  items:      z.array(AssetApiResponseItemSchema),
  nextCursor: z.string().nullable(),
  totals:     ProjectAssetsTotalsSchema,
});

/** TypeScript type inferred from the Zod schema — use this in FE/BE consumers. */
export type AssetApiResponseItem = z.infer<typeof AssetApiResponseItemSchema>;

/** TypeScript type for the usage totals object. */
export type ProjectAssetsTotals = z.infer<typeof ProjectAssetsTotalsSchema>;

/** TypeScript type for the full paginated envelope. */
export type AssetListResponse = z.infer<typeof AssetListResponseSchema>;
