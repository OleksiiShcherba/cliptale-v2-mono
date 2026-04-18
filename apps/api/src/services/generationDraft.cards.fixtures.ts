/**
 * Shared fixture builders for generationDraft.cards.service.test.ts.
 *
 * Exported so the primary test file stays under the 300-line cap (arch-rules §9).
 */
import type { GenerationDraftStatus } from '@/repositories/generationDraft.repository.js';
import type { PromptDoc } from '@ai-video-editor/project-schema';

// ── Stable test IDs ───────────────────────────────────────────────────────────

export const USER_ID = 'user-cards-test-001';
export const DRAFT_ID_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const DRAFT_ID_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

export const ASSET_VIDEO = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
export const ASSET_IMAGE_1 = 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2';
export const ASSET_IMAGE_2 = 'c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3';
export const ASSET_IMAGE_3 = 'd4d4d4d4-d4d4-4d4d-8d4d-d4d4d4d4d4d4';
export const ASSET_IMAGE_4 = 'e5e5e5e5-e5e5-4e5e-8e5e-e5e5e5e5e5e5';
export const ASSET_DELETED = 'deadbeef-dead-4ead-8ead-deadbeefcafe';

// ── Builder helpers ───────────────────────────────────────────────────────────

export function makePromptDoc(blocks: PromptDoc['blocks']): PromptDoc {
  return { schemaVersion: 1, blocks };
}

export function makeDraftRow(overrides: {
  id?: string;
  status?: GenerationDraftStatus;
  promptDoc?: PromptDoc;
  updatedAt?: Date;
}) {
  return {
    id: overrides.id ?? DRAFT_ID_1,
    status: overrides.status ?? ('draft' as GenerationDraftStatus),
    promptDoc: overrides.promptDoc ?? makePromptDoc([{ type: 'text', value: 'Hello' }]),
    updatedAt: overrides.updatedAt ?? new Date('2026-01-01T00:00:00Z'),
  };
}
