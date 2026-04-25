/**
 * BullMQ handler for the `ai-generate` queue — unified provider dispatcher.
 *
 * Branches on the job capability: ElevenLabs audio capabilities are dispatched
 * to `processElevenLabsCapability` (ai-generate-audio.handler.ts); all fal.ai
 * capabilities follow the existing submit → poll → download → S3 → ingest flow.
 */

import { randomUUID } from 'node:crypto';

import type { Job, Queue } from 'bullmq';
import { PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import type { Pool } from 'mysql2/promise';
import type { MediaIngestJobPayload } from '@ai-video-editor/project-schema';

import {
  type FalStatusParams,
  type FalSubmitParams,
  type FalSubmitResult,
  type FalStatusResult,
} from '@/lib/fal-client.js';
import {
  parseFalOutput,
  type AiCapability,
  type AudioCapability,
  type FalCapability,
} from '@/jobs/ai-generate.output.js';
import {
  processElevenLabsCapability,
  type ElevenLabsClientFns,
} from '@/jobs/ai-generate-audio.handler.js';
import {
  mimeToKind,
  pollFalWithProgress,
  downloadArtifact,
  setJobStatus,
  setJobProgress,
  type FileKind,
} from '@/jobs/ai-generate.utils.js';

// Re-export FileKind so existing imports from this module continue to work.
export type { FileKind };

/** Payload shape mirroring `apps/api/src/queues/jobs/enqueue-ai-generate.ts`. */
export type AiGenerateJobPayload = {
  jobId: string;
  userId: string;
  projectId: string;
  modelId: string;
  capability: AiCapability;
  provider: 'fal' | 'elevenlabs';
  prompt: string;
  options: Record<string, unknown>;
};

/** Parameters for creating a file row via `filesRepo.createFile`. */
export type CreateFileParams = {
  fileId: string;
  userId: string;
  kind: FileKind;
  storageUri: string;
  mimeType: string;
  bytes: number | null;
  width: number | null;
  height: number | null;
  displayName: string;
};

/**
 * Worker-local thin repository interface for the `files` table.
 * The full repository lives in `apps/api/` — workers use this injected interface
 * so they can be tested without importing across app boundaries.
 */
export type FilesRepo = {
  /** Inserts a new `files` row with status='processing' and returns the fileId. */
  createFile: (params: CreateFileParams) => Promise<string>;
};

/**
 * Worker-local thin repository interface for the `ai_generation_jobs` table.
 * Mirrors the `setOutputFile` contract from `apps/api/src/repositories/aiGenerationJob.repository.ts`.
 */
export type AiGenerationJobRepo = {
  /** Marks the job completed, sets output_file_id, and links draft_files when draft_id is set. */
  setOutputFile: (jobId: string, fileId: string) => Promise<void>;
};

/**
 * Injected dependencies for the ai-generate job handler.
 *
 * The fal client, API key, and ingest queue are all passed via `deps` so the
 * handler never reaches for `process.env`, never imports `@/config`, and can
 * be unit-tested without patching module state.
 */
export type AiGenerateJobDeps = {
  s3: S3Client;
  pool: Pool;
  bucket: string;
  falKey: string;
  fal: {
    submitFalJob: (params: FalSubmitParams) => Promise<FalSubmitResult>;
    getFalJobStatus: (params: FalStatusParams) => Promise<FalStatusResult>;
  };
  elevenlabsKey: string;
  elevenlabs: ElevenLabsClientFns;
  ingestQueue: Queue<MediaIngestJobPayload>;
  filesRepo: FilesRepo;
  aiGenerationJobRepo: AiGenerationJobRepo;
};

/** Progress stored once fal.ai has accepted the submit. */
const PROGRESS_SUBMITTED = 50;

const AUDIO_CAPABILITIES = new Set<AiCapability>([
  'text_to_speech', 'voice_cloning', 'speech_to_speech', 'music_generation',
]);

/**
 * Processes one `ai-generate` job end-to-end:
 *
 * 1. Mark the DB row `processing`.
 * 2. Submit to fal.ai queue via `deps.fal.submitFalJob`.
 * 3. Poll `deps.fal.getFalJobStatus` until terminal, bumping `progress`.
 * 4. Parse the output by capability into a normalized record.
 * 5. Download the fal CDN artifact into memory and upload to S3.
 * 6. Create a `files` row via `deps.filesRepo.createFile`.
 * 7. Enqueue a media-ingest job (idempotent by fileId) for FFprobe metadata.
 * 8. Mark the generation row `completed` with the new file's ID via
 *    `deps.aiGenerationJobRepo.setOutputFile` (also links draft_files pivot
 *    when draft_id is set on the job row).
 *
 * Any thrown error marks the job row `failed` with the error message and is
 * re-thrown so BullMQ records the failure.
 */
export async function processAiGenerateJob(
  job: Job<AiGenerateJobPayload>,
  deps: AiGenerateJobDeps,
): Promise<void> {
  const { jobId, userId, projectId, modelId, capability, options } = job.data;
  const { s3, pool, bucket, falKey, fal, elevenlabsKey, elevenlabs, ingestQueue } = deps;

  await setJobStatus(pool, jobId, 'processing');

  try {
    // Dispatch ElevenLabs audio capabilities to the dedicated audio handler.
    if (AUDIO_CAPABILITIES.has(capability)) {
      await processElevenLabsCapability(
        { jobId, userId, projectId, capability: capability as AudioCapability, options },
        {
          s3, pool, bucket, elevenlabsKey, elevenlabs, ingestQueue,
          filesRepo: deps.filesRepo,
          aiGenerationJobRepo: deps.aiGenerationJobRepo,
        },
      );
      return;
    }

    // ── fal.ai path ────────────────────────────────────────────────────────
    // The API-side asset resolver already folded `prompt` into `options` and
    // rewrote asset IDs to 1-hour presigned URLs. Forward `options` verbatim.
    const falInput: Record<string, unknown> = { ...(options ?? {}) };

    const { requestId, statusUrl, responseUrl } = await fal.submitFalJob({
      modelId,
      input: falInput,
      apiKey: falKey,
    });
    await setJobProgress(pool, jobId, PROGRESS_SUBMITTED);

    const output = await pollFalWithProgress(
      { modelId, requestId, apiKey: falKey, statusUrl, responseUrl },
      fal.getFalJobStatus,
      (progress) => setJobProgress(pool, jobId, progress),
    );

    const parsed = parseFalOutput(capability as FalCapability, output);
    const body = await downloadArtifact(parsed.remoteUrl);

    const storageKey = `ai-generations/${projectId}/${randomUUID()}.${parsed.extension}`;
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: storageKey,
        Body: body,
        ContentType: parsed.contentType,
      }),
    );

    const storageUri = `s3://${bucket}/${storageKey}`;
    const fileId = randomUUID();
    const displayName = `ai-${capability}-${Date.now()}.${parsed.extension}`;

    await deps.filesRepo.createFile({
      fileId,
      userId,
      kind: mimeToKind(parsed.contentType),
      storageUri,
      mimeType: parsed.contentType,
      bytes: body.length,
      width: parsed.width,
      height: parsed.height,
      displayName,
    });

    // Enqueue media-ingest so FFprobe fills duration_frames / fps / thumbnail /
    // waveform. The file stays `processing` until ingest upgrades it to
    // `ready`, matching the flow for client-uploaded media.
    await ingestQueue.add(
      'ingest',
      { fileId, storageUri, contentType: parsed.contentType },
      { jobId: fileId, removeOnComplete: true, removeOnFail: false },
    );

    // Mark the job completed and set output_file_id. This also INSERT IGNOREs
    // into draft_files when the job has a draft_id, completing the
    // Files-as-Root generation-draft linkage.
    await deps.aiGenerationJobRepo.setOutputFile(jobId, fileId);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown generation error';
    await setJobStatus(pool, jobId, 'failed', message);
    throw err;
  }
}
