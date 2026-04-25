/**
 * Restore service for projects.
 *
 * Provides `restoreProject` — reverses a project soft-delete within the 30-day
 * TTL window. Throws GoneError (410) if the row is gone or the TTL has elapsed.
 */
import * as projectRepository from '@/repositories/project.repository.js';
import type { ProjectRecord } from '@/repositories/project.repository.js';
import { GoneError, NotFoundError } from '@/lib/errors.js';

/** Restore TTL — 30 days in milliseconds. */
const RESTORE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Restores a soft-deleted project, verifying ownership.
 *
 * - Row does not exist → GoneError (410).
 * - Row belongs to another user → NotFoundError (404).
 * - `deleted_at` older than 30 days → GoneError (410).
 * - `deleted_at` is null (already active) → returns the project unchanged (idempotent).
 *
 * ACL middleware enforcing the 'editor' role will be applied at the route layer (B4).
 * This service only enforces ownership semantics.
 *
 * @throws GoneError when the project is permanently gone or beyond the TTL.
 * @throws NotFoundError when the project exists but belongs to another user.
 */
export async function restoreProject(
  userId: string,
  projectId: string,
): Promise<ProjectRecord> {
  const project = await projectRepository.findProjectByIdIncludingDeleted(projectId);

  if (!project) {
    throw new GoneError(
      `Project "${projectId}" has been permanently removed and cannot be restored`,
    );
  }

  if (project.ownerUserId !== userId) {
    throw new NotFoundError(`Project "${projectId}" not found`);
  }

  if (project.deletedAt === null) {
    // Already active — idempotent restore.
    return project;
  }

  const age = Date.now() - project.deletedAt.getTime();
  if (age > RESTORE_TTL_MS) {
    throw new GoneError(
      `Project "${projectId}" was deleted more than 30 days ago and cannot be restored`,
    );
  }

  await projectRepository.restoreProject(projectId);

  return { ...project, deletedAt: null };
}
