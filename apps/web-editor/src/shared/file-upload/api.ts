import { apiClient } from '@/lib/api-client';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Payload for POST /files/upload-url. */
type RequestUploadUrlPayload = {
  filename: string;
  /** MIME type of the file — validated server-side against an allowlist. */
  mimeType: string;
  fileSizeBytes: number;
};

/** Response from POST /files/upload-url. */
type UploadUrlResponse = {
  fileId: string;
  uploadUrl: string;
  /** ISO timestamp after which the presigned URL must be re-requested. */
  expiresAt: string;
};

// ── API functions ─────────────────────────────────────────────────────────────

/**
 * Request a presigned S3 PUT URL and create a pending row in `files`.
 * Corresponds to POST /files/upload-url (Batch 1 endpoint).
 */
export async function requestUploadUrl(
  payload: RequestUploadUrlPayload,
): Promise<UploadUrlResponse> {
  const res = await apiClient.post('/files/upload-url', payload);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to request upload URL (${res.status}): ${body}`);
  }
  return res.json() as Promise<UploadUrlResponse>;
}

/**
 * Confirm the S3 PUT completed. Transitions the file from `pending` → `processing`
 * and enqueues the media-ingest job.
 * Corresponds to POST /files/:id/finalize (Batch 1 endpoint).
 */
export async function finalizeFile(fileId: string): Promise<void> {
  const res = await apiClient.post(`/files/${fileId}/finalize`, {});
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to finalize file (${res.status}): ${body}`);
  }
}

/**
 * Link a file to a project after upload.
 * Corresponds to POST /projects/:projectId/files (Batch 1 endpoint).
 */
export async function linkFileToProject(projectId: string, fileId: string): Promise<void> {
  const res = await apiClient.post(`/projects/${projectId}/files`, { fileId });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to link file to project (${res.status}): ${body}`);
  }
}

/**
 * Link a file to a generation draft after upload.
 * Corresponds to POST /generation-drafts/:draftId/files (Batch 1 endpoint).
 */
export async function linkFileToDraft(draftId: string, fileId: string): Promise<void> {
  const res = await apiClient.post(`/generation-drafts/${draftId}/files`, { fileId });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to link file to draft (${res.status}): ${body}`);
  }
}
