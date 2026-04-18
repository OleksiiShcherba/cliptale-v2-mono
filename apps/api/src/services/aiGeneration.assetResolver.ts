/**
 * File-URL resolver for AI generation submissions.
 *
 * Walks a model's declared `inputSchema.fields` and rewrites any
 * `image_url` / `image_url_list` / `audio_url` field whose value is an
 * internal file ID into a short-lived presigned HTTPS GET URL the worker
 * can fetch directly. Values that are already `https://…` URLs pass through
 * unchanged.
 *
 * After Batch 1 Subtask 8 the resolver looks up file IDs in the `files` table
 * (via `file.repository.findByIdForUser`) rather than the legacy
 * `project_assets_current` table. Ownership is enforced by the repository query:
 * a user cannot reference another user's file.
 *
 * Design notes:
 *  - The walk is keyed off `field.type`, NEVER field name — the catalog uses
 *    names like `image_url`, `end_image_url`, `reference_images`, `image_urls`,
 *    `mask_image_url` etc. Only `type` is a reliable signal.
 *  - Presigned URLs are capped at 1 hour per §11 security patterns.
 *  - The shape of `options` is trusted — `validateFalOptions` has already run
 *    before this resolver is invoked. The one defensive throw here protects
 *    against a future validator regression where `image_url_list` arrives as a
 *    non-array; the resolver must not index into a non-array silently.
 */
import { GetObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { AiModel } from '@ai-video-editor/api-contracts';

import { NotFoundError, ValidationError } from '@/lib/errors.js';
import { s3Client as defaultS3Client } from '@/lib/s3.js';
import { findByIdForUser } from '@/repositories/file.repository.js';
import { parseStorageUri } from '@/services/file.service.js';

/** Presigned URL TTL for file inputs — ≤ 1 hour per §11 security rule. */
const PRESIGN_EXPIRY_SECONDS = 60 * 60;

/** Parameters accepted by {@link resolveAssetImageUrls}. */
export type ResolveAssetImageUrlsParams = {
  model: AiModel;
  options: Record<string, unknown>;
  userId: string;
  /** Optional S3 client override — defaults to the singleton in `@/lib/s3.js`. */
  s3?: S3Client;
};

/** Narrow a value to an `https://…` string. Case-insensitive on the scheme. */
function isHttpsUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https:\/\//i.test(value);
}

/**
 * Resolves a single element of an image/audio field: passthrough for https URLs,
 * presigned URL issuance for internal file IDs. Enforces ownership via
 * `findByIdForUser` — if the file does not belong to `userId`, returns null and
 * this function throws NotFoundError (same surface as a missing file).
 */
async function resolveOne(
  element: unknown,
  userId: string,
  s3: S3Client,
): Promise<string> {
  if (isHttpsUrl(element)) {
    return element;
  }
  // Trust `validateFalOptions` to have rejected non-string shapes already.
  const fileId = element as string;

  const file = await findByIdForUser(fileId, userId);
  if (!file) {
    throw new NotFoundError(`File "${fileId}" not found`);
  }
  // findByIdForUser enforces ownership via WHERE user_id = ?. A cross-user
  // lookup returns null, which surfaces as NotFoundError (avoids leaking
  // whether the file exists for another user).

  const { bucket, key } = parseStorageUri(file.storageUri);
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: PRESIGN_EXPIRY_SECONDS },
  );
}

/**
 * Walks the model's declared fields and rewrites every `image_url` /
 * `image_url_list` / `audio_url` value in-place on a shallow clone of `options`.
 * The returned object is safe to pass to the queue / DB layer — every
 * image/audio-type field is either an https URL or undefined.
 *
 * Fields whose value is `undefined` or `null` are skipped (optional fields).
 * Non-image/audio fields are left untouched.
 */
export async function resolveAssetImageUrls(
  params: ResolveAssetImageUrlsParams,
): Promise<Record<string, unknown>> {
  const { model, options, userId, s3 = defaultS3Client } = params;

  // Shallow clone so we never mutate the caller's bag. Array fields are
  // deep-cloned in place below via `.map(...)`.
  const resolved: Record<string, unknown> = { ...options };

  for (const field of model.inputSchema.fields) {
    const isResolvable =
      field.type === 'image_url' ||
      field.type === 'image_url_list' ||
      field.type === 'audio_url';
    if (!isResolvable) {
      continue;
    }

    const value = resolved[field.name];
    if (value === undefined || value === null) {
      continue;
    }

    if (field.type === 'image_url' || field.type === 'audio_url') {
      resolved[field.name] = await resolveOne(value, userId, s3);
      continue;
    }

    // image_url_list
    if (!Array.isArray(value)) {
      throw new ValidationError(
        `Field "${field.name}" must be an array of file IDs or https URLs`,
      );
    }
    const rewritten: string[] = [];
    for (const element of value) {
      rewritten.push(await resolveOne(element, userId, s3));
    }
    resolved[field.name] = rewritten;
  }

  return resolved;
}

