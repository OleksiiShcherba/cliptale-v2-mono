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
