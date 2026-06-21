/**
 * Input-assembly helpers and DI types for the storyboardOpenAIImage job.
 * Extracted from storyboardOpenAIImage.job.ts to keep the main job file
 * under the 300-line cap (§9).
 */

import { GetObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import type OpenAI from 'openai';
import { toFile } from 'openai/uploads';
import type { Pool } from 'mysql2/promise';
import type {
  StoryboardOpenAIImageJobPayload,
} from '@ai-video-editor/project-schema';

import { parseStorageUri } from '@/lib/storage-uri.js';
import type { CreateFileParams, FilesRepo, AiGenerationJobRepo } from '@/jobs/ai-generate.job.js';
import {
  selectSceneReferences,
  checkScopedStarGate,
  buildDraftStyleDescription,
  type ReferenceBlock,
} from '@/jobs/referenceSelection.js';

// ── DI types ──────────────────────────────────────────────────────────────────

type ReferenceFile = {
  fileId: string;
  storageUri: string;
  mimeType: string;
  displayName: string | null;
};

export type StoryboardImageFileReadRepo = {
  findFilesByIds: (params: {
    userId: string;
    fileIds: string[];
  }) => Promise<ReferenceFile[]>;
};

export type StoryboardSceneRepo = {
  attachOutputToBlock: (params: {
    id: string;
    aiJobId: string;
    outputFileId: string;
  }) => Promise<void>;
  markFailed: (aiJobId: string, errorMessage: string) => Promise<void>;
};

/**
 * Repository for loading reference blocks (with their stars and scene links)
 * for a given draft. Used by the scene generation master to enforce the
 * reference boundary (AC-09, ADR-0008).
 *
 * Also exposes `loadAttachedSceneMediaFileIds` for reading a scene's
 * directly-attached image file IDs from `storyboard_block_media`.
 */
export type SceneReferenceSelectionRepo = {
  loadBlocksForDraft: (draftId: string) => Promise<ReferenceBlock[]>;
  /**
   * Returns image file_ids from `storyboard_block_media` for `blockId`,
   * in sort_order ASC, excluding non-image media types and NULL file_ids.
   * Returns [] when the block has no attached image media.
   */
  loadAttachedSceneMediaFileIds: (blockId: string) => Promise<string[]>;
};

export type StoryboardOpenAIImageJobDeps = {
  openai: OpenAI;
  s3: S3Client;
  pool: Pool;
  bucket: string;
  filesRepo: FilesRepo;
  fileReadRepo: StoryboardImageFileReadRepo;
  aiGenerationJobRepo: AiGenerationJobRepo & {
    markFailed?: (jobId: string, errorMessage: string) => Promise<void>;
  };
  storyboardSceneRepo?: StoryboardSceneRepo;
  /** Optional: when present, enforces the reference boundary (AC-09) for scene jobs. */
  sceneReferenceSelectionRepo?: SceneReferenceSelectionRepo;
  /**
   * Optional best-effort scene-image phase-completion hook (AC-04, T12). When wired,
   * it is invoked at every scene-image job completion point (success OR failure): once
   * EVERY scene-illustration job for the draft is terminal (ready/failed) it advances
   * scene_image → completed via version CAS. A failed scene is terminal and does NOT
   * fail the phase. Absent in unit tests (backward-compatible no-op).
   */
  onSceneImagesAllTerminal?: (params: { pool: Pool; draftId: string }) => Promise<void>;
};

// ── Input-assembly helpers ────────────────────────────────────────────────────

export async function readS3ObjectToBuffer(s3: S3Client, storageUri: string): Promise<Buffer> {
  const { bucket, key } = parseStorageUri(storageUri);
  const result = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!result.Body) {
    throw new Error(`Reference file ${storageUri} has no readable body`);
  }
  const bytes = await result.Body.transformToByteArray();
  return Buffer.from(bytes);
}

