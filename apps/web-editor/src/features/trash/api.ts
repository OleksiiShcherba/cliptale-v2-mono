/**
 * API helpers for the Trash feature.
 *
 * All HTTP calls go through `apiClient` — never call fetch directly.
 */

import { apiClient } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The entity kind that was soft-deleted. */
export type TrashItemKind = 'file' | 'project' | 'draft';

/** A single row returned by GET /trash. */
export type TrashItem = {
  id: string;
  kind: TrashItemKind;
  name: string;
  deletedAt: string;
};

type TrashListResponse = {
  items: TrashItem[];
};

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

/**
 * Fetches the last 50 soft-deleted items across all kinds.
 * Maps to GET /trash?limit=50.
 */
export async function listTrash(): Promise<TrashItem[]> {
  const res = await apiClient.get('/trash?limit=50');
  if (!res.ok) {
    throw new Error(`GET /trash failed: ${res.status}`);
  }
  const data = (await res.json()) as TrashListResponse;
  return data.items;
}

/**
 * Restores a soft-deleted asset (file).
 * Maps to POST /assets/:id/restore.
 */
export async function restoreAsset(fileId: string): Promise<void> {
  const res = await apiClient.post(`/assets/${fileId}/restore`, {});
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`POST /assets/${fileId}/restore failed (${res.status}): ${body}`);
  }
}

/**
 * Restores a soft-deleted project.
 * Maps to POST /projects/:id/restore.
 */
export async function restoreProject(projectId: string): Promise<void> {
  const res = await apiClient.post(`/projects/${projectId}/restore`, {});
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`POST /projects/${projectId}/restore failed (${res.status}): ${body}`);
  }
}

/**
 * Restores a soft-deleted generation draft.
 * Maps to POST /generation-drafts/:id/restore.
 */
export async function restoreDraft(draftId: string): Promise<void> {
  const res = await apiClient.post(`/generation-drafts/${draftId}/restore`, {});
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`POST /generation-drafts/${draftId}/restore failed (${res.status}): ${body}`);
  }
}

/**
 * Dispatches the correct restore call based on item kind.
 */
export async function restoreTrashItem(item: TrashItem): Promise<void> {
  if (item.kind === 'file') return restoreAsset(item.id);
  if (item.kind === 'project') return restoreProject(item.id);
  return restoreDraft(item.id);
}
