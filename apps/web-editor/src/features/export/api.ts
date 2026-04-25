import { apiClient } from '@/lib/api-client';
import type {
  CreateRenderResponse,
  RenderJob,
  ListRendersResponse,
  RenderPresetKey,
} from './types';

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/** User-facing message shown when the concurrent render limit is reached. */
export const CONCURRENT_RENDER_LIMIT_MESSAGE =
  'You can only have 2 exports running at once. Please wait for one to finish before starting another.';

/**
 * Submits a new render job for the given project version and preset.
 * Returns the new job's ID and initial status ('queued').
 *
 * Throws a user-friendly error when the user has reached the concurrent render limit (409).
 * Throws a generic error for other failure statuses (400, 500, etc.).
 */
export async function createRender(
  projectId: string,
  versionId: number,
  presetKey: RenderPresetKey,
): Promise<CreateRenderResponse> {
  const res = await apiClient.post(`/projects/${projectId}/renders`, {
    versionId,
    presetKey,
  });

  if (res.status === 409) {
    throw new Error(CONCURRENT_RENDER_LIMIT_MESSAGE);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to start render (${res.status}): ${body}`);
  }

  return res.json() as Promise<CreateRenderResponse>;
}

/**
 * Fetches the current status of a render job.
 * When complete, the response includes a `downloadUrl` presigned URL.
 */
export async function getRenderStatus(jobId: string): Promise<RenderJob> {
  const res = await apiClient.get(`/renders/${jobId}`);

  if (res.status === 404) {
    throw new Error(`Render job ${jobId} not found`);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to fetch render status (${res.status}): ${body}`);
  }

  return res.json() as Promise<RenderJob>;
}

/**
 * Fetches all render jobs for a project, newest first.
 */
export async function listRenders(projectId: string): Promise<RenderJob[]> {
  const res = await apiClient.get(`/projects/${projectId}/renders`);

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to list renders (${res.status}): ${body}`);
  }

  const data = (await res.json()) as ListRendersResponse;
  return data.renders;
}
