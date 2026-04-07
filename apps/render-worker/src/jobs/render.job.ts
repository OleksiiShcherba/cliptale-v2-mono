import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';

import type { Job } from 'bullmq';
import { GetObjectCommand, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Pool } from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2/promise';

import type { RenderVideoJobPayload, ProjectDoc } from '@ai-video-editor/project-schema';

import { config } from '@/config.js';
import { renderComposition } from '@/lib/remotion-renderer.js';

/** Composition ID registered in remotion-comps package. */
const COMPOSITION_ID = 'VideoComposition';

/**
 * Progress reporting interval — only report to DB when progress crosses a
 * 5-percentage-point boundary to avoid flooding DB with updates at 60fps.
 */
const PROGRESS_REPORT_STEP_PCT = 5;

/** Injected dependencies for processRenderJob — enables testing without real S3/DB/Remotion. */
export type RenderJobDeps = {
  s3: S3Client;
  pool: Pool;
};

/**
 * BullMQ job handler for `render` jobs.
 *
 * 1. Sets job status to `processing`.
 * 2. Fetches the `doc_json` from `project_versions` for the locked version_id.
 * 3. Calls Remotion `bundle()` + `renderMedia()` via the remotion-renderer wrapper.
 * 4. Reports progress to `render_jobs.progress_pct` every 5% via DB.
 * 5. Uploads the rendered file to S3 under `renders/<jobId>.<ext>`.
 * 6. Sets job status to `complete` with the `output_uri`.
 *
 * On failure: sets status to `failed` with the error message, then re-throws
 * so BullMQ retries the job per the configured `attempts` (max 3 total).
 */
export async function processRenderJob(
  job: Job<RenderVideoJobPayload>,
  deps: RenderJobDeps,
): Promise<void> {
  const { jobId, projectId, versionId, preset } = job.data;
  const { s3, pool } = deps;

  // Mark job as processing.
  await updateJobStatus(pool, jobId, 'processing', 0);

  let tmpDir: string | null = null;

  try {
    // Fetch the version snapshot from the DB.
    const docJson = await fetchDocJson(pool, projectId, versionId);
    const doc = docJson as ProjectDoc;

    // Resolve presigned S3 URLs for every asset referenced by clips.
    const assetUrls = await resolveAssetUrls(pool, s3, doc);

    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `render-${jobId}-`));
    const ext = preset.format === 'webm' ? 'webm' : 'mp4';
    const outputPath = path.join(tmpDir, `output.${ext}`);

    // Track the last reported progress to avoid redundant DB writes.
    let lastReportedPct = 0;

    await renderComposition({
      compositionId: COMPOSITION_ID,
      doc,
      preset,
      outputPath,
      assetUrls,
      onProgress: async (progress) => {
        const pct = Math.floor(progress * 100);
        // Only write to DB when crossing a PROGRESS_REPORT_STEP_PCT boundary.
        if (pct - lastReportedPct >= PROGRESS_REPORT_STEP_PCT) {
          lastReportedPct = pct;
          await updateJobStatus(pool, jobId, 'processing', pct).catch((err) => {
            // Non-fatal: progress update failure must not abort the render.
            console.error(`[render.job] Progress update failed for ${jobId}:`, err);
          });
        }
      },
    });

    // Upload to S3.
    const s3Key = `renders/${jobId}.${ext}`;
    await uploadRenderedFile(s3, s3Key, outputPath, ext === 'webm' ? 'video/webm' : 'video/mp4');

    const outputUri = `s3://${config.s3.bucket}/${s3Key}`;

    await completeJob(pool, jobId, outputUri);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown render error';
    await failJob(pool, jobId, message).catch((dbErr) => {
      console.error(`[render.job] Failed to mark job ${jobId} as failed:`, dbErr);
    });
    throw err; // Re-throw so BullMQ retries per job.attempts.
  } finally {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch((err) => {
        console.error(`[render.job] Failed to clean up tmpDir ${tmpDir}:`, err);
      });
    }
  }
}

