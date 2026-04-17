/**
 * API calls for the generate-wizard feature.
 *
 * All HTTP calls go through `apiClient` — never call `fetch` directly.
 */

import { apiClient } from '@/lib/api-client';

import type { AssetListResponse, EnhanceStatus, GenerationDraft, PromptDoc } from './types';

type ListAssetsOptions = {
  /** Filter by media type. Use 'all' to return every kind. */
  type: 'all' | 'video' | 'image' | 'audio';
  /** Pagination cursor from a prior response. Omit for the first page. */
  cursor?: string;
  /** Maximum number of items to return. Defaults to 100 server-side. */
  limit?: number;
};

/**
 * Creates a new generation draft on the server.
 *
 * Maps to POST /generation-drafts.
 * Returns the persisted draft including its server-assigned id.
 */
export async function createDraft(promptDoc: PromptDoc): Promise<GenerationDraft> {
  const res = await apiClient.post('/generation-drafts', { promptDoc });
  if (!res.ok) {
    throw new Error(`POST /generation-drafts failed: ${res.status}`);
  }
  return res.json() as Promise<GenerationDraft>;
}

/**
 * Replaces the prompt doc on an existing generation draft.
 *
 * Maps to PUT /generation-drafts/:id.
 * Returns the updated draft record.
 */
export async function updateDraft(id: string, promptDoc: PromptDoc): Promise<GenerationDraft> {
  const res = await apiClient.put(`/generation-drafts/${id}`, { promptDoc });
  if (!res.ok) {
    throw new Error(`PUT /generation-drafts/${id} failed: ${res.status}`);
  }
  return res.json() as Promise<GenerationDraft>;
}

/**
 * Permanently deletes a generation draft.
 *
 * Maps to DELETE /generation-drafts/:id.
 * Resolves void on success; throws on network or server error.
 */
export async function deleteDraft(id: string): Promise<void> {
  const res = await apiClient.delete(`/generation-drafts/${id}`);
  if (!res.ok) {
    throw new Error(`DELETE /generation-drafts/${id} failed: ${res.status}`);
  }
}

/**
 * The shape returned by POST /generation-drafts/:id/enhance.
 * jobId is used to poll getEnhanceStatus.
 */
type StartEnhanceResponse = {
  jobId: string;
};

/**
 * The shape returned by GET /generation-drafts/:id/enhance/:jobId.
 */
type GetEnhanceStatusResponse = {
  status: EnhanceStatus;
  result?: PromptDoc;
  error?: string;
};

/**
 * Submits an AI Enhance request for a generation draft.
 *
 * Maps to POST /generation-drafts/:draftId/enhance.
 * Returns `{ jobId }` on 202. Throws on 429 (rate limit) or other errors.
 */
export async function startEnhance(draftId: string): Promise<StartEnhanceResponse> {
  const res = await apiClient.post(`/generation-drafts/${draftId}/enhance`, {});
  if (res.status === 429) {
    throw new Error('rate-limited');
  }
  if (!res.ok) {
    throw new Error(`POST /generation-drafts/${draftId}/enhance failed: ${res.status}`);
  }
  return res.json() as Promise<StartEnhanceResponse>;
}

/**
 * Polls the status of an AI Enhance job.
 *
 * Maps to GET /generation-drafts/:draftId/enhance/:jobId.
 * Returns `{ status, result?, error? }`.
 */
export async function getEnhanceStatus(
  draftId: string,
  jobId: string,
): Promise<GetEnhanceStatusResponse> {
  const res = await apiClient.get(`/generation-drafts/${draftId}/enhance/${jobId}`);
  if (!res.ok) {
    throw new Error(
      `GET /generation-drafts/${draftId}/enhance/${jobId} failed: ${res.status}`,
    );
  }
  return res.json() as Promise<GetEnhanceStatusResponse>;
}

/**
 * Fetches a page of the calling user's ready assets.
 *
 * Maps to GET /assets?type=&cursor=&limit=
 * Returns the `{ items, nextCursor, totals }` envelope.
 */
export async function listAssets(opts: ListAssetsOptions): Promise<AssetListResponse> {
  const params = new URLSearchParams();
  if (opts.type !== 'all') {
    params.set('type', opts.type);
  }
  if (opts.cursor) {
    params.set('cursor', opts.cursor);
  }
  if (opts.limit != null) {
    params.set('limit', String(opts.limit));
  }
  const query = params.toString();
  const path = query ? `/assets?${query}` : '/assets';
  const res = await apiClient.get(path);
  if (!res.ok) {
    throw new Error(`GET ${path} failed: ${res.status}`);
  }
  return res.json() as Promise<AssetListResponse>;
}
