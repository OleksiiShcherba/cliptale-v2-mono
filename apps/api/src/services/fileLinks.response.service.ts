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

import type { AssetApiResponse } from '@/services/asset.response.service.js';
import type { FileRow } from '@/repositories/file.repository.js';
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
 * Returns files for a generation-draft endpoint, respecting the `scope` query param.
 *
 * - `scope=draft` (default): files linked via the `draft_files` pivot.
 * - `scope=all`: all non-deleted files owned by `userId`.
 *
 * Uses an empty string for `projectId` since drafts are not project-scoped.
 */
export async function getDraftFilesResponse(
  draftId: string,
  s3: S3Client,
  baseUrl: string,
  scope: AssetScope = 'draft',
  userId?: string,
): Promise<AssetApiResponse[]> {
  void baseUrl;

  let files: FileRow[];
  if (scope === 'all' && userId) {
    files = await getFilesForUser(userId);
  } else {
    files = await getFilesForDraft(draftId);
  }
  return Promise.all(files.map((f) => toAssetApiResponse(f, '', s3)));
}
