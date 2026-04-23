/**
 * API calls for the storyboard feature.
 *
 * All HTTP calls go through `apiClient` — never call `fetch` directly.
 */

import { apiClient } from '@/lib/api-client';

import type {
  StoryboardBlock,
  StoryboardState,
  SceneTemplate,
  CreateSceneTemplatePayload,
  UpdateSceneTemplatePayload,
} from './types';

export type { StoryboardState, SceneTemplate, CreateSceneTemplatePayload, UpdateSceneTemplatePayload };

/**
 * Seeds START and END sentinel blocks when they do not yet exist (idempotent).
 *
 * Maps to POST /storyboards/:draftId/initialize.
 * Called on page load before fetching the full state.
 */
export async function initializeStoryboard(draftId: string): Promise<StoryboardState> {
  const res = await apiClient.post(`/storyboards/${draftId}/initialize`, {});
  if (!res.ok) {
    throw new Error(`POST /storyboards/${draftId}/initialize failed: ${res.status}`);
  }
  return res.json() as Promise<StoryboardState>;
}

/**
 * Fetches the current storyboard state (blocks + edges) for a generation draft.
 *
 * Maps to GET /storyboards/:draftId.
 * Used to hydrate the canvas on page load after initialize.
 */
export async function fetchStoryboard(draftId: string): Promise<StoryboardState> {
  const res = await apiClient.get(`/storyboards/${draftId}`);
  if (!res.ok) {
    throw new Error(`GET /storyboards/${draftId} failed: ${res.status}`);
  }
  return res.json() as Promise<StoryboardState>;
}

/**
 * Persists the full storyboard state to the server.
 *
 * Maps to PUT /storyboards/:draftId.
 * Called by the autosave hook after the 30s debounce expires.
 */
export async function saveStoryboard(
  draftId: string,
  state: StoryboardState,
): Promise<void> {
  const res = await apiClient.put(`/storyboards/${draftId}`, state);
  if (!res.ok) {
    throw new Error(`PUT /storyboards/${draftId} failed: ${res.status}`);
  }
}

/** Shape of a single history snapshot sent to / received from the server. */
export type StoryboardHistorySnapshot = {
  snapshot: StoryboardState;
  createdAt: string;
};

/**
 * Persists a history snapshot to the server (fire-and-forget).
 *
 * Maps to POST /storyboards/:draftId/history.
 * Failures are logged but not surfaced to the user.
 */
export async function persistHistorySnapshot(
  draftId: string,
  snapshot: StoryboardState,
): Promise<void> {
  const res = await apiClient.post(`/storyboards/${draftId}/history`, { snapshot });
  if (!res.ok) {
    throw new Error(`POST /storyboards/${draftId}/history failed: ${res.status}`);
  }
}

/**
 * Loads server-persisted history snapshots on mount.
 *
 * Maps to GET /storyboards/:draftId/history.
 * Returns snapshots in ascending chronological order (oldest first).
 */
export async function fetchHistorySnapshots(
  draftId: string,
): Promise<StoryboardHistorySnapshot[]> {
  const res = await apiClient.get(`/storyboards/${draftId}/history`);
  if (!res.ok) {
    throw new Error(`GET /storyboards/${draftId}/history failed: ${res.status}`);
  }
  return res.json() as Promise<StoryboardHistorySnapshot[]>;
}

// ── Scene Template API functions ───────────────────────────────────────────────

/**
 * Retrieves all scene templates owned by the authenticated user.
 *
 * Maps to GET /scene-templates.
 * Accepts an optional search string to filter by name/prompt.
 */
export async function listSceneTemplates(search?: string): Promise<{ items: SceneTemplate[] }> {
  const path = search
    ? `/scene-templates?search=${encodeURIComponent(search)}`
    : '/scene-templates';
  const res = await apiClient.get(path);
  if (!res.ok) {
    throw new Error(`GET /scene-templates failed: ${res.status}`);
  }
  return res.json() as Promise<{ items: SceneTemplate[] }>;
}

/**
 * Creates a new scene template.
 *
 * Maps to POST /scene-templates.
 * Returns 201 with the full template on success.
 */
export async function createSceneTemplate(
  payload: CreateSceneTemplatePayload,
): Promise<SceneTemplate> {
  const res = await apiClient.post('/scene-templates', payload);
  if (!res.ok) {
    throw new Error(`POST /scene-templates failed: ${res.status}`);
  }
  return res.json() as Promise<SceneTemplate>;
}

/**
 * Retrieves a single scene template by ID.
 *
 * Maps to GET /scene-templates/:id.
 * Returns 404 if the template does not exist or is not owned by the user.
 */
export async function getSceneTemplate(id: string): Promise<SceneTemplate> {
  const res = await apiClient.get(`/scene-templates/${id}`);
  if (!res.ok) {
    throw new Error(`GET /scene-templates/${id} failed: ${res.status}`);
  }
  return res.json() as Promise<SceneTemplate>;
}

/**
 * Updates an existing scene template.
 *
 * Maps to PUT /scene-templates/:id.
 * Replaces media list atomically when `media` is provided.
 */
export async function updateSceneTemplate(
  id: string,
  payload: UpdateSceneTemplatePayload,
): Promise<SceneTemplate> {
  const res = await apiClient.put(`/scene-templates/${id}`, payload);
  if (!res.ok) {
    throw new Error(`PUT /scene-templates/${id} failed: ${res.status}`);
  }
  return res.json() as Promise<SceneTemplate>;
}

/**
 * Soft-deletes a scene template.
 *
 * Maps to DELETE /scene-templates/:id.
 * Sets `deleted_at` on the server; the template is excluded from list queries.
 */
export async function deleteSceneTemplate(id: string): Promise<void> {
  const res = await apiClient.delete(`/scene-templates/${id}`);
  if (!res.ok) {
    throw new Error(`DELETE /scene-templates/${id} failed: ${res.status}`);
  }
}

/**
 * Creates a new storyboard block from a scene template.
 *
 * Maps to POST /scene-templates/:id/add-to-storyboard.
 * Requires the user to own both the template and the draft.
 * Returns the newly created StoryboardBlock.
 */
export async function addTemplateToStoryboard(params: {
  templateId: string;
  draftId: string;
}): Promise<StoryboardBlock> {
  const res = await apiClient.post(
    `/scene-templates/${params.templateId}/add-to-storyboard`,
    { draftId: params.draftId },
  );
  if (!res.ok) {
    throw new Error(
      `POST /scene-templates/${params.templateId}/add-to-storyboard failed: ${res.status}`,
    );
  }
  return res.json() as Promise<StoryboardBlock>;
}
