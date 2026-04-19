import { randomUUID } from 'node:crypto';

import { promptDocSchema } from '@ai-video-editor/project-schema';
import type { PromptDoc } from '@ai-video-editor/project-schema';

import * as generationDraftRepository from '@/repositories/generationDraft.repository.js';
import type {
  GenerationDraft,
  StoryboardCard,
} from '@/repositories/generationDraft.repository.js';
import * as aiGenerationJobRepository from '@/repositories/aiGenerationJob.repository.js';
import type { MediaRefBlock } from '@ai-video-editor/project-schema';
import {
  ForbiddenError,
  NotFoundError,
  UnprocessableEntityError,
} from '@/lib/errors.js';
import { aiEnhanceQueue } from '@/queues/bullmq.js';
import { enqueueEnhancePrompt } from '@/queues/jobs/enqueue-enhance-prompt.js';
import {
  submitGeneration,
  type SubmitGenerationParams,
  type SubmitGenerationResult,
} from '@/services/aiGeneration.service.js';

/** Valid status values returned by getEnhanceStatus. */
export type EnhanceJobStatus = 'queued' | 'running' | 'done' | 'failed';

export type EnhanceStatusResult = {
  status: EnhanceJobStatus;
  result?: PromptDoc;
  error?: string;
};

/**
 * Validate a PromptDoc against the shared Zod schema.
 * Throws UnprocessableEntityError (422) on invalid input.
 */
function assertValidPromptDoc(promptDoc: unknown): asserts promptDoc is PromptDoc {
  const result = promptDocSchema.safeParse(promptDoc);
  if (!result.success) {
    throw new UnprocessableEntityError(
      `Invalid PromptDoc: ${result.error.issues.map((i) => i.message).join(', ')}`,
    );
  }
}

/**
 * Resolve a draft by id, enforcing ownership.
 *
 * - Row missing → NotFoundError (404)
 * - Row exists but wrong owner → ForbiddenError (403)
 */
async function resolveDraft(userId: string, id: string): Promise<GenerationDraft> {
  const draft = await generationDraftRepository.findDraftById(id);
  if (!draft) {
    throw new NotFoundError(`Generation draft ${id} not found`);
  }
  if (draft.userId !== userId) {
    throw new ForbiddenError(`You do not own generation draft ${id}`);
  }
  return draft;
}

/** Create a new generation draft for the authenticated user. */
export async function create(userId: string, promptDoc: unknown): Promise<GenerationDraft> {
  assertValidPromptDoc(promptDoc);
  const id = randomUUID();
  return generationDraftRepository.insertDraft(id, userId, promptDoc);
}

/** Retrieve a single generation draft, enforcing ownership. */
export async function getById(userId: string, id: string): Promise<GenerationDraft> {
  return resolveDraft(userId, id);
}

/** List all drafts belonging to the authenticated user. */
export async function listMine(userId: string): Promise<GenerationDraft[]> {
  return generationDraftRepository.findDraftsByUserId(userId);
}

/** Replace the promptDoc of an existing draft, enforcing ownership. */
export async function update(
  userId: string,
  id: string,
  promptDoc: unknown,
): Promise<GenerationDraft> {
  assertValidPromptDoc(promptDoc);
  // Verify ownership first (throws NotFoundError / ForbiddenError as appropriate).
  await resolveDraft(userId, id);
  const updated = await generationDraftRepository.updateDraftPromptDoc(id, userId, promptDoc);
  // Should not happen after resolveDraft, but guard defensively.
  if (!updated) {
    throw new NotFoundError(`Generation draft ${id} not found after ownership check`);
  }
  return updated;
}

/** Delete a generation draft, enforcing ownership. */
export async function remove(userId: string, id: string): Promise<void> {
  // Verify ownership first (throws NotFoundError / ForbiddenError as appropriate).
  await resolveDraft(userId, id);
  await generationDraftRepository.deleteDraft(id, userId);
}

/**
 * Enqueues an AI Enhance job for the given draft.
 *
 * - Verifies the draft exists and belongs to the caller (404 / 403 on failure).
 * - Returns the BullMQ job ID that the caller uses to poll status via getEnhanceStatus.
 * - Does NOT validate or mutate the draft's promptDoc — the worker receives the
 *   current promptDoc as the job payload and writes a proposed rewrite to the
 *   job's returnvalue without touching the DB.
 */
export async function startEnhance(
  userId: string,
  draftId: string,
): Promise<{ jobId: string }> {
  const draft = await resolveDraft(userId, draftId);
  const jobId = await enqueueEnhancePrompt({ draftId, userId, promptDoc: draft.promptDoc });
  return { jobId };
}

/**
 * Submits an AI generation request on behalf of a generation draft.
 *
 * 1. Verifies draft ownership (throws NotFoundError / ForbiddenError as appropriate).
 * 2. Delegates to aiGeneration.service.submitGeneration — applies the same
 *    model-catalog validation, kling-o3 XOR, and presigned-URL resolver.
 * 3. Records the draft association on the job row via aiGenerationJobRepository.setDraftId.
 *    When the worker later calls setOutputFile, the repository auto-links the
 *    generated file into draft_files so it appears in the wizard's gallery.
 *
 * Returns 202 { jobId, status: 'queued' } on success.
 * Throws ValidationError (400) for invalid model/options, ForbiddenError (403) for
 * ownership failures, NotFoundError (404) for missing draft.
 */
