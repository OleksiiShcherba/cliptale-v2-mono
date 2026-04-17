import type { GenerationDraft } from '@/repositories/generationDraft.repository.js';

export const VALID_PROMPT_DOC = {
  schemaVersion: 1 as const,
  blocks: [{ type: 'text' as const, value: 'Hello world' }],
};

export const USER_ID = 'user-abc-123';
export const OTHER_USER_ID = 'user-xyz-999';
export const DRAFT_ID = '11111111-1111-4111-8111-111111111111';

export function makeDraft(overrides?: Partial<GenerationDraft>): GenerationDraft {
  return {
    id: DRAFT_ID,
    userId: USER_ID,
    promptDoc: VALID_PROMPT_DOC,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}
