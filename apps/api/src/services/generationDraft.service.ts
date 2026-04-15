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
