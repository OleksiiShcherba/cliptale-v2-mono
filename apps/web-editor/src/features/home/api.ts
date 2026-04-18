/**
 * API helpers for the home hub feature.
 *
 * All HTTP calls go through `apiClient` — never call fetch directly.
 */

import { apiClient } from '@/lib/api-client';

import type { ProjectSummary } from './types';

/** Shape returned by GET /projects */
type ListProjectsResponse = {
  items: ProjectSummary[];
};

/** Shape returned by POST /projects */
type CreateProjectResponse = {
  projectId: string;
};

/**
 * Fetches the list of projects for the authenticated user.
 * Maps to GET /projects.
 */
export async function listProjects(): Promise<ProjectSummary[]> {
  const res = await apiClient.get('/projects');
  if (!res.ok) {
    throw new Error(`GET /projects failed: ${res.status}`);
  }
  const data = (await res.json()) as ListProjectsResponse;
  return data.items;
}

/**
 * Creates a new project for the authenticated user.
 * Maps to POST /projects.
 * Returns the new projectId.
 */
export async function createProject(title?: string): Promise<string> {
  const body: Record<string, string> = {};
  if (title != null) {
    body['title'] = title;
  }
  const res = await apiClient.post('/projects', body);
  if (!res.ok) {
    throw new Error(`POST /projects failed: ${res.status}`);
  }
  const data = (await res.json()) as CreateProjectResponse;
  return data.projectId;
}

import type { StoryboardCardSummary } from './types';

/** Shape returned by GET /generation-drafts/cards */
type ListStoryboardCardsResponse = {
  items: StoryboardCardSummary[];
};

/**
 * Fetches the storyboard card list for the authenticated user.
 * Maps to GET /generation-drafts/cards.
 */
export async function listStoryboardCards(): Promise<StoryboardCardSummary[]> {
  const res = await apiClient.get('/generation-drafts/cards');
  if (!res.ok) {
    throw new Error(`GET /generation-drafts/cards failed: ${res.status}`);
  }
  const data = (await res.json()) as ListStoryboardCardsResponse;
  return data.items;
}
