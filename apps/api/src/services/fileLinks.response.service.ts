/**
 * Response-serialization for the file-links read endpoints.
 *
 * Maps `FileRow` rows (from the `files` table, read via pivot tables) to the
 * same `AssetApiResponse` shape that the FE already consumes from
 * `GET /projects/:id/assets`. This preserves backward compatibility while the
 * underlying SQL switches from `project_assets_current` to
 * `project_files → files`.
 *
 * Field mapping notes:
 *   files.display_name → AssetApiResponse.filename (primary display label)
 *   files.mime_type    → AssetApiResponse.contentType
 *   files.bytes        → AssetApiResponse.fileSizeBytes
 *   files.duration_ms  → AssetApiResponse.durationSeconds (÷ 1000)
 *   files.file_id      → AssetApiResponse.id
 *   thumbnailUri       → null (files table has no thumbnail_uri column yet;
 *                        ingest worker writes thumbnails in a later subtask)
 *   waveformPeaks      → null (same reason)
 *   projectId          → injected by caller (files are project-agnostic in DB)
 */
import { GetObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { ValidationError } from '@/lib/errors.js';
import type { AssetApiResponse } from '@/services/asset.response.service.js';
import type { FileRow } from '@/repositories/file.repository.js';
import { findAllForUserPaginated, getAllFilesTotalsForUser } from '@/repositories/file.repository.js';
import { findFilesByProjectIdPaginatedWithCursor, getProjectFilesTotals } from '@/repositories/fileLinks.repository.js';
import type { ProjectFilesCursor, FileRowWithPfCreatedAt } from '@/repositories/fileLinks.repository.js';
import { getFilesForProject, getFilesForDraft, getFilesForUser } from '@/services/fileLinks.service.js';
import { parseStorageUri } from '@/services/asset.service.js';

/** Valid values for the `scope` query parameter on the asset-list endpoints. */
export type AssetScope = 'project' | 'draft' | 'all';

/** Presigned GET URL validity — matches the value used by asset.response.service.ts. */
const DOWNLOAD_URL_EXPIRY_SECONDS = 60 * 60;

async function presignDownloadUrl(storageUri: string, s3: S3Client): Promise<string> {
  const { bucket, key } = parseStorageUri(storageUri);
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: DOWNLOAD_URL_EXPIRY_SECONDS },
  );
}

/**
 * Maps a `FileRow` to the `AssetApiResponse` shape expected by the FE.
 *
 * `projectId` is injected because `files` rows are not project-scoped; the
 * caller supplies the project context that was used to fetch the rows.
 */
async function toAssetApiResponse(
  file: FileRow,
  projectId: string,
  s3: S3Client,
): Promise<AssetApiResponse> {
  return {
    id: file.fileId,
    projectId,
    filename: file.displayName ?? file.fileId,
    displayName: file.displayName,
    contentType: file.mimeType ?? '',
    downloadUrl: await presignDownloadUrl(file.storageUri, s3),
    status: file.status,
    durationSeconds: file.durationMs != null ? file.durationMs / 1000 : null,
    width: file.width,
    height: file.height,
    fileSizeBytes: file.bytes,
    // thumbnailUri and waveformPeaks are not yet stored in `files`; return null
    // to preserve the nullable contract the FE already handles.
    thumbnailUri: null,
    waveformPeaks: null,
    createdAt: file.createdAt instanceof Date ? file.createdAt.toISOString() : file.createdAt,
    updatedAt: file.updatedAt instanceof Date ? file.updatedAt.toISOString() : file.updatedAt,
  };
}

/**
 * Returns files for a project endpoint, respecting the `scope` query param.
 *
 * - `scope=project` (default): files linked via the `project_files` pivot.
 * - `scope=all`: all non-deleted files owned by `userId`.
 *
 * This replaces the `project_assets_current` read for `GET /projects/:id/assets`.
 */
export async function getProjectFilesResponse(
  projectId: string,
  s3: S3Client,
  baseUrl: string,
  scope: AssetScope = 'project',
  userId?: string,
): Promise<AssetApiResponse[]> {
  // baseUrl is accepted for API consistency with asset.response.service; not used here
  // because there is no per-file proxy endpoint yet.
  void baseUrl;

  let files: FileRow[];
  if (scope === 'all' && userId) {
    files = await getFilesForUser(userId);
  } else {
    files = await getFilesForProject(projectId);
  }
  return Promise.all(files.map((f) => toAssetApiResponse(f, projectId, s3)));
}

/**
 * Returns files for a generation-draft endpoint as a paginated envelope,
 * respecting the `scope` query param.
 *
 * - `scope=draft` (default): files linked via the `draft_files` pivot.
 * - `scope=all`: all non-deleted files owned by `userId`.
 *
 * Returns `{ items, nextCursor: null, totals }` — the same envelope shape as
 * `getProjectAssetsPage` so the FE `AssetListResponse` contract is satisfied.
 * `nextCursor` is always `null` because draft-files lists are unpaged (drafts
 * have at most a handful of linked files and do not require keyset pagination).
 */
