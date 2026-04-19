import { randomUUID } from 'node:crypto';

import { HeadObjectCommand, GetObjectCommand, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import sanitize from 'sanitize-html';

import { mimeToKind, type FileKind } from '@ai-video-editor/project-schema';

import type { FileRow } from '@/repositories/file.repository.js';
import * as fileRepository from '@/repositories/file.repository.js';
import { NotFoundError, ValidationError } from '@/lib/errors.js';
import { enqueueIngestJob } from '@/queues/jobs/enqueue-ingest.js';

/** Presigned URL expiry — 15 minutes per §11 security rules. */
const PRESIGNED_URL_EXPIRY_SECONDS = 15 * 60;

/** Maximum file size accepted for upload (2 GiB). */
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  'video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska',
  'audio/mpeg', 'audio/wav', 'audio/aac', 'audio/ogg', 'audio/flac',
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'text/vtt', 'text/plain', 'application/x-subrip',
]);

// ── Shared helper (re-exported for other services) ────────────────────────────

/** Parses bucket name and object key from a `s3://bucket/key` URI. */
export function parseStorageUri(storageUri: string): { bucket: string; key: string } {
  const withoutScheme = storageUri.replace(/^s3:\/\//, '');
  const slashIndex = withoutScheme.indexOf('/');
  return {
    bucket: withoutScheme.slice(0, slashIndex),
    key: withoutScheme.slice(slashIndex + 1),
  };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Strips path separators and unsafe chars from a client-supplied filename. */
function sanitizeFilename(name: string): string {
  const stripped = sanitize(name, { allowedTags: [], allowedAttributes: {} });
  return stripped
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.\./g, '_')
    .replace(/^\.+/, '_')
    .slice(0, 255);
}

// ── Public types ──────────────────────────────────────────────────────────────

/** Request parameters for `createUploadUrl`. */
export type CreateUploadUrlParams = {
  userId: string;
  filename: string;
  mimeType: string;
  fileSizeBytes: number;
};

/** Response returned by `createUploadUrl`. */
export type UploadUrlResult = {
  fileId: string;
  uploadUrl: string;
  storageUri: string;
  /** ISO 8601 expiry timestamp. */
  expiresAt: string;
};

// ── Service functions ─────────────────────────────────────────────────────────

/**
 * Validates the upload request, issues a presigned S3 PUT URL, and inserts a
 * `pending` row in `files`.
 */
export async function createUploadUrl(
  params: CreateUploadUrlParams,
  s3: S3Client,
  bucket: string,
): Promise<UploadUrlResult> {
  if (!ALLOWED_MIME_TYPES.has(params.mimeType)) {
    throw new ValidationError(
      `MIME type "${params.mimeType}" is not allowed. Accepted types: ${[...ALLOWED_MIME_TYPES].join(', ')}`,
    );
  }
  if (params.fileSizeBytes <= 0 || params.fileSizeBytes > MAX_FILE_SIZE_BYTES) {
    throw new ValidationError(`fileSizeBytes must be between 1 and ${MAX_FILE_SIZE_BYTES} bytes`);
  }
  const safeFilename = sanitizeFilename(params.filename);
  if (!safeFilename || /^_+$/.test(safeFilename)) {
    throw new ValidationError('filename is invalid after sanitization');
  }

  const fileId = randomUUID();
  const kind = mimeToKind(params.mimeType);
  const storageKey = `users/${params.userId}/files/${fileId}/${safeFilename}`;
  const storageUri = `s3://${bucket}/${storageKey}`;

  // Note: ContentType and ContentLength are passed to PutObjectCommand but the
  // resulting presigned URL signs only `content-length;host` — NOT `content-type`.
  // Therefore the browser PUT does not need to include a matching Content-Type in its
  // signature, and the S3 bucket CORS rule's AllowedHeaders only needs to allow
  // the `Content-Type` header for the browser preflight (AllowedHeaders: ["*"]).
  // If this presign is ever changed to also sign Content-Type or checksum headers
  // (e.g. x-amz-checksum-*), revisit infra/s3/cors.json AllowedHeaders accordingly.
  // See: migration/assetId-to-fileId-cleanup Subtask 6 — Fix S3 upload CORS failure.
  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: bucket, Key: storageKey, ContentType: params.mimeType, ContentLength: params.fileSizeBytes }),
    { expiresIn: PRESIGNED_URL_EXPIRY_SECONDS },
  );
  const expiresAt = new Date(Date.now() + PRESIGNED_URL_EXPIRY_SECONDS * 1000).toISOString();

  await fileRepository.createPending({ fileId, userId: params.userId, kind, storageUri, mimeType: params.mimeType, displayName: safeFilename });

  return { fileId, uploadUrl, storageUri, expiresAt };
}

