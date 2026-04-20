import { apiClient } from '@/lib/api-client';

import type { Asset } from './types';

/** Fetch a single asset by ID. */
export async function getAsset(fileId: string): Promise<Asset> {
  const res = await apiClient.get(`/assets/${fileId}`);
  if (!res.ok) throw new Error(`Failed to get asset (${res.status})`);
  return res.json() as Promise<Asset>;
}

/**
 * Fetch assets for a project.
 * @param scope `'project'` (default) — files linked to this project only;
 *              `'all'` — the user's entire non-deleted library.
 */
export async function getAssets(
  projectId: string,
  scope: 'all' | 'project' = 'project',
): Promise<Asset[]> {
  const params = new URLSearchParams({ scope });
  const res = await apiClient.get(`/projects/${projectId}/assets?${params.toString()}`);
  if (!res.ok) throw new Error(`Failed to get assets (${res.status})`);
  return res.json() as Promise<Asset[]>;
}

/**
 * Hard-deletes an asset from the authenticated user's library.
 * Returns on 204 success. Backend rejects with 409 if any clip in any project
 * still references the file — caller must clear those references first.
 */
export async function deleteAsset(fileId: string): Promise<void> {
  const res = await apiClient.delete(`/assets/${fileId}`);
  if (res.status === 204) return;
  const body = await res.text();
  throw new Error(`Failed to delete asset (${res.status}): ${body}`);
}

/**
 * Restores a soft-deleted asset.
 * Maps to POST /assets/:id/restore. Resolves on 200; throws on error.
 */
export async function restoreAsset(fileId: string): Promise<void> {
  const res = await apiClient.post(`/assets/${fileId}/restore`, {});
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to restore asset (${res.status}): ${body}`);
  }
}

/** Update the display name of an asset. Returns the updated asset. */
export async function updateAsset(fileId: string, displayName: string): Promise<Asset> {
  const res = await apiClient.patch(`/assets/${fileId}`, { name: displayName });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to update asset (${res.status}): ${body}`);
  }
  return res.json() as Promise<Asset>;
}
