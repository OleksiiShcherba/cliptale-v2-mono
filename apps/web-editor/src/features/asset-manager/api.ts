import { apiClient } from '@/lib/api-client';

import type { Asset, UploadUrlRequest, UploadUrlResponse } from './types';

/** Request a presigned PUT URL for a new asset upload. */
export async function requestUploadUrl(payload: UploadUrlRequest): Promise<UploadUrlResponse> {
  const res = await apiClient.post('/assets/upload-url', payload);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to request upload URL (${res.status}): ${body}`);
  }
  return res.json() as Promise<UploadUrlResponse>;
}

/** Trigger ingest processing for an already-uploaded asset. */
export async function finalizeAsset(assetId: string): Promise<Asset> {
  const res = await apiClient.post(`/assets/${assetId}/finalize`, {});
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to finalize asset (${res.status}): ${body}`);
  }
  return res.json() as Promise<Asset>;
}

/** Fetch a single asset by ID. */
export async function getAsset(assetId: string): Promise<Asset> {
  const res = await apiClient.get(`/assets/${assetId}`);
  if (!res.ok) throw new Error(`Failed to get asset (${res.status})`);
  return res.json() as Promise<Asset>;
}

/** Fetch all assets for a project. */
export async function getAssets(projectId: string): Promise<Asset[]> {
  const res = await apiClient.get(`/projects/${projectId}/assets`);
  if (!res.ok) throw new Error(`Failed to get assets (${res.status})`);
  return res.json() as Promise<Asset[]>;
}
