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

/** Update the display name of an asset. Returns the updated asset. */
export async function updateAsset(fileId: string, displayName: string): Promise<Asset> {
  const res = await apiClient.patch(`/assets/${fileId}`, { name: displayName });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to update asset (${res.status}): ${body}`);
  }
  return res.json() as Promise<Asset>;
}
