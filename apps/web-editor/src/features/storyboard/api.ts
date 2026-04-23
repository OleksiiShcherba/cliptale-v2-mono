/**
 * API calls for the storyboard feature.
 *
 * All HTTP calls go through `apiClient` — never call `fetch` directly.
 */

import { apiClient } from '@/lib/api-client';

import type { StoryboardState } from './types';

export type { StoryboardState };

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
