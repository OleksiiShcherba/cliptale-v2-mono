import { apiClient } from '@/lib/api-client';

import type {
  AiGenerationJob,
  AiGenerationRequest,
  AiGenerationSubmitResponse,
  ElevenLabsVoice,
  ListModelsResponse,
  UserVoice,
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

/**
 * Fetch all ElevenLabs library voices (Redis-cached on the server, 1hr TTL).
 *
 * Hits `GET /ai/voices/available`.
 */
export async function listAvailableVoices(): Promise<ElevenLabsVoice[]> {
  const res = await apiClient.get('/ai/voices/available');
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to list available voices (${res.status}): ${body}`);
  }
  return res.json() as Promise<ElevenLabsVoice[]>;
}

/**
 * Fetch the authenticated user's cloned voice library.
 *
 * Hits `GET /ai/voices`.
 */
export async function listUserVoices(): Promise<UserVoice[]> {
  const res = await apiClient.get('/ai/voices');
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to list user voices (${res.status}): ${body}`);
  }
  return res.json() as Promise<UserVoice[]>;
}

/**
 * Fetch a presigned S3 URL for a voice audio sample.
 *
 * Hits `GET /ai/voices/:voiceId/sample?previewUrl=...`.
 * The server proxies the ElevenLabs CDN URL through S3 to avoid CORS issues.
 *
 * @param voiceId    - ElevenLabs voice_id.
 * @param previewUrl - ElevenLabs CDN preview URL (forwarded to the server for caching).
 * @returns Presigned S3 URL to the sample MP3.
 */
export async function getVoiceSampleUrl(voiceId: string, previewUrl: string): Promise<string> {
  const encoded = encodeURIComponent(previewUrl);
  const res = await apiClient.get(`/ai/voices/${encodeURIComponent(voiceId)}/sample?previewUrl=${encoded}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to get voice sample URL (${res.status}): ${body}`);
  }
  const data = (await res.json()) as { url: string };
  return data.url;
}
