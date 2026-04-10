import { apiClient } from '@/lib/api-client';

import type {
  AiGenerationJob,
  AiGenerationRequest,
  AiGenerationSubmitResponse,
  ListModelsResponse,
} from './types';

/**
 * Fetch the unified AI model catalog grouped by capability.
 *
 * Hits `GET /ai/models`. The BE (aiGeneration.service.ts#listModels) returns
 * a `Record<AiCapability, AiModel[]>` covering fal.ai and ElevenLabs models,
 * so the shape matches `ListModelsResponse` exactly.
 */
export async function listModels(): Promise<ListModelsResponse> {
  const res = await apiClient.get('/ai/models');
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to list AI models (${res.status}): ${body}`);
  }
  return res.json() as Promise<ListModelsResponse>;
}

/**
 * Submit an AI generation request for a project.
 *
 * Posts the Ticket 6 contract: `{ modelId, prompt?, options }`. The BE merges
 * a top-level `prompt` into `options.prompt` when the selected model's schema
 * exposes a `prompt` field, so the FE never needs to duplicate it.
 */
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
