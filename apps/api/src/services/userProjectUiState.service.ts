/**
 * Service for the user_project_ui_state feature.
 *
 * Thin wrapper around the repository. Responsibility:
 * - Validate the project exists before reading/writing its UI state.
 * - Throw typed errors (`NotFoundError`) when the project is absent.
 *
 * All SQL lives in the repository. ACL enforcement lives in middleware.
 * This service intentionally stays free of HTTP concerns.
 */

import { NotFoundError } from '@/lib/errors.js';
import * as uiStateRepository from '@/repositories/userProjectUiState.repository.js';
import * as projectRepository from '@/repositories/project.repository.js';

/** Shape returned by GET /projects/:id/ui-state. */
export type UiStateResponse = {
  state: unknown;
  updatedAt: string | null;
};

/**
 * Returns the persisted UI state for the given (userId, projectId) pair.
 *
 * Returns `{ state: null, updatedAt: null }` when no row exists yet (first
 * visit to the project). Throws `NotFoundError` when the project itself does
 * not exist.
 */
export async function getUiState(
  userId: string,
  projectId: string,
): Promise<UiStateResponse> {
  const project = await projectRepository.findProjectById(projectId);
  if (!project) {
    throw new NotFoundError(`Project ${projectId} not found`);
  }

  const row = await uiStateRepository.getByUserAndProject(userId, projectId);
  if (!row) {
    return { state: null, updatedAt: null };
  }

  return {
    state: row.state,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Upserts the UI state for the given (userId, projectId) pair.
 *
 * The `state` value is opaque — the service does not inspect or transform it;
 * the shape belongs entirely to the web-editor. Throws `NotFoundError` when the
 * project does not exist.
 */
export async function saveUiState(
  userId: string,
  projectId: string,
  state: unknown,
): Promise<void> {
  const project = await projectRepository.findProjectById(projectId);
  if (!project) {
    throw new NotFoundError(`Project ${projectId} not found`);
  }

  await uiStateRepository.upsertByUserAndProject(userId, projectId, state);
}
