/**
 * Global (cross-project) asset list for the authenticated user — powers the
 * wizard gallery endpoint (`GET /assets`). Separate from `asset.service.ts` to
 * keep that file under the 300-line limit while mirroring the existing split
 * convention used by `asset.response.service.ts`.
 *
 * This module owns:
 *   - MIME prefix ↔ type-enum mapping
 *   - Cursor encode/decode
 *   - Per-asset summary shape for the list endpoint
 *   - Totals bucketing
 */
import { ValidationError } from '@/lib/errors.js';
import * as assetRepository from '@/repositories/asset.repository.js';
import type { AssetMimePrefix } from '@/repositories/asset.repository.js';

/** The three asset buckets the wizard gallery filters by (`'all'` is the no-filter sentinel). */
export type AssetTypeFilter = 'video' | 'image' | 'audio' | 'all';

/** One item returned in the `items` array of the list response. */
export type AssetSummary = {
  id: string;
  type: 'video' | 'image' | 'audio';
  label: string;
  /** Derived from `duration_frames / fps`. Null when either is missing (e.g. images, unprocessed audio). */
  durationSeconds: number | null;
  /** API-proxy thumbnail URL (built by the controller to include the request origin). */
  thumbnailUrl: string | null;
  createdAt: string;
};

/** Totals across all of the user's `ready` assets — not limited to the current page. */
export type AssetTotals = {
  videos: number;
  images: number;
  audio: number;
  bytesUsed: number;
};

/** Full response body returned by the controller for `GET /assets`. */
export type ListAssetsResult = {
  items: AssetSummary[];
  nextCursor: string | null;
  totals: AssetTotals;
};

export type ListAssetsParams = {
  userId: string;
  type: AssetTypeFilter;
  cursor?: string;
  limit: number;
  /** Origin (`http://host:port`) used to build the thumbnail proxy URL per item. */
  baseUrl: string;
};

const TYPE_TO_MIME_PREFIX: Record<Exclude<AssetTypeFilter, 'all'>, AssetMimePrefix> = {
  video: 'video/',
  image: 'image/',
  audio: 'audio/',
};

/** Maps a raw `content_type` to the enum bucket. Returns null for unknown prefixes. */
function contentTypeToBucket(contentType: string): 'video' | 'image' | 'audio' | null {
  if (contentType.startsWith('video/')) return 'video';
  if (contentType.startsWith('image/')) return 'image';
  if (contentType.startsWith('audio/')) return 'audio';
  return null;
}

/** Encodes a `(updatedAt, assetId)` pair as an opaque base64 cursor. */
function encodeCursor(updatedAt: Date, assetId: string): string {
  return Buffer.from(`${updatedAt.toISOString()}|${assetId}`, 'utf8').toString('base64');
}

/**
 * Decodes a cursor produced by `encodeCursor`.
 * Throws `ValidationError` on malformed input — the client sent garbage.
 */
function decodeCursor(raw: string): { updatedAt: Date; assetId: string } {
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
  const assetId = decoded.slice(pipeIndex + 1);
  const updatedAt = new Date(iso);
  if (Number.isNaN(updatedAt.getTime())) {
    throw new ValidationError('Invalid cursor');
  }
  return { updatedAt, assetId };
}

function buildThumbnailUrl(baseUrl: string, assetId: string, thumbnailUri: string | null): string | null {
  if (!thumbnailUri) return null;
  return `${baseUrl}/assets/${assetId}/thumbnail`;
}

/**
 * Returns the authenticated user's `ready` assets for the wizard gallery:
 * newest-first, filtered by `type`, cursor-paginated, plus global totals.
 *
 * The cursor is opaque to clients — pass `nextCursor` from the previous
 * response verbatim to fetch the next page. `nextCursor` is null when the
 * page contains fewer than `limit` rows (end of list).
 */
export async function listForUser(params: ListAssetsParams): Promise<ListAssetsResult> {
  const mimePrefix = params.type === 'all' ? undefined : TYPE_TO_MIME_PREFIX[params.type];

  const cursor = params.cursor ? decodeCursor(params.cursor) : undefined;

  const [rows, totalsRows] = await Promise.all([
    assetRepository.findReadyForUser({
      userId: params.userId,
      mimePrefix,
      cursor,
      limit: params.limit,
    }),
    assetRepository.getReadyTotalsForUser(params.userId),
  ]);

  const items: AssetSummary[] = rows.flatMap((asset) => {
    const bucket = contentTypeToBucket(asset.contentType);
    if (!bucket) return [];
    const durationSeconds =
      asset.durationFrames != null && asset.fps != null && asset.fps > 0
        ? asset.durationFrames / asset.fps
        : null;
    return [
      {
        id: asset.assetId,
        type: bucket,
        label: asset.displayName ?? asset.filename,
        durationSeconds,
        thumbnailUrl: buildThumbnailUrl(params.baseUrl, asset.assetId, asset.thumbnailUri),
        createdAt: asset.createdAt instanceof Date ? asset.createdAt.toISOString() : asset.createdAt,
      },
    ];
  });

  const nextCursor =
    rows.length === params.limit
      ? encodeCursor(rows[rows.length - 1]!.updatedAt, rows[rows.length - 1]!.assetId)
      : null;

  const totals: AssetTotals = { videos: 0, images: 0, audio: 0, bytesUsed: 0 };
  for (const row of totalsRows) {
    if (row.mimePrefix === 'video/') totals.videos = row.count;
    else if (row.mimePrefix === 'image/') totals.images = row.count;
    else if (row.mimePrefix === 'audio/') totals.audio = row.count;
    totals.bytesUsed += row.bytes;
  }

  return { items, nextCursor, totals };
}
