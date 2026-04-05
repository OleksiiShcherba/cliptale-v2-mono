import { randomUUID } from 'node:crypto';

import * as projectRepository from '@/repositories/project.repository.js';

export type CreateProjectResult = {
  projectId: string;
};

/**
 * Generates a new UUID, persists a project row, and returns the project ID.
 * Called when the editor opens without an existing project in the URL.
 */
export async function createProject(): Promise<CreateProjectResult> {
  const projectId = randomUUID();
  await projectRepository.createProject(projectId);
  return { projectId };
}
