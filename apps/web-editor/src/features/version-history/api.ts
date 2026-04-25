import { apiClient } from '@/lib/api-client';
import type { ProjectDoc } from '@ai-video-editor/project-schema';
import type { Patch } from 'immer';

// ---------------------------------------------------------------------------
// Request / Response types
// ---------------------------------------------------------------------------

export type SaveVersionRequest = {
  docJson: ProjectDoc;
  docSchemaVersion: number;
  patches: Patch[];
  inversePatches: Patch[];
  parentVersionId: number | null;
};

export type SaveVersionResponse = {
  versionId: number;
  createdAt: string;
};

export type VersionSummary = {
  versionId: number;
  createdAt: string;
  createdByUserId: string | null;
  durationFrames: number | null;
};

export type RestoreVersionResponse = {
  docJson: ProjectDoc;
};

export type LatestVersionResponse = {
  versionId: number;
  docJson: ProjectDoc;
  createdAt: string;
};

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/**
 * Fetches the latest saved version for a project.
 * Returns `{ versionId, docJson, createdAt }` on success.
 * Throws an error with `status: 404` when the project has no versions yet,
 * so the caller can fall through to the blank-project seed.
 */
export async function fetchLatestVersion(projectId: string): Promise<LatestVersionResponse> {
  const res = await apiClient.get(`/projects/${projectId}/versions/latest`);

  if (res.status === 404) {
    const err = new Error('No versions found for this project');
    (err as Error & { status: number }).status = 404;
    throw err;
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to fetch latest version (${res.status}): ${body}`);
  }

  return res.json() as Promise<LatestVersionResponse>;
}

/**
 * POSTs a new version snapshot to the versions endpoint.
 *
 * Throws a `ConflictError`-shaped error (with `status: 409`) when the server
 * rejects the save due to an optimistic lock conflict, so the caller can
 * distinguish it from general failures.
 */
export async function saveVersion(
  projectId: string,
  payload: SaveVersionRequest,
): Promise<SaveVersionResponse> {
  const res = await apiClient.post(`/projects/${projectId}/versions`, payload);

  if (res.status === 409) {
    const err = new Error('Version conflict — another save has superseded this one');
    (err as Error & { status: number }).status = 409;
    throw err;
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to save version (${res.status}): ${body}`);
  }

  return res.json() as Promise<SaveVersionResponse>;
}

/**
 * Fetches the last 50 versions for a project, newest-first.
 */
export async function listVersions(projectId: string): Promise<VersionSummary[]> {
  const res = await apiClient.get(`/projects/${projectId}/versions`);

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to list versions (${res.status}): ${body}`);
  }

  return res.json() as Promise<VersionSummary[]>;
}

/**
 * Restores a specific version by ID.
 * Returns the full `ProjectDoc` at that version.
 */
export async function restoreVersion(
  projectId: string,
  versionId: number,
): Promise<RestoreVersionResponse> {
  const res = await apiClient.post(
    `/projects/${projectId}/versions/${versionId}/restore`,
    {},
  );

  if (res.status === 404) {
    throw new Error(`Version ${versionId} not found`);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to restore version (${res.status}): ${body}`);
  }

  return res.json() as Promise<RestoreVersionResponse>;
}
