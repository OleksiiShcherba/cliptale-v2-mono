import { apiClient } from '@/lib/api-client';

export type CreateProjectResponse = {
  projectId: string;
};

/** Creates a new empty project on the API and returns its UUID. */
export async function createProject(): Promise<CreateProjectResponse> {
  const res = await apiClient.post('/projects', {});
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to create project (${res.status}): ${body}`);
  }
  return res.json() as Promise<CreateProjectResponse>;
}

/** Shape of the GET /projects/:id/ui-state response body. */
export type GetUiStateResponse = {
  state: unknown;
  updatedAt: string | null;
};

/**
 * Fetches the persisted UI state for a project.
 * Returns `{ state: null, updatedAt: null }` when no state has been saved yet.
 */
export async function getUiState(projectId: string): Promise<GetUiStateResponse> {
  const res = await apiClient.get(`/projects/${projectId}/ui-state`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to fetch UI state (${res.status}): ${body}`);
  }
  return res.json() as Promise<GetUiStateResponse>;
}

/**
 * Persists the UI state for a project (upsert).
 * The server expects `{ state: <opaque> }` and responds with 204 No Content.
 */
export async function putUiState(projectId: string, state: unknown): Promise<void> {
  const res = await apiClient.put(`/projects/${projectId}/ui-state`, { state });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to save UI state (${res.status}): ${body}`);
  }
}