export async function submitDraftAiGeneration(
  userId: string,
  draftId: string,
  params: SubmitGenerationParams,
): Promise<SubmitGenerationResult> {
  // Ownership check — throws NotFoundError / ForbiddenError on failure.
  await resolveDraft(userId, draftId);

  const result = await submitGeneration(userId, params);

  // Record the draft association so setOutputFile can auto-link the output file.
  await aiGenerationJobRepository.setDraftId(result.jobId, draftId);

  return result;
}

/**
 * Maps BullMQ job state to the API status enum and surfaces the returnvalue / failedReason.
 *
 * BullMQ state → API status mapping:
 *   waiting | delayed → 'queued'
 *   active             → 'running'
 *   completed          → 'done'   (result populated from job.returnvalue)
 *   failed             → 'failed' (error populated from job.failedReason)
 *   anything else      → 'failed' (treated as an unknown terminal state)
 *
 * - Verifies draft ownership before reading the job (same 404 / 403 semantics).
 * - Does NOT re-enqueue or mutate anything.
 * - Throws NotFoundError when the jobId is not found in the queue (job may have
 *   expired per the removeOnComplete / removeOnFail TTLs set in the producer).
 */
export async function getEnhanceStatus(
  userId: string,
  draftId: string,
  jobId: string,
): Promise<EnhanceStatusResult> {
  // Ownership check — throws if draft missing or not owned by userId.
  await resolveDraft(userId, draftId);

  const job = await aiEnhanceQueue.getJob(jobId);
  if (!job) {
    throw new NotFoundError(`Enhance job ${jobId} not found — it may have expired`);
  }

  const state = await job.getState();

  if (state === 'completed') {
    const parsed = promptDocSchema.safeParse(job.returnvalue);
    return {
      status: 'done',
      result: parsed.success ? parsed.data : undefined,
    };
  }

  if (state === 'failed') {
    return {
      status: 'failed',
      error: job.failedReason ?? 'Unknown error',
    };
  }

  if (state === 'active') {
    return { status: 'running' };
  }

  // waiting | delayed | unknown states → queued
  return { status: 'queued' };
}

// Re-export the StoryboardCard type so controllers can reference it without
// importing from the repository directly (service is the public boundary).
export type { StoryboardCard } from '@/repositories/generationDraft.repository.js';

/** Maximum characters in a storyboard card text preview. */
const TEXT_PREVIEW_MAX_CHARS = 140;

/** Maximum media-preview entries per storyboard card. */
const MEDIA_PREVIEW_MAX_COUNT = 3;

/**
 * Derives the content-type bucket ('video' | 'image' | 'audio') from a MIME string.
 * Returns null for unrecognised MIME types (asset will be silently skipped).
 */
function mimeToMediaType(contentType: string): 'video' | 'image' | 'audio' | null {
  if (contentType.startsWith('video/')) return 'video';
  if (contentType.startsWith('image/')) return 'image';
  if (contentType.startsWith('audio/')) return 'audio';
  return null;
}

/**
 * Returns storyboard card summaries for all drafts owned by the user, sorted
 * by updated_at DESC.
 *
 * For each draft:
 * - textPreview: first 140 chars of concatenated TextBlock values.
 * - mediaPreviews: first 3 MediaRefBlock fileIds resolved from
 *   project_assets_current. Dangling refs (asset deleted) are silently skipped
 *   — the endpoint never throws 500 on a missing asset.
 */
export async function listStoryboardCardsForUser(userId: string): Promise<StoryboardCard[]> {
  const drafts = await generationDraftRepository.findStoryboardDraftsForUser(userId);

  if (drafts.length === 0) return [];

  // Collect the first MEDIA_PREVIEW_MAX_COUNT media-ref fileIds per draft.
  const draftMediaRefs = drafts.map((d) => {
    const blocks = d.promptDoc.blocks;
    const mediaRefs: string[] = [];
    for (const block of blocks) {
      if (block.type === 'media-ref' && mediaRefs.length < MEDIA_PREVIEW_MAX_COUNT) {
        mediaRefs.push((block as MediaRefBlock).fileId);
      }
    }
    return { draft: d, mediaRefs };
  });

  // Batch-fetch all referenced asset IDs in a single query.
  const allAssetIds = [...new Set(draftMediaRefs.flatMap((d) => d.mediaRefs))];
  const assetRows = await generationDraftRepository.findAssetPreviewsByIds(allAssetIds);

  // Build a lookup map for O(1) access.
  const assetMap = new Map(assetRows.map((a) => [a.fileId, a]));

  return draftMediaRefs.map(({ draft, mediaRefs }) => {
    // Build text preview from TextBlocks.
    let textConcat = '';
    for (const block of draft.promptDoc.blocks) {
      if (block.type === 'text') {
        textConcat += block.value;
        if (textConcat.length >= TEXT_PREVIEW_MAX_CHARS) break;
      }
    }
    const textPreview = textConcat.slice(0, TEXT_PREVIEW_MAX_CHARS);

    // Resolve media previews, silently skipping missing assets.
    const mediaPreviews: StoryboardCard['mediaPreviews'] = [];
    for (const fileId of mediaRefs) {
      const asset = assetMap.get(fileId);
      if (!asset) continue; // silently skip dangling reference
      const type = mimeToMediaType(asset.contentType);
      if (!type) continue;
      mediaPreviews.push({ fileId, type, thumbnailUrl: asset.thumbnailUri });
    }

    return {
      draftId: draft.id,
      status: draft.status,
      textPreview,
      mediaPreviews,
      updatedAt: draft.updatedAt,
    };
  });
}
