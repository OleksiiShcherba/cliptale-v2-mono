/**
 * Shared fixture helpers for generation-drafts/cards integration tests.
 * Imported by generation-drafts-cards.endpoint.test.ts and generation-drafts-cards.shape.test.ts.
 */
import { createHash } from 'node:crypto';

/** Compute sha256(token) — mirrors auth.service.ts hashToken(). */
export function sha256(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Build a minimal valid PromptDoc with the given blocks. */
export function makePromptDoc(blocks: unknown[]): string {
  return JSON.stringify({ schemaVersion: 1, blocks });
}

/**
 * Derive the `kind` enum value for the `files` table from a MIME type.
 * Mirrors the mapping used by the ingest worker.
 */
export function mimeToKind(mimeType: string): 'video' | 'audio' | 'image' | 'other' {
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('image/')) return 'image';
  return 'other';
}