// ── Asset URL resolution ─────────────────────────────────────────────────────

/** Presigned URL expiry — generous because renders can take minutes. */
const ASSET_URL_EXPIRY_SECONDS = 3600;

/**
 * Extracts every unique assetId from the project clips, looks up their
 * `storage_uri` in `project_assets_current`, and generates a presigned S3 GET
 * URL for each.  Returns a map from assetId → presigned URL that the Remotion
 * composition uses to load media files.
 */
async function resolveAssetUrls(
  pool: Pool,
  s3: S3Client,
  doc: ProjectDoc,
): Promise<Record<string, string>> {
  const assetIds = [
    ...new Set(
      doc.clips
        .filter((c): c is { assetId: string } & typeof c => 'assetId' in c)
        .map((c) => c.assetId),
    ),
  ];

  if (assetIds.length === 0) return {};

  // Fetch storage URIs for all referenced assets in one query.
  const placeholders = assetIds.map(() => '?').join(',');
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT asset_id, storage_uri FROM project_assets_current WHERE asset_id IN (${placeholders})`,
    assetIds,
  );

  const uriByAssetId = new Map<string, string>();
  for (const row of rows) {
    uriByAssetId.set(row['asset_id'] as string, row['storage_uri'] as string);
  }

  // Generate presigned URLs in parallel.
  const entries = await Promise.all(
    assetIds
      .filter((id) => uriByAssetId.has(id))
      .map(async (assetId) => {
        const storageUri = uriByAssetId.get(assetId)!;
        const key = extractS3KeyFromUri(storageUri);
        const url = await getSignedUrl(
          s3,
          new GetObjectCommand({ Bucket: config.s3.bucket, Key: key }),
          { expiresIn: ASSET_URL_EXPIRY_SECONDS },
        );
        return [assetId, url] as const;
      }),
  );

  return Object.fromEntries(entries);
}

/**
 * Extracts the S3 object key from a URI of the form `s3://<bucket>/<key>`.
 * Falls back to using the full URI as the key if the prefix is not present.
 */
function extractS3KeyFromUri(uri: string): string {
  const match = uri.match(/^s3:\/\/[^/]+\/(.+)$/);
  return match ? match[1]! : uri;
}

// ── DB helpers ────────────────────────────────────────────────────────────────

async function fetchDocJson(
  pool: Pool,
  projectId: string,
  versionId: number,
): Promise<unknown> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT doc_json FROM project_versions WHERE version_id = ? AND project_id = ?',
    [versionId, projectId],
  );
  if (!rows.length) {
    throw new Error(
      `Version ${versionId} not found for project "${projectId}" — cannot render`,
    );
  }
  const docJson = rows[0]!['doc_json'];
  return typeof docJson === 'string' ? JSON.parse(docJson) : docJson;
}

async function updateJobStatus(
  pool: Pool,
  jobId: string,
  status: 'processing' | 'queued',
  progressPct: number,
): Promise<void> {
  await pool.execute(
    'UPDATE render_jobs SET status = ?, progress_pct = ? WHERE job_id = ?',
    [status, progressPct, jobId],
  );
}

async function completeJob(pool: Pool, jobId: string, outputUri: string): Promise<void> {
  await pool.execute(
    `UPDATE render_jobs SET status = 'complete', progress_pct = 100, output_uri = ? WHERE job_id = ?`,
    [outputUri, jobId],
  );
}

async function failJob(pool: Pool, jobId: string, errorMessage: string): Promise<void> {
  await pool.execute(
    `UPDATE render_jobs SET status = 'failed', error_message = ? WHERE job_id = ?`,
    [errorMessage, jobId],
  );
}

// ── S3 helpers ────────────────────────────────────────────────────────────────

async function uploadRenderedFile(
  s3: S3Client,
  key: string,
  filePath: string,
  contentType: string,
): Promise<void> {
  const body = await fs.readFile(filePath);
  await s3.send(
    new PutObjectCommand({
      Bucket: config.s3.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}