/**
 * Confirms the upload landed in storage, transitions `pending` → `processing`,
 * and enqueues a `media-ingest` job. Idempotent when already processing/ready.
 *
 * @throws NotFoundError when the file does not exist or belongs to another user.
 * @throws ValidationError when the object is absent from S3.
 */
export async function finalizeFile(
  fileId: string,
  userId: string,
  s3: S3Client,
): Promise<FileRow> {
  const file = await fileRepository.findByIdForUser(fileId, userId);
  if (!file) throw new NotFoundError(`File "${fileId}" not found`);
  if (file.status === 'processing' || file.status === 'ready') return file;

  const { bucket, key } = parseStorageUri(file.storageUri);
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  } catch (err: unknown) {
    const isNotFound = err instanceof Error && (err.name === 'NotFound' || err.name === 'NoSuchKey');
    if (isNotFound) throw new ValidationError(`File "${fileId}" has not been uploaded to storage yet`);
    throw err;
  }

  await fileRepository.finalize({ fileId, mimeType: file.mimeType ?? '' });
  await enqueueIngestJob({ fileId, storageUri: file.storageUri, contentType: file.mimeType ?? '' });
  return { ...file, status: 'processing' };
}

/** Filter options for the paginated file list. */
export type ListFilesParams = {
  userId: string;
  type: 'video' | 'image' | 'audio' | 'all';
  cursor?: string;
  limit: number;
};

/** One item in the list response. */
export type FileSummary = {
  id: string;
  kind: FileKind;
  mimeType: string | null;
  displayName: string | null;
  bytes: number | null;
  durationMs: number | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

/** Full response for `listFiles`. */
export type ListFilesResult = {
  items: FileSummary[];
  nextCursor: string | null;
};

function encodeCursor(updatedAt: Date, fileId: string): string {
  return Buffer.from(`${updatedAt.toISOString()}|${fileId}`, 'utf8').toString('base64');
}

function decodeCursor(raw: string): { updatedAt: Date; fileId: string } {
  let decoded: string;
  try { decoded = Buffer.from(raw, 'base64').toString('utf8'); }
  catch { throw new ValidationError('Invalid cursor'); }
  const pipeIndex = decoded.indexOf('|');
  if (pipeIndex <= 0 || pipeIndex === decoded.length - 1) throw new ValidationError('Invalid cursor');
  const updatedAt = new Date(decoded.slice(0, pipeIndex));
  if (Number.isNaN(updatedAt.getTime())) throw new ValidationError('Invalid cursor');
  return { updatedAt, fileId: decoded.slice(pipeIndex + 1) };
}

/** Returns the authenticated user's ready files, newest-first, cursor-paginated. */
export async function listFiles(params: ListFilesParams): Promise<ListFilesResult> {
  const mimePrefix =
    params.type === 'all' ? undefined : (`${params.type}/` as 'video/' | 'image/' | 'audio/');
  const cursor = params.cursor ? decodeCursor(params.cursor) : undefined;

  const rows = await fileRepository.findReadyForUser({ userId: params.userId, mimePrefix, cursor, limit: params.limit });
  const items: FileSummary[] = rows.map((f) => ({
    id: f.fileId,
    kind: f.kind,
    mimeType: f.mimeType,
    displayName: f.displayName,
    bytes: f.bytes,
    durationMs: f.durationMs,
    status: f.status,
    createdAt: f.createdAt instanceof Date ? f.createdAt.toISOString() : f.createdAt,
    updatedAt: f.updatedAt instanceof Date ? f.updatedAt.toISOString() : f.updatedAt,
  }));
  const nextCursor =
    rows.length === params.limit
      ? encodeCursor(rows[rows.length - 1]!.updatedAt, rows[rows.length - 1]!.fileId)
      : null;
  return { items, nextCursor };
}

/**
 * Generates a short-lived presigned GET URL for the file, verifying ownership.
 *
 * @throws NotFoundError when the file does not exist or belongs to another user.
 */
export async function streamUrl(fileId: string, userId: string, s3: S3Client): Promise<string> {
  const file = await fileRepository.findByIdForUser(fileId, userId);
  if (!file) throw new NotFoundError(`File "${fileId}" not found`);
  const { bucket, key } = parseStorageUri(file.storageUri);
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: PRESIGNED_URL_EXPIRY_SECONDS });
}
