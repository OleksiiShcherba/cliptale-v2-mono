import { randomUUID } from 'node:crypto';

import { promptDocSchema } from '@ai-video-editor/project-schema';
import type { PromptDoc } from '@ai-video-editor/project-schema';

import * as generationDraftRepository from '@/repositories/generationDraft.repository.js';
import type { GenerationDraft } from '@/repositories/generationDraft.repository.js';
import {
  ForbiddenError,
  NotFoundError,
  UnprocessableEntityError,
} from '@/lib/errors.js';
import { aiEnhanceQueue } from '@/queues/bullmq.js';
import { enqueueEnhancePrompt } from '@/queues/jobs/enqueue-enhance-prompt.js';

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
