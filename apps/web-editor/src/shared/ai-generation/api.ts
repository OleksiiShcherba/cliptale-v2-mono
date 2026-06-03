import { apiClient } from '@/lib/api-client';

import type {
  AiGenerationContext,
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
 * Submit an AI generation request scoped to a project or generation draft.
 *
 * Posts the Ticket 6 contract: `{ modelId, prompt?, options }`. The BE merges
 * a top-level `prompt` into `options.prompt` when the selected model's schema
 * exposes a `prompt` field, so the FE never needs to duplicate it.
 *
 * Route selected by context:
 * - `{ kind: 'project', id }` → `POST /projects/:id/ai/generate`
 * - `{ kind: 'draft',   id }` → `POST /generation-drafts/:id/ai/generate`
 */
export async function submitGeneration(
  context: AiGenerationContext,
  request: AiGenerationRequest,
): Promise<AiGenerationSubmitResponse> {
  if (context.kind === 'library') {
    // The library context is an asset SOURCE only — it has no generate route.
    throw new Error('submitGeneration is not supported for the library context.');
  }
  const url =
    context.kind === 'project'
      ? `/projects/${context.id}/ai/generate`
      : `/generation-drafts/${context.id}/ai/generate`;
  const res = await apiClient.post(url, request);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to submit AI generation (${res.status}): ${body}`);
  }
  return res.json() as Promise<AiGenerationSubmitResponse>;
}

/**
 * Fetch assets for the given context.
 *
 * - `{ kind: 'project', id }` → `GET /projects/:id/assets`
 * - `{ kind: 'draft',   id }` → `GET /generation-drafts/:id/assets`
 * - `{ kind: 'library' }`     → `GET /files` (the Creator's whole general library)
 *
 * Replaces the former direct dependency on `@/features/asset-manager/api`
 * in `AssetPickerField`, satisfying §14 (no cross-feature imports in shared/).
 */
export async function getContextAssets(context: AiGenerationContext): Promise<AssetSummary[]> {
  if (context.kind === 'library') {
    return getLibraryAssets();
  }
  const url =
    context.kind === 'project'
      ? `/projects/${context.id}/assets`
      : `/generation-drafts/${context.id}/assets`;
  const res = await apiClient.get(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to get assets (${res.status}): ${body}`);
  }
  return res.json() as Promise<AssetSummary[]>;
}

/** One row of the general-library list (`GET /files`) — the fields the picker needs. */
type LibraryFileSummary = {
  id: string;
  mimeType: string | null;
  displayName: string | null;
  status: string;
};

/**
 * Lists the signed-in Creator's general library (`GET /files`, owner-scoped, ready
 * files only) and adapts each row to the picker's {@link AssetSummary} shape. Used
 * by surfaces with no project/draft scope (the generate-ai-flow content blocks).
 */
async function getLibraryAssets(): Promise<AssetSummary[]> {
  const res = await apiClient.get('/files');
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to get assets (${res.status}): ${body}`);
  }
  const data = (await res.json()) as { items: LibraryFileSummary[] };
  return data.items.map((f) => ({
    id: f.id,
    filename: f.displayName ?? f.id,
    contentType: f.mimeType ?? '',
    status: f.status,
  }));
}

/**
 * Minimal asset shape required by AssetPickerField.
 *
 * Both the project assets endpoint and the draft assets endpoint return objects
 * with at minimum these fields. The feature-specific `Asset` type from
 * `features/asset-manager/types` carries additional project-specific fields
 * (e.g. `projectId`) that are not relevant for picking.
 */
export type AssetSummary = {
  id: string;
  filename: string;
  contentType: string;
  status: string;
};

type AiGenerationJobResponse = Omit<AiGenerationJob, 'resultAssetId'> & {
  resultAssetId?: string | null;
  outputFileId?: string | null;
};

/** Fetch the current status snapshot of an AI generation job. */
export async function getJobStatus(jobId: string): Promise<AiGenerationJob> {
  const res = await apiClient.get(`/ai/jobs/${jobId}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to get job status (${res.status}): ${body}`);
  }
  const data = await res.json() as AiGenerationJobResponse;
  return {
    jobId: data.jobId,
    status: data.status,
    progress: data.progress,
    resultAssetId: data.resultAssetId ?? data.outputFileId ?? null,
    errorMessage: data.errorMessage,
  };
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
