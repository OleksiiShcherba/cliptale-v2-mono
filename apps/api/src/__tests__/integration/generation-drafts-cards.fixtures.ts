/**
 * Shared fixture helpers for generation-drafts/cards integration tests.
 * Imported by generation-drafts-cards.endpoint.test.ts and generation-drafts-cards.shape.test.ts.
 */
import { createHash } from 'node:crypto';

import { mimeToKind } from '@ai-video-editor/project-schema';

/** Compute sha256(token) — mirrors auth.service.ts hashToken(). */
export function sha256(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Build a minimal valid PromptDoc with the given blocks. */
export function makePromptDoc(blocks: unknown[]): string {
  return JSON.stringify({ schemaVersion: 1, blocks });
}

// Re-export so test files that `import { mimeToKind } from './generation-drafts-cards.fixtures.js'`
// continue to work without changes.
export { mimeToKind };
