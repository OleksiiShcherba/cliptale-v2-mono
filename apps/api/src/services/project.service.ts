import { randomUUID } from 'node:crypto';

import * as projectRepository from '@/repositories/project.repository.js';
import type { ProjectSummary } from '@/repositories/project.repository.js';

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
