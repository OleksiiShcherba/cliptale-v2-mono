import { randomUUID } from 'node:crypto';

import * as projectRepository from '@/repositories/project.repository.js';
import type { ProjectSummary } from '@/repositories/project.repository.js';
import { NotFoundError } from '@/lib/errors.js';

export type { ProjectSummary };

export type CreateProjectResult = {
  projectId: string;
};

/**
 * Generates a new UUID, persists a project row with the given owner and optional title,
 * and returns the project ID.
 */
export async function createProject(
  userId: string,
  title?: string,
): Promise<CreateProjectResult> {
  const projectId = randomUUID();
  await projectRepository.createProject(projectId, userId, title);
  return { projectId };
}

/**
 * Returns all projects owned by the specified user, sorted by most-recently-updated.
 * Each project summary includes a derived thumbnailUrl from the earliest visual clip.
 */
export async function listForUser(userId: string): Promise<ProjectSummary[]> {
  return projectRepository.findProjectsByUserId(userId);
}

/**
 * Soft-deletes a project by setting `deleted_at`, verifying ownership first.
 *
 * EPIC B: introduces DELETE /projects/:id semantics (endpoint wired in B4).
 * The project is hidden from list views immediately. Restore is available
 * within 30 days via `project.restore.service.restoreProject`.
 *
 * ACL middleware at the route layer (B4) enforces the 'editor' role — this
 * service only enforces that the project exists and belongs to the caller.
 *
 * @throws NotFoundError when the project does not exist or belongs to another user.
 */
export async function softDeleteProject(userId: string, projectId: string): Promise<void> {
  const project = await projectRepository.findProjectById(projectId);
  if (!project || project.ownerUserId !== userId) {
    throw new NotFoundError(`Project "${projectId}" not found`);
  }
  // softDeleteProject is idempotent — no-op when already soft-deleted.
  await projectRepository.softDeleteProject(projectId);
}