export async function getDraftFilesResponse(
  draftId: string,
  s3: S3Client,
  baseUrl: string,
  scope: AssetScope = 'draft',
  userId?: string,
): Promise<ProjectAssetsPage> {
  void baseUrl;

  let files: FileRow[];
  if (scope === 'all' && userId) {
    files = await getFilesForUser(userId);
  } else {
    files = await getFilesForDraft(draftId);
  }

  const items = await Promise.all(files.map((f) => toAssetApiResponse(f, '', s3)));
  const bytesUsed = files.reduce((sum, f) => sum + (f.bytes ?? 0), 0);
  return {
    items,
    nextCursor: null,
    totals: { count: items.length, bytesUsed },
  };
}

// ── Paginated project-files response (new envelope shape) ─────────────────────

/** Totals sub-object in the paginated asset list envelope. */
export type AssetListTotals = {
  count: number;
  bytesUsed: number;
};

/** Paginated response envelope for `GET /projects/:id/assets`. */
export type ProjectAssetsPage = {
  items: AssetApiResponse[];
  nextCursor: string | null;
  totals: AssetListTotals;
};

/** Parameters for the paginated project-assets service call. */
export type GetProjectAssetsPageParams = {
  projectId: string;
  scope: 'project' | 'all';
  userId: string;
  limit: number;
  cursor?: string;
  s3: S3Client;
  baseUrl: string;
};

/**
 * Encodes a `(createdAt, fileId)` pair as an opaque base64 cursor.
 * Uses the same `ISO|fileId` format as `asset.list.service.encodeCursor`
 * so downstream helpers can share the pattern.
 */
export function encodeProjectCursor(createdAt: Date, fileId: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${fileId}`, 'utf8').toString('base64');
}

/**
 * Decodes a cursor produced by `encodeProjectCursor`.
 * Throws `ValidationError` on malformed input.
 */
export function decodeProjectCursor(raw: string): ProjectFilesCursor {
  let decoded: string;
  try {
    decoded = Buffer.from(raw, 'base64').toString('utf8');
  } catch {
    throw new ValidationError('Invalid cursor');
  }
  const pipeIndex = decoded.indexOf('|');
  if (pipeIndex <= 0 || pipeIndex === decoded.length - 1) {
    throw new ValidationError('Invalid cursor');
  }
  const iso = decoded.slice(0, pipeIndex);
  const fileId = decoded.slice(pipeIndex + 1);
  const createdAt = new Date(iso);
  if (Number.isNaN(createdAt.getTime())) {
    throw new ValidationError('Invalid cursor');
  }
  return { createdAt, fileId };
}

/**
 * Returns a paginated envelope of project files.
 *
 * - `scope=project` (default): keyset-paginates `project_files → files`.
 * - `scope=all`: keyset-paginates the user's entire file library via `files`.
 *
 * Returns `{ items, nextCursor, totals: { count, bytesUsed } }`.
 * `nextCursor` is null when the page is the last (fewer than `limit` rows returned).
 */
export async function getProjectAssetsPage(
  params: GetProjectAssetsPageParams,
): Promise<ProjectAssetsPage> {
  void params.baseUrl;

  const cursor = params.cursor ? decodeProjectCursor(params.cursor) : undefined;

  if (params.scope === 'all') {
    // Paginate the user's full file library
    const allCursor = cursor
      ? { createdAt: cursor.createdAt, fileId: cursor.fileId }
      : undefined;

    const [rows, totalsRow] = await Promise.all([
      findAllForUserPaginated({ userId: params.userId, limit: params.limit, cursor: allCursor }),
      getAllFilesTotalsForUser(params.userId),
    ]);

    const items = await Promise.all(rows.map((f) => toAssetApiResponse(f, params.projectId, params.s3)));
    const lastRow = rows[rows.length - 1];
    const nextCursor =
      rows.length === params.limit && lastRow
        ? encodeProjectCursor(lastRow.createdAt, lastRow.fileId)
        : null;

    return { items, nextCursor, totals: totalsRow };
  }

  // scope=project: paginate project_files → files
  const [rows, totalsRow] = await Promise.all([
    findFilesByProjectIdPaginatedWithCursor({
      projectId: params.projectId,
      limit: params.limit,
      cursor,
    }),
    getProjectFilesTotals(params.projectId),
  ]);

  const items = await Promise.all(
    rows.map((f: FileRowWithPfCreatedAt) => toAssetApiResponse(f, params.projectId, params.s3)),
  );
  const lastRow = rows[rows.length - 1];
  const nextCursor =
    rows.length === params.limit && lastRow
      ? encodeProjectCursor(lastRow.pfCreatedAt, lastRow.fileId)
      : null;

  return { items, nextCursor, totals: totalsRow };
}
