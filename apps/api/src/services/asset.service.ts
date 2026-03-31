import { randomUUID } from 'node:crypto';

import { HeadObjectCommand, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import sanitize from 'sanitize-html';

import type { Asset } from '@/repositories/asset.repository.js';
import * as assetRepository from '@/repositories/asset.repository.js';
import { NotFoundError, ValidationError } from '@/lib/errors.js';
import { enqueueIngestJob } from '@/queues/jobs/enqueue-ingest.js';

/** Presigned URL expiry — 15 minutes per §11 security rules. */
const PRESIGNED_URL_EXPIRY_SECONDS = 15 * 60;

/** Maximum file size accepted for upload (2 GiB). */
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024 * 1024;

const ALLOWED_CONTENT_TYPES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-matroska',
  'audio/mpeg',
  'audio/wav',
  'audio/aac',
  'audio/ogg',
  'audio/flac',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

/** Parameters required to generate a presigned upload URL for a new asset. */
export type CreateUploadUrlParams = {
  projectId: string;
  userId: string;
  filename: string;
  contentType: string;
  fileSizeBytes: number;
};

/** Returned to the client after a successful presigned URL request. */
export type UploadUrlResult = {
  assetId: string;
  uploadUrl: string;
  storageUri: string;
  /** ISO 8601 timestamp after which the presigned URL is no longer valid. */
  expiresAt: string;
};

/** Strips path separators and unsafe characters from a client-supplied filename. */
function sanitizeFilename(name: string): string {
  // sanitize-html is for HTML context; for filenames we need our own rule.
  // Strip HTML tags first, then replace anything not alphanumeric/dash/underscore/dot.
  const stripped = sanitize(name, { allowedTags: [], allowedAttributes: {} });
  return stripped
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    // Replace ".." sequences AFTER char-class replace so traversal sequences are gone.
    .replace(/\.\./g, '_')
    .replace(/^\.+/, '_') // no leading dots (hidden files)
    .slice(0, 255);
}

/**
 * Validates the upload request, generates a presigned S3 PUT URL, and inserts a
 * pending asset row in the database.
 *
 * @param s3 - Caller-provided S3Client instance (allows injection in tests).
 * @param bucket - S3 bucket name.
 */
export async function createUploadUrl(
  params: CreateUploadUrlParams,
  s3: S3Client,
  bucket: string,
): Promise<UploadUrlResult> {
  if (!ALLOWED_CONTENT_TYPES.has(params.contentType)) {
    throw new ValidationError(
      `Content type "${params.contentType}" is not allowed. ` +
        `Accepted types: ${[...ALLOWED_CONTENT_TYPES].join(', ')}`,
    );
  }

  if (params.fileSizeBytes <= 0 || params.fileSizeBytes > MAX_FILE_SIZE_BYTES) {
    throw new ValidationError(
      `fileSizeBytes must be between 1 and ${MAX_FILE_SIZE_BYTES} bytes`,
    );
  }

  const safeFilename = sanitizeFilename(params.filename);
  // Reject filenames that reduce entirely to underscores after sanitization (e.g. "!!!").
  if (!safeFilename || /^_+$/.test(safeFilename)) {
    throw new ValidationError('filename is invalid after sanitization');
  }

  const assetId = randomUUID();
  const storageKey = `projects/${params.projectId}/assets/${assetId}/${safeFilename}`;
  const storageUri = `s3://${bucket}/${storageKey}`;

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: storageKey,
    ContentType: params.contentType,
    ContentLength: params.fileSizeBytes,
  });

  const uploadUrl = await getSignedUrl(s3, command, {
    expiresIn: PRESIGNED_URL_EXPIRY_SECONDS,
  });

  const expiresAt = new Date(
    Date.now() + PRESIGNED_URL_EXPIRY_SECONDS * 1000,
  ).toISOString();

  await assetRepository.insertPendingAsset({
    assetId,
    projectId: params.projectId,
    userId: params.userId,
    filename: safeFilename,
    contentType: params.contentType,
    fileSizeBytes: params.fileSizeBytes,
    storageUri,
  });

  return { assetId, uploadUrl, storageUri, expiresAt };
}

/**
 * Returns all assets for a project. Returns an empty array when the project
 * has no assets — never throws NotFoundError for a missing project.
 */
export async function getProjectAssets(projectId: string): Promise<Asset[]> {
  return assetRepository.getAssetsByProjectId(projectId);
}

/** Returns an asset by ID, or throws NotFoundError if it does not exist. */
export async function getAsset(assetId: string): Promise<Asset> {
  const asset = await assetRepository.getAssetById(assetId);
  if (!asset) {
    throw new NotFoundError(`Asset "${assetId}" not found`);
  }
  return asset;
}

/** Parses bucket name and object key from a `s3://bucket/key` URI. */
function parseStorageUri(storageUri: string): { bucket: string; key: string } {
  const withoutScheme = storageUri.replace(/^s3:\/\//, '');
  const slashIndex = withoutScheme.indexOf('/');
  return {
    bucket: withoutScheme.slice(0, slashIndex),
    key: withoutScheme.slice(slashIndex + 1),
  };
}

/**
 * Finalizes an asset upload: verifies the object exists in storage, transitions
 * status from `pending` → `processing`, and enqueues a `media-ingest` job.
 *
 * Idempotent — returns the current asset without side-effects if status is
 * already `processing` or `ready`.
 *
 * @param s3 - Caller-provided S3Client (allows injection in tests).
 */
export async function finalizeAsset(assetId: string, s3: S3Client): Promise<Asset> {
  const asset = await assetRepository.getAssetById(assetId);
  if (!asset) {
    throw new NotFoundError(`Asset "${assetId}" not found`);
  }

  // Idempotency: already in-flight or done — nothing to do.
  if (asset.status === 'processing' || asset.status === 'ready') {
    return asset;
  }

  // Verify the object was actually PUT to storage before we mark it as processing.
  const { bucket, key } = parseStorageUri(asset.storageUri);
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  } catch (err: unknown) {
    const isNotFound =
      err instanceof Error && (err.name === 'NotFound' || err.name === 'NoSuchKey');
    if (isNotFound) {
      throw new ValidationError(
        `Asset "${assetId}" has not been uploaded to storage yet`,
      );
    }
    throw err;
  }

  await assetRepository.updateAssetStatus(assetId, 'processing');

  await enqueueIngestJob({
    assetId,
    storageUri: asset.storageUri,
    contentType: asset.contentType,
  });

  return { ...asset, status: 'processing' };
}
