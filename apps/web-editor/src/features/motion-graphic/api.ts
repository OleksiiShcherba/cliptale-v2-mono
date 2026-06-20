/**
 * API calls for the motion-graphic feature.
 *
 * All HTTP calls go through `apiClient` — never call `fetch` directly. The typed
 * wrappers mirror the endpoints in
 * `docs/features/ai-motion-graphic/contracts/openapi.yaml`.
 *
 * NOTE: the two SSE authoring streams (`POST /motion-graphics/generate` and
 * `POST /motion-graphics/:id/refine`) are NOT wrapped here — they need a raw
 * streaming response rather than the JSON `apiClient` helpers, and are owned by
 * the `runtime/` module (T14). This file covers the JSON CRUD surface.
 */

import { apiClient } from '@/lib/api-client';

import type {
  AttachMotionGraphicRequest,
  BlockMediaMotionGraphic,
  MotionGraphic,
  MotionGraphicCreate,
  MotionGraphicError,
  MotionGraphicRename,
  MotionGraphicSummary,
  MotionGraphicSummaryPage,
  TurnCreate,
} from './types';

/**
 * A typed attach failure carrying the machine-readable `code` from the error
 * envelope — so the storyboard picker can tell `motion_graphic.not_ready`
 * (AC-08) apart from other 4xx and surface the human `error` message.
 * Mirrors the GenerateStreamError idiom in hooks/useGenerateStream.ts.
 */
export class AttachMotionGraphicError extends Error {
  code: string | null;
  status: number;
  details?: Record<string, unknown>;

  constructor(
    message: string,
    opts: { code?: string | null; status: number; details?: Record<string, unknown> },
  ) {
    super(message);
    this.name = 'AttachMotionGraphicError';
    this.code = opts.code ?? null;
    this.status = opts.status;
    this.details = opts.details;
  }
}

type ListMotionGraphicsOptions = {
  /** Opaque cursor from a prior response. Omit for the first page. */
  cursor?: string;
  /** Maximum number of items to return. Defaults to 24 server-side. */
  limit?: number;
};

/**
 * Lists the calling Creator's non-deleted Motion Graphics, most-recent first.
 *
 * Maps to GET /motion-graphics?cursor=&limit= (Flow 5 / AC-13).
 * Returns the `{ items, nextCursor }` envelope.
 */
export async function listMotionGraphics(
  opts: ListMotionGraphicsOptions = {},
): Promise<MotionGraphicSummaryPage> {
  const params = new URLSearchParams();
  if (opts.cursor) {
    params.set('cursor', opts.cursor);
  }
  if (opts.limit != null) {
    params.set('limit', String(opts.limit));
  }
  const query = params.toString();
  const path = query ? `/motion-graphics?${query}` : '/motion-graphics';
  const res = await apiClient.get(path);
  if (!res.ok) {
    throw new Error(`GET ${path} failed: ${res.status}`);
  }
  return res.json() as Promise<MotionGraphicSummaryPage>;
}

/**
 * Persists the first exchange of a newly generated graphic (the browser verdict).
 *
 * Maps to POST /motion-graphics (Flow 1 persist branch).
 * Returns the created graphic.
 */
export async function createMotionGraphic(body: MotionGraphicCreate): Promise<MotionGraphic> {
  const res = await apiClient.post('/motion-graphics', body);
  if (!res.ok) {
    throw new Error(`POST /motion-graphics failed: ${res.status}`);
  }
  return res.json() as Promise<MotionGraphic>;
}

/**
 * Opens a Motion Graphic — code, duration, geometry, status + chat history.
 *
 * Maps to GET /motion-graphics/:id (Flow 4). Non-owner / absent → 404.
 */
export async function getMotionGraphic(id: string): Promise<MotionGraphic> {
  const res = await apiClient.get(`/motion-graphics/${id}`);
  if (!res.ok) {
    throw new Error(`GET /motion-graphics/${id} failed: ${res.status}`);
  }
  return res.json() as Promise<MotionGraphic>;
}

/**
 * Renames a Motion Graphic (metadata-only).
 *
 * Maps to PATCH /motion-graphics/:id (AC-01). Returns the refreshed summary.
 */
export async function renameMotionGraphic(
  id: string,
  body: MotionGraphicRename,
): Promise<MotionGraphicSummary> {
  const res = await apiClient.patch(`/motion-graphics/${id}`, body);
  if (!res.ok) {
    throw new Error(`PATCH /motion-graphics/${id} failed: ${res.status}`);
  }
  return res.json() as Promise<MotionGraphicSummary>;
}

/**
 * Persists a refinement exchange (append chat turn; update code on success).
 *
 * Maps to POST /motion-graphics/:id/turns (Flow 3 persist branch).
 * Returns the refreshed graphic.
 */
export async function appendMotionGraphicTurn(
  id: string,
  body: TurnCreate,
): Promise<MotionGraphic> {
  const res = await apiClient.post(`/motion-graphics/${id}/turns`, body);
  if (!res.ok) {
    throw new Error(`POST /motion-graphics/${id}/turns failed: ${res.status}`);
  }
  return res.json() as Promise<MotionGraphic>;
}

/**
 * Duplicates a Motion Graphic into an independent copy.
 *
 * Maps to POST /motion-graphics/:id/duplicate (Flow 6 / AC-12).
 * Returns the new independent copy.
 */
export async function duplicateMotionGraphic(id: string): Promise<MotionGraphic> {
  const res = await apiClient.post(`/motion-graphics/${id}/duplicate`, {});
  if (!res.ok) {
    throw new Error(`POST /motion-graphics/${id}/duplicate failed: ${res.status}`);
  }
  return res.json() as Promise<MotionGraphic>;
}

/**
 * Attaches a Motion Graphic to a storyboard block as a frozen snapshot.
 *
 * Maps to POST /storyboards/:draftId/blocks/:blockId/media/motion-graphic
 * (Flow 2 / AC-04, AC-08, AC-10). Returns the new block-media row.
 */
export async function attachMotionGraphicToBlock(
  draftId: string,
  blockId: string,
  body: AttachMotionGraphicRequest,
): Promise<BlockMediaMotionGraphic> {
  const path = `/storyboards/${draftId}/blocks/${blockId}/media/motion-graphic`;
  const res = await apiClient.post(path, body);
  if (!res.ok) {
    // Parse the unified error envelope (free-text `error` + optional `code`) so the
    // caller can surface AC-08's `motion_graphic.not_ready` refusal message.
    let envelope: MotionGraphicError | null = null;
    try {
      envelope = (await res.json()) as MotionGraphicError;
    } catch {
      envelope = null;
    }
    throw new AttachMotionGraphicError(
      envelope?.error ?? `POST ${path} failed: ${res.status}`,
      { code: envelope?.code ?? null, status: res.status, details: envelope?.details },
    );
  }
  return res.json() as Promise<BlockMediaMotionGraphic>;
}
