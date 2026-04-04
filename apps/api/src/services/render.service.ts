import { randomUUID } from 'node:crypto';

import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import type { RenderPreset, RenderPresetKey } from '@ai-video-editor/project-schema';

import { NotFoundError, ValidationError, ConflictError } from '@/lib/errors.js';
import { s3Client } from '@/lib/s3.js';
import { config } from '@/config.js';
import { pool } from '@/db/connection.js';
import * as renderRepository from '@/repositories/render.repository.js';
import type { RenderJob, RenderJobSummary } from '@/repositories/render.repository.js';
import * as versionRepository from '@/repositories/version.repository.js';
import { enqueueRenderJob } from '@/queues/jobs/enqueue-render.js';

/** Maximum number of queued or processing render jobs a single user may have at once. */
const MAX_CONCURRENT_JOBS_PER_USER = 2;

/** How many seconds the presigned download URL remains valid. */
const DOWNLOAD_URL_EXPIRY_SECONDS = 3600;

/**
 * Allowed render presets — validated server-side before the job row is created.
 * Keys match RenderPresetKey; values hold the resolved codec + dimensions.
 */
export const ALLOWED_PRESETS: Record<RenderPresetKey, RenderPreset> = {
  '1080p': { key: '1080p', width: 1920, height: 1080, fps: 30, format: 'mp4', codec: 'h264' },
  '4k': { key: '4k', width: 3840, height: 2160, fps: 30, format: 'mp4', codec: 'h264' },
  '720p': { key: '720p', width: 1280, height: 720, fps: 30, format: 'mp4', codec: 'h264' },
  vertical: { key: 'vertical', width: 1080, height: 1920, fps: 30, format: 'mp4', codec: 'h264' },
  square: { key: 'square', width: 1080, height: 1080, fps: 30, format: 'mp4', codec: 'h264' },
  webm: { key: 'webm', width: 1920, height: 1080, fps: 30, format: 'webm', codec: 'vp8' },
};

/** Parameters for creating a new render job. */
export type CreateRenderParams = {
  projectId: string;
  versionId: number;
  requestedBy: string | null;
  presetKey: string;
};

/** Result returned after a render job is created. */
export type CreateRenderResult = {
  jobId: string;
  status: 'queued';
};

/**
 * Validates the preset, enforces the per-user concurrency limit, verifies the
 * version belongs to the project, creates a `render_jobs` row, and enqueues the
 * BullMQ job.
 *
 * Throws:
 * - `ValidationError` (400) when the preset key is not in ALLOWED_PRESETS.
 * - `NotFoundError` (404) when the versionId does not belong to the project.
 * - `ConflictError` (409) when the user already has MAX_CONCURRENT_JOBS_PER_USER active jobs.
 */
export async function createRender(params: CreateRenderParams): Promise<CreateRenderResult> {
  const preset = ALLOWED_PRESETS[params.presetKey as RenderPresetKey];
  if (!preset) {
    const allowed = Object.keys(ALLOWED_PRESETS).join(', ');
    throw new ValidationError(
      `Invalid preset "${params.presetKey}". Allowed values: ${allowed}.`,
    );
  }

  // Verify the version exists and belongs to this project.
  const version = await versionRepository.getVersionById(params.projectId, params.versionId);
  if (!version) {
    throw new NotFoundError(
      `Version ${params.versionId} not found for project "${params.projectId}"`,
    );
  }

  // Enforce the per-user concurrency limit (skip for anonymous renders).
  if (params.requestedBy !== null) {
    const activeCount = await renderRepository.countActiveJobsByUser(params.requestedBy);
    if (activeCount >= MAX_CONCURRENT_JOBS_PER_USER) {
      throw new ConflictError(
        `You already have ${activeCount} active render job(s). ` +
          `Maximum concurrent renders per user is ${MAX_CONCURRENT_JOBS_PER_USER}.`,
      );
    }
  }

  const jobId = randomUUID();

  await renderRepository.insertRenderJob({
    jobId,
    projectId: params.projectId,
    versionId: params.versionId,
    requestedBy: params.requestedBy,
    preset,
  });

  await enqueueRenderJob({
    jobId,
    projectId: params.projectId,
    versionId: params.versionId,
    requestedBy: params.requestedBy,
    preset,
  });

  // Write the audit log entry as a fire-and-forget side effect — a failure
  // here must not fail the render creation response.
  void writeRenderRequestedAudit(params.projectId, params.requestedBy);

  return { jobId, status: 'queued' };
}

/** Result for a render status query. */
export type GetRenderStatusResult = RenderJob & {
  /** Presigned S3 download URL — only present when status is 'complete'. */
  downloadUrl?: string;
};

/**
 * Returns the current status of a render job, including a presigned download URL
 * when the job is complete.
 *
 * Throws `NotFoundError` (404) when the job does not exist.
 */
export async function getRenderStatus(jobId: string): Promise<GetRenderStatusResult> {
  const job = await renderRepository.getRenderJobById(jobId);
  if (!job) {
    throw new NotFoundError(`Render job "${jobId}" not found`);
  }

  if (job.status === 'complete' && job.outputUri) {
    // Strip the leading "s3://<bucket>/" from the stored URI to get the object key.
    const key = extractS3Key(job.outputUri);
    const downloadUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({ Bucket: config.s3.bucket, Key: key }),
      { expiresIn: DOWNLOAD_URL_EXPIRY_SECONDS },
    );
    return { ...job, downloadUrl };
  }

  return job;
}

/**
 * Returns all render jobs for a project, newest first.
 * Throws `nothing` — returns an empty array when no jobs exist.
 */
export async function listProjectRenders(projectId: string): Promise<RenderJobSummary[]> {
  return renderRepository.listRenderJobsByProject(projectId);
}

/**
 * Extracts the S3 object key from a URI of the form `s3://<bucket>/<key>`.
 * Falls back to using the full URI as the key if the prefix is not present.
 */
function extractS3Key(uri: string): string {
  const prefix = `s3://${config.s3.bucket}/`;
  return uri.startsWith(prefix) ? uri.slice(prefix.length) : uri;
}

/**
 * Appends a `render.requested` entry to the project audit log.
 * Silently suppresses errors — audit logging is non-critical.
 */
async function writeRenderRequestedAudit(
  projectId: string,
  userId: string | null,
): Promise<void> {
  try {
    await pool.execute(
      `INSERT INTO project_audit_log (project_id, event_type, user_id)
       VALUES (?, 'render.requested', ?)`,
      [projectId, userId],
    );
  } catch (err) {
    console.error('[render.service] Failed to write render.requested audit log:', err);
  }
}
