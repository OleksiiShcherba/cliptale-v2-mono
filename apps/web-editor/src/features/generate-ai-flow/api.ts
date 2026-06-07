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

import { apiClient, getAuthToken } from '@/lib/api-client';
import { config } from '@/lib/config';

import type {
  Flow,
  FlowSummary,
  FlowSummaryPage,
  CanvasSave,
  CanvasSaveResult,
  CostEstimate,
  GenerateInput,
  GenerateAccepted,
  ApiError,
  BlockStarsState,
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
 *
 * `opts.confirm` — set to `true` when deleting a reference flow after the
 * Creator has confirmed the dependency warning (AC-12: ?confirm=true).
 */
export async function deleteFlow(flowId: string, opts?: { confirm?: boolean }): Promise<void> {
  const qs = opts?.confirm ? '?confirm=true' : '';
  const res = await apiClient.delete(`/generation-flows/${flowId}${qs}`);
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

/**
 * GET /files/:fileId/stream → `{ url }` (a short-lived presigned HTTPS URL).
 * Resolves a produced result asset to a displayable/streamable URL, for the
 * dominant media preview in a completed result block (AC-08). The asset lives in
 * the owner's general library, linked to this flow (AC-01).
 *
 * NOTE: this is the same owner-scoped endpoint the content-block preview uses
 * (useFileStreamUrl). The bare `/files/:id` route does NOT exist — hitting it
 * returned null and broke the result preview.
 */
export async function getFileUrl(fileId: string): Promise<string | null> {
  const res = await apiClient.get(`/files/${fileId}/stream`);
  if (!res.ok) return null;
  const data = (await res.json()) as { url?: string | null };
  return data.url ?? null;
}

// ── Generate surface (T20 / T15 endpoints) ──────────────────────────────────

// ── Stars (storyboard-reference-flows AC-06/07, versionless commutative toggles) ──

/**
 * PUT /storyboards/:draftId/references/blocks/:blockId/stars/:fileId
 * Stars a result file of the linked flow (idempotent toggle). Optionally makes it
 * primary (block preview). Returns authoritative BlockStarsState after the toggle.
 */
export async function starReferenceResult(
  draftId: string,
  blockId: string,
  fileId: string,
  opts?: { isPrimary?: boolean },
): Promise<BlockStarsState> {
  const body: Record<string, unknown> = {};
  if (opts?.isPrimary != null) body['isPrimary'] = opts.isPrimary;
  const res = await requireOk(
    await apiClient.put(
      `/storyboards/${draftId}/references/blocks/${blockId}/stars/${fileId}`,
      body,
    ),
  );
  return (await res.json()) as BlockStarsState;
}

/**
 * DELETE /storyboards/:draftId/references/blocks/:blockId/stars/:fileId
 * Un-stars a result (idempotent; preview falls back). Returns authoritative
 * BlockStarsState after removal.
 */
export async function unstarReferenceResult(
  draftId: string,
  blockId: string,
  fileId: string,
): Promise<BlockStarsState> {
  const res = await requireOk(
    await apiClient.delete(
      `/storyboards/${draftId}/references/blocks/${blockId}/stars/${fileId}`,
    ),
  );
  return (await res.json()) as BlockStarsState;
}

/**
 * POST /generation-flows/:flowId/blocks/:blockId/estimate
 * Best-effort pre-flight cost (static table, ADR-0005). Non-mutating, no
 * provider call. Shown in the cost confirmation BEFORE the paid Generate.
 */
export async function estimateGeneration(flowId: string, blockId: string): Promise<CostEstimate> {
  const res = await requireOk(
    await apiClient.post(`/generation-flows/${flowId}/blocks/${blockId}/estimate`, {}),
  );
  return (await res.json()) as CostEstimate;
}

/**
 * POST /generation-flows/:flowId/blocks/:blockId/generate
 *
 * The single spend path. REQUIRES an `Idempotency-Key` header (generated fresh per
 * Generate press, stable across the confirm step) so a double-submit / network retry
 * never double-charges — the server returns the first run's job on replay (TTL 24h).
 * Returns 202 GenerateAccepted; progress arrives async (polled via useJobPolling).
 *
 * apiClient.post cannot attach a custom header, so this uses a raw fetch with the
 * same auth + base-url idiom as api-client (token from getAuthToken, config base url).
 */
export async function generateBlock(
  flowId: string,
  blockId: string,
  input: GenerateInput,
): Promise<GenerateAccepted> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Idempotency-Key': input.idempotencyKey,
  };
  const token = getAuthToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(
    `${config.apiBaseUrl}/generation-flows/${flowId}/blocks/${blockId}/generate`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        version: input.version,
        ...(input.acknowledgedCost ? { acknowledgedCost: input.acknowledgedCost } : {}),
      }),
    },
  );
  await requireOk(res);
  return (await res.json()) as GenerateAccepted;
}