export async function buildImageInputs(params: {
  payload: StoryboardOpenAIImageJobPayload;
  deps: StoryboardOpenAIImageJobDeps;
}): Promise<Array<Awaited<ReturnType<typeof toFile>>>> {
  const fileIds = [
    ...params.payload.referenceFileIds,
    ...(params.payload.previousSceneFileId ? [params.payload.previousSceneFileId] : []),
  ];
  const uniqueFileIds = [...new Set(fileIds)];
  if (!uniqueFileIds.length) {
    return [];
  }

  const rows = await params.deps.fileReadRepo.findFilesByIds({
    userId: params.payload.userId,
    fileIds: uniqueFileIds,
  });
  const byId = new Map(rows.map((row) => [row.fileId, row]));
  const missing = uniqueFileIds.filter((fileId) => !byId.has(fileId));
  if (missing.length) {
    throw new Error(`Reference image file is unavailable: ${missing[0]}`);
  }

  return Promise.all(
    uniqueFileIds.map(async (fileId) => {
      const row = byId.get(fileId)!;
      const body = await readS3ObjectToBuffer(params.deps.s3, row.storageUri);
      return toFile(body, row.displayName ?? `${fileId}.png`, { type: row.mimeType });
    }),
  );
}

/**
 * For kind='scene' jobs: applies the reference boundary (AC-09, ADR-0008) and
 * the scoped star gate (AC-08b) when the optional sceneReferenceSelectionRepo
 * is wired. Returns the effective referenceFileIds and prompt to use.
 *
 * - If the repo is absent: falls back to payload values (backward compat).
 * - If linked blocks exist: uses selectSceneReferences to derive file IDs
 *   within the boundary (only starred images of blocks linked to the scene).
 * - If no linked blocks: passes an empty fileIds list and augments the prompt
 *   with a draft-global derived style description (ADR-0007, AC-08b).
 */
export async function resolveSceneInputs(
  payload: StoryboardOpenAIImageJobPayload,
  deps: StoryboardOpenAIImageJobDeps,
): Promise<{ referenceFileIds: string[]; prompt: string }> {
  if (!payload.blockId || !deps.sceneReferenceSelectionRepo) {
    return { referenceFileIds: payload.referenceFileIds, prompt: payload.prompt };
  }

  const allBlocks = await deps.sceneReferenceSelectionRepo.loadBlocksForDraft(payload.draftId);

  // AC-08b: scoped star gate — check only blocks linked to this scene
  const gate = checkScopedStarGate({ sceneId: payload.blockId, allBlocks });
  if (!gate.passes) {
    // The API service is the authoritative enforcement point (ADR-0011); the
    // worker logs the violation but does not abort (to avoid orphaned jobs after
    // TOCTOU — stars could have changed between enqueue and execution).
    // The prompt will still be sent with whatever references are available.
  }

  // AC-05/AC-06/AC-06b: select exactly one output per linked block
  const selectedFileIds = selectSceneReferences({
    sceneId: payload.blockId,
    allBlocks,
  });

  // Subtask 4: include the scene's directly-attached image file IDs, merged
  // AHEAD of the linked-reference file IDs so the attached image appears first
  // in the images.edit() call. buildImageInputs deduplicates via new Set so
  // no duplication occurs even if the same file appears in both sources.
  // Backward-compat: loadAttachedSceneMediaFileIds may be absent on repos
  // wired only for existing tests (before subtask 3).
  const attachedFileIds = deps.sceneReferenceSelectionRepo.loadAttachedSceneMediaFileIds
    ? await deps.sceneReferenceSelectionRepo.loadAttachedSceneMediaFileIds(payload.blockId)
    : [];

  // AC-09, ADR-0007: scenes with no linked blocks get a draft-global derived
  // style description instead of linked-block references (shared by all such
  // scenes of this draft's generation run).
  const hasLinkedBlocks = allBlocks.some((b) => b.linkedSceneIds.includes(payload.blockId!));
  let effectivePrompt = payload.prompt;
  if (!hasLinkedBlocks) {
    const allStarredFileIds = allBlocks.flatMap((b) =>
      b.primaryStarFileId !== undefined ? [b.primaryStarFileId] : b.outputs.map((o) => o.fileId),
    );
    const styleDescription = buildDraftStyleDescription({
      starredFileIds: allStarredFileIds,
      scriptFallback: payload.prompt,
    });
    // Prepend the derived style description to the scene prompt so the model
    // receives both visual-style context and the scene-specific narrative.
    effectivePrompt = styleDescription !== payload.prompt
      ? `${styleDescription}\n\n${payload.prompt}`
      : payload.prompt;
  }

  // Attached image IDs come first so the scene's own image is the primary
  // image in images.edit(); reference IDs follow for character/environment
  // consistency. The dedup in buildImageInputs drops any overlap.
  return { referenceFileIds: [...attachedFileIds, ...selectedFileIds], prompt: effectivePrompt };
}
