import { apiClient } from '@/lib/api-client';

import type { Asset } from './types';

/** Fetch a single asset by ID. */
export async function getAsset(fileId: string): Promise<Asset> {
  const res = await apiClient.get(`/assets/${fileId}`);
  if (!res.ok) throw new Error(`Failed to get asset (${res.status})`);
  return res.json() as Promise<Asset>;
}

/** Fetch all assets for a project. */
export async function getAssets(projectId: string): Promise<Asset[]> {
  const res = await apiClient.get(`/projects/${projectId}/assets`);
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

/** Update the display name of an asset. Returns the updated asset. */
export async function updateAsset(fileId: string, displayName: string): Promise<Asset> {
  const res = await apiClient.patch(`/assets/${fileId}`, { name: displayName });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to update asset (${res.status}): ${body}`);
  }
  return res.json() as Promise<Asset>;
}
