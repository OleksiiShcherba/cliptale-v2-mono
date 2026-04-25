import type { PromptDoc } from '../types';

/** A minimal empty PromptDoc used as the default initial doc. */
export const EMPTY_DOC: PromptDoc = { schemaVersion: 1, blocks: [{ type: 'text', value: '' }] };

/** A PromptDoc with a single non-empty text block. */
export const DOC_A: PromptDoc = { schemaVersion: 1, blocks: [{ type: 'text', value: 'hello' }] };

/** A second PromptDoc used in coalesce and update tests. */
export const DOC_B: PromptDoc = { schemaVersion: 1, blocks: [{ type: 'text', value: 'world' }] };

/** The server response shape returned by POST /generation-drafts. */
export const DRAFT_RESPONSE = {
  id: 'draft-abc-123',
  userId: 'user-1',
  promptDoc: DOC_A,
  createdAt: '2026-04-16T10:00:00.000Z',
  updatedAt: '2026-04-16T10:00:00.000Z',
};
