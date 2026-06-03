/**
 * T16 — typed API client for the 6 flow CRUD endpoints.
 *
 * All calls go through `apiClient` (never raw fetch) — the repo idiom from
 * apps/web-editor/src/lib/api-client.ts. Error handling: throw with the
 * `{ error, code, details }` envelope so callers can inspect codes.
 *
 * Endpoints covered (contracts/openapi.yaml):
 *   GET    /generation-flows                              → listFlows
 *   POST   /generation-flows                             → createFlow
 *   GET    /generation-flows/:flowId                     → getFlow
 *   PATCH  /generation-flows/:flowId                     → renameFlow
 *   DELETE /generation-flows/:flowId                     → deleteFlow
 *   PUT    /generation-flows/:flowId/canvas              → saveCanvas
 */

import { apiClient } from '@/lib/api-client';

import type {
  Flow,
  FlowSummary,
  FlowSummaryPage,
  CanvasSave,
  CanvasSaveResult,
  ApiError,
} from './types';

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Parses the response JSON and throws an `ApiError`-shaped Error if the
 * response is not ok. Adds the status code to the message for diagnostics.
 */
async function requireOk(res: Response): Promise<Response> {
  if (!res.ok) {
    let parsed: Partial<ApiError> = {};
    try {
      parsed = (await res.json()) as Partial<ApiError>;
    } catch {
      // body may not be JSON — fall through
    }
    const msg = parsed.error ?? `HTTP ${res.status}`;
    const err = new Error(msg) as Error & { code?: string | null; details?: unknown; status: number };
    err.code = parsed.code ?? null;
    err.details = parsed.details;
    err.status = res.status;
    throw err;
  }
  return res;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * GET /generation-flows
 * Returns the Creator's flows newest-first (server-ordered by updatedAt DESC).
 * Optional cursor + limit for pagination.
 */
export async function listFlows(opts?: {
  cursor?: string | null;
  limit?: number;
}): Promise<FlowSummaryPage> {
  const params = new URLSearchParams();
  if (opts?.cursor != null) params.set('cursor', opts.cursor);
  if (opts?.limit != null) params.set('limit', String(opts.limit));
  const qs = params.size > 0 ? `?${params.toString()}` : '';
  const res = await requireOk(await apiClient.get(`/generation-flows${qs}`));
  return (await res.json()) as FlowSummaryPage;
}

/**
 * POST /generation-flows
 * Creates a new empty flow. Returns the full Flow (canvas + jobs).
 */
export async function createFlow(title?: string): Promise<Flow> {
  const body: Record<string, string> = {};
  if (title != null) body['title'] = title;
  const res = await requireOk(await apiClient.post('/generation-flows', body));
  return (await res.json()) as Flow;
}

/**
 * GET /generation-flows/:flowId
 * Returns the full flow (canvas + per-block job states for reattach).
 * Non-owner / absent → throws with status 404 (existence hiding, AC-04).
 */
export async function getFlow(flowId: string): Promise<Flow> {
  const res = await requireOk(await apiClient.get(`/generation-flows/${flowId}`));
  return (await res.json()) as Flow;
}

/**
 * PATCH /generation-flows/:flowId
 * Renames a flow. Returns the updated FlowSummary.
 */
export async function renameFlow(flowId: string, title: string): Promise<FlowSummary> {
  const res = await requireOk(
    await apiClient.patch(`/generation-flows/${flowId}`, { title }),
  );
  return (await res.json()) as FlowSummary;
}

/**
 * DELETE /generation-flows/:flowId
 * Soft-deletes a flow. Resolves on 204. Non-owner / absent → throws 404.
 * Idempotent by spec.
 */
export async function deleteFlow(flowId: string): Promise<void> {
  const res = await apiClient.delete(`/generation-flows/${flowId}`);
  if (res.status === 204) return;
  await requireOk(res); // will throw for non-2xx
}

/**
 * PUT /generation-flows/:flowId/canvas
 * Autosaves the canvas document with the parent version for optimistic locking.
 * Returns the new (incremented) version + updatedAt (AC-10b).
 * Throws with status 409 on version conflict.
 */
export async function saveCanvas(flowId: string, payload: CanvasSave): Promise<CanvasSaveResult> {
  const res = await requireOk(
    await apiClient.put(`/generation-flows/${flowId}/canvas`, payload),
  );
  return (await res.json()) as CanvasSaveResult;
}
