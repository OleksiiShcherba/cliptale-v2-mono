/**
 * Restore service for generation drafts.
 *
 * Provides the `restoreDraft` function that reverses a soft-delete within the
 * 30-day TTL window. If the row no longer exists or the TTL has expired, the
 * function throws GoneError (410) so the caller/route returns 410 Gone.
 */
import * as generationDraftRepository from '@/repositories/generationDraft.repository.js';
import type { GenerationDraft } from '@/repositories/generationDraft.repository.js';
import { GoneError, NotFoundError } from '@/lib/errors.js';

/** Restore TTL — 30 days in milliseconds. */
const RESTORE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Restores a soft-deleted generation draft, verifying ownership.
 *
 * - If the row does not exist: GoneError (410) — hard-purged.
 * - If the row exists but belongs to a different user: NotFoundError (404) —
 *   never reveal ownership to unrelated callers.
 * - If `deleted_at` is more than 30 days ago: GoneError (410) — TTL expired.
 * - If the draft is already active (`deleted_at IS NULL`): returns the draft
 *   unchanged (idempotent).
 *
 * @throws GoneError when the draft is permanently gone or beyond the TTL.
 * @throws NotFoundError when the draft exists but belongs to another user.
 */
export async function restoreDraft(
  userId: string,
  id: string,
): Promise<GenerationDraft> {
  const draft = await generationDraftRepository.findDraftByIdIncludingDeleted(id);

  if (!draft) {
    throw new GoneError(
      `Generation draft "${id}" has been permanently removed and cannot be restored`,
    );
  }

  if (draft.userId !== userId) {
    // Return 404 rather than 403 to avoid leaking the existence of another
    // user's draft — consistent with the ownership pattern used in resolveDraft.
    throw new NotFoundError(`Generation draft "${id}" not found`);
  }

  if (draft.deletedAt === null) {
    // Already active — idempotent restore.
    return draft;
  }

  const age = Date.now() - draft.deletedAt.getTime();
  if (age > RESTORE_TTL_MS) {
    throw new GoneError(
      `Generation draft "${id}" was deleted more than 30 days ago and cannot be restored`,
    );
  }

  await generationDraftRepository.restoreDraft(id);

  // Return a patched copy rather than re-querying (avoids a second round-trip).
  return { ...draft, deletedAt: null };
}
