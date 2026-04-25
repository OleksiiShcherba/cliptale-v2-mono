/**
 * Response-serialization and streaming functions for assets.
 *
 * Extracted from asset.service.ts to keep that file under the 300-line limit.
 * This module owns:
 *   - Presigned GET URL generation
 *   - s3:// → HTTPS thumbnail URL conversion
 *   - AssetApiResponse shape + mapping from repository Asset
 *   - S3 binary streaming (proxy) with Range-request forwarding
 */
import { GetObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import type { GetObjectCommandInput } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { config } from '@/config.js';
import type { Asset } from '@/repositories/asset.repository.js';
import {
  getAsset,
  getProjectAssets,
  finalizeAsset,
  parseStorageUri,
} from './asset.service.js';

// ---------------------------------------------------------------------------
// Presigned download URL + thumbnail URL helpers
// ---------------------------------------------------------------------------

/** Validity of presigned GET URLs issued to the browser — 1 hour per playback session. */
const DOWNLOAD_URL_EXPIRY_SECONDS = 60 * 60;

/**
 * Generates a presigned HTTPS GET URL for an `s3://` URI so the browser can
 * fetch the object without ever receiving raw S3 credentials or bucket paths.
 */
async function presignDownloadUrl(storageUri: string, s3: S3Client): Promise<string> {
  const { bucket, key } = parseStorageUri(storageUri);
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: DOWNLOAD_URL_EXPIRY_SECONDS },
  );
}

/**
 * Returns the API-proxy thumbnail URL for an asset, or null if no thumbnail exists.
 * The proxy endpoint (`/assets/:id/thumbnail`) streams the thumbnail from S3 so the
 * raw S3 URI and bucket credentials are never exposed to the browser.
 */
function thumbnailProxyUrl(fileId: string, thumbnailUri: string | null, baseUrl: string): string | null {
  if (!thumbnailUri) return null;
  return `${baseUrl}/assets/${fileId}/thumbnail`;
}

// ---------------------------------------------------------------------------
// AssetApiResponse type + serialization
// ---------------------------------------------------------------------------

/** API response shape for an asset — what controllers return to the client. */
export type AssetApiResponse = {
  id: string;
  projectId: string;
  filename: string;
  /** User-provided display name. When set, the UI shows this instead of `filename`. */
  displayName: string | null;
  contentType: string;
  /** Presigned HTTPS GET URL for direct download — never a raw s3:// URI. */
  downloadUrl: string;
  status: string;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  fileSizeBytes: number | null;
  thumbnailUri: string | null;
  waveformPeaks: number[] | null;
  createdAt: string;
  updatedAt: string;
};

/** Maps a repository Asset to the `AssetApiResponse` the client receives. */
async function toAssetApiResponse(asset: Asset, s3: S3Client, baseUrl: string): Promise<AssetApiResponse> {
  return {
    id: asset.fileId,
    projectId: asset.projectId,
    filename: asset.filename,
    displayName: asset.displayName,
    contentType: asset.contentType,
    downloadUrl: await presignDownloadUrl(asset.storageUri, s3),
    status: asset.status,
    durationSeconds:
      asset.durationFrames != null && asset.fps != null
        ? asset.durationFrames / asset.fps
        : null,
    width: asset.width,
    height: asset.height,
    fileSizeBytes: asset.fileSizeBytes,
    thumbnailUri: thumbnailProxyUrl(asset.fileId, asset.thumbnailUri, baseUrl),
    waveformPeaks: asset.waveformJson as number[] | null,
    createdAt: asset.createdAt instanceof Date ? asset.createdAt.toISOString() : asset.createdAt,
    updatedAt: asset.updatedAt instanceof Date ? asset.updatedAt.toISOString() : asset.updatedAt,
  };
}

/**
 * Returns a single asset serialized for the API response.
 * Throws NotFoundError if the asset does not exist.
 * `baseUrl` is used to build the thumbnail proxy URL (e.g. `http://localhost:3001`).
 */
export async function getAssetResponse(fileId: string, s3: S3Client, baseUrl: string): Promise<AssetApiResponse> {
  const asset = await getAsset(fileId);
  return toAssetApiResponse(asset, s3, baseUrl);
}

/**
 * Returns all assets for a project serialized for the API response.
 * Returns an empty array when the project has no assets.
 * `baseUrl` is used to build the thumbnail proxy URL.
 */
export async function getProjectAssetsResponse(
  projectId: string,
  s3: S3Client,
  baseUrl: string,
): Promise<AssetApiResponse[]> {
  const assets = await getProjectAssets(projectId);
  return Promise.all(assets.map((a) => toAssetApiResponse(a, s3, baseUrl)));
}

/**
 * Finalizes an asset upload and returns the asset serialized for the API response.
 * Delegates finalization logic to `finalizeAsset`.
 * `baseUrl` is used to build the thumbnail proxy URL.
 */
export async function finalizeAssetResponse(
  fileId: string,
  s3: S3Client,
  baseUrl: string,
): Promise<AssetApiResponse> {
  const asset = await finalizeAsset(fileId, s3);
  return toAssetApiResponse(asset, s3, baseUrl);
}

// ---------------------------------------------------------------------------
// S3 binary streaming (proxy)
// ---------------------------------------------------------------------------

/** Returned by `streamAsset` so the controller can pipe the body and set headers. */
export type AssetStreamResult = {
  body: NodeJS.ReadableStream;
  contentType: string | undefined;
  contentLength: number | undefined;
  contentRange: string | undefined;
  /** True when a Range header was honoured — caller should respond with 206. */
  isPartialContent: boolean;
};

/**
 * Fetches the asset binary from S3 and returns the readable stream together
 * with the relevant HTTP headers. Forwards `rangeHeader` to S3 so byte-range
 * requests for video seeking are handled correctly.
 *
 * Throws NotFoundError if the asset does not exist in the database.
 * Returns `null` when S3 responds with no body (caller should send 204).
 *
 * @param s3 - Caller-provided S3Client (allows injection in tests).
 */
export async function streamAsset(
  fileId: string,
  rangeHeader: string | undefined,
  s3: S3Client,
): Promise<AssetStreamResult | null> {
  const asset = await getAsset(fileId);
  const { bucket, key } = parseStorageUri(asset.storageUri);

  const commandInput: GetObjectCommandInput = { Bucket: bucket, Key: key };
  if (rangeHeader) {
    commandInput.Range = rangeHeader;
  }

  const s3Response = await s3.send(new GetObjectCommand(commandInput));

  if (!s3Response.Body) {
    return null;
  }

  return {
    body: s3Response.Body as NodeJS.ReadableStream,
    contentType: s3Response.ContentType,
    contentLength: s3Response.ContentLength,
    contentRange: s3Response.ContentRange,
    isPartialContent: typeof rangeHeader === 'string',
  };
}

/**
 * Fetches the asset's thumbnail from S3 and returns the readable stream.
 * Returns `null` if the asset has no thumbnail (caller should send 404).
 *
 * @param s3 - Caller-provided S3Client (allows injection in tests).
 */
export async function streamThumbnail(
  fileId: string,
  s3: S3Client,
): Promise<Omit<AssetStreamResult, 'contentRange' | 'isPartialContent'> | null> {
  const asset = await getAsset(fileId);
  if (!asset.thumbnailUri) return null;

  const { bucket, key } = parseStorageUri(asset.thumbnailUri);
  const s3Response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));

  if (!s3Response.Body) return null;

  return {
    body: s3Response.Body as NodeJS.ReadableStream,
    contentType: s3Response.ContentType,
    contentLength: s3Response.ContentLength,
  };
}
