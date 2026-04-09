import { apiClient } from '@/lib/api-client';

import type { AiGenerationRequest, AiGenerationSubmitResponse, AiGenerationJob } from './types';

/** Submit an AI generation request for a project. */
export async function submitGeneration(
  projectId: string,
  request: AiGenerationRequest,
): Promise<AiGenerationSubmitResponse> {
  const res = await apiClient.post(`/projects/${projectId}/ai/generate`, request);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to submit AI generation (${res.status}): ${body}`);
  }
  return res.json() as Promise<AiGenerationSubmitResponse>;
}

/** Poll the status of an AI generation job. */
export async function getJobStatus(jobId: string): Promise<AiGenerationJob> {
  const res = await apiClient.get(`/ai/jobs/${jobId}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to get job status (${res.status}): ${body}`);
  }
  return res.json() as Promise<AiGenerationJob>;
}
