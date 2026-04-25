import { describe, it, expect, vi, beforeEach } from 'vitest';

import * as generationDraftRepository from '@/repositories/generationDraft.repository.js';
import { ForbiddenError, NotFoundError, UnprocessableEntityError } from '@/lib/errors.js';
import { create, getById, listMine, update, remove } from './generationDraft.service.js';
import {
  VALID_PROMPT_DOC,
  USER_ID,
  OTHER_USER_ID,
  DRAFT_ID,
  makeDraft,
} from './generationDraft.service.fixtures.js';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/repositories/generationDraft.repository.js', () => ({
  insertDraft: vi.fn(),
  findDraftById: vi.fn(),
  findDraftsByUserId: vi.fn(),
  updateDraftPromptDoc: vi.fn(),
  deleteDraft: vi.fn(),
  softDeleteDraft: vi.fn().mockResolvedValue(true),
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('generationDraft.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('should call insertDraft and return the new draft on a valid PromptDoc', async () => {
      const draft = makeDraft();
      vi.mocked(generationDraftRepository.insertDraft).mockResolvedValue(draft);

      const result = await create(USER_ID, VALID_PROMPT_DOC);

      expect(generationDraftRepository.insertDraft).toHaveBeenCalledOnce();
      const [id, userId, promptDoc] = vi.mocked(generationDraftRepository.insertDraft).mock
        .calls[0]!;
      expect(userId).toBe(USER_ID);
      expect(promptDoc).toEqual(VALID_PROMPT_DOC);
      // The id must be a UUID v4.
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(result).toEqual(draft);
    });

    it('should throw UnprocessableEntityError (422) when promptDoc fails schema validation', async () => {
      const invalid = { schemaVersion: 99, blocks: 'not-an-array' };

      await expect(create(USER_ID, invalid)).rejects.toThrow(UnprocessableEntityError);
      expect(generationDraftRepository.insertDraft).not.toHaveBeenCalled();
    });

    it('should throw UnprocessableEntityError when promptDoc is completely missing fields', async () => {
      await expect(create(USER_ID, {})).rejects.toThrow(UnprocessableEntityError);
    });
  });

  // ── getById ───────────────────────────────────────────────────────────────

  describe('getById', () => {
    it('should return the draft when it exists and belongs to the user', async () => {
      const draft = makeDraft();
      vi.mocked(generationDraftRepository.findDraftById).mockResolvedValue(draft);

      const result = await getById(USER_ID, DRAFT_ID);

      expect(result).toEqual(draft);
    });

    it('should throw NotFoundError (404) when the draft does not exist', async () => {
      vi.mocked(generationDraftRepository.findDraftById).mockResolvedValue(null);

      await expect(getById(USER_ID, DRAFT_ID)).rejects.toThrow(NotFoundError);
    });

    it('should throw ForbiddenError (403) when the draft belongs to another user', async () => {
      const draft = makeDraft({ userId: OTHER_USER_ID });
      vi.mocked(generationDraftRepository.findDraftById).mockResolvedValue(draft);

      await expect(getById(USER_ID, DRAFT_ID)).rejects.toThrow(ForbiddenError);
    });
  });

  // ── listMine ──────────────────────────────────────────────────────────────

  describe('listMine', () => {
    it('should return all drafts belonging to the user', async () => {
      const drafts = [makeDraft({ id: 'id-1' }), makeDraft({ id: 'id-2' })];
      vi.mocked(generationDraftRepository.findDraftsByUserId).mockResolvedValue(drafts);

      const result = await listMine(USER_ID);

      expect(generationDraftRepository.findDraftsByUserId).toHaveBeenCalledWith(USER_ID);
      expect(result).toEqual(drafts);
    });

    it('should return an empty array when the user has no drafts', async () => {
      vi.mocked(generationDraftRepository.findDraftsByUserId).mockResolvedValue([]);

      const result = await listMine(USER_ID);

      expect(result).toEqual([]);
    });
  });

  // ── update ────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('should update the draft and return the updated record when ownership is valid', async () => {
      const existing = makeDraft();
      const updatedDoc = {
        schemaVersion: 1 as const,
        blocks: [{ type: 'text' as const, value: 'Updated text' }],
      };
      const updated = makeDraft({ promptDoc: updatedDoc });

      vi.mocked(generationDraftRepository.findDraftById).mockResolvedValue(existing);
      vi.mocked(generationDraftRepository.updateDraftPromptDoc).mockResolvedValue(updated);

      const result = await update(USER_ID, DRAFT_ID, updatedDoc);

      expect(generationDraftRepository.updateDraftPromptDoc).toHaveBeenCalledWith(
        DRAFT_ID,
        USER_ID,
        updatedDoc,
      );
      expect(result).toEqual(updated);
    });

    it('should throw NotFoundError (404) when the draft does not exist', async () => {
      vi.mocked(generationDraftRepository.findDraftById).mockResolvedValue(null);

      await expect(update(USER_ID, DRAFT_ID, VALID_PROMPT_DOC)).rejects.toThrow(NotFoundError);
      expect(generationDraftRepository.updateDraftPromptDoc).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenError (403) when the draft belongs to another user', async () => {
      const draft = makeDraft({ userId: OTHER_USER_ID });
      vi.mocked(generationDraftRepository.findDraftById).mockResolvedValue(draft);

      await expect(update(USER_ID, DRAFT_ID, VALID_PROMPT_DOC)).rejects.toThrow(ForbiddenError);
      expect(generationDraftRepository.updateDraftPromptDoc).not.toHaveBeenCalled();
    });

    it('should throw UnprocessableEntityError (422) when the new promptDoc is invalid', async () => {
      const invalid = { schemaVersion: 1, blocks: [{ type: 'unknown-type' }] };

      await expect(update(USER_ID, DRAFT_ID, invalid)).rejects.toThrow(UnprocessableEntityError);
      expect(generationDraftRepository.findDraftById).not.toHaveBeenCalled();
    });
  });

  // ── remove (soft-delete — EPIC B) ────────────────────────────────────────

  describe('remove', () => {
    it('should soft-delete the draft (calls softDeleteDraft, not deleteDraft)', async () => {
      const draft = makeDraft();
      vi.mocked(generationDraftRepository.findDraftById).mockResolvedValue(draft);

      await expect(remove(USER_ID, DRAFT_ID)).resolves.toBeUndefined();

      expect(generationDraftRepository.softDeleteDraft).toHaveBeenCalledWith(DRAFT_ID);
      // Hard-delete must NOT be called.
      expect(generationDraftRepository.deleteDraft).not.toHaveBeenCalled();
    });

    it('should throw NotFoundError (404) when the draft does not exist', async () => {
      vi.mocked(generationDraftRepository.findDraftById).mockResolvedValue(null);

      await expect(remove(USER_ID, DRAFT_ID)).rejects.toThrow(NotFoundError);
      expect(generationDraftRepository.softDeleteDraft).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenError (403) when the draft belongs to another user', async () => {
      const draft = makeDraft({ userId: OTHER_USER_ID });
      vi.mocked(generationDraftRepository.findDraftById).mockResolvedValue(draft);

      await expect(remove(USER_ID, DRAFT_ID)).rejects.toThrow(ForbiddenError);
      expect(generationDraftRepository.softDeleteDraft).not.toHaveBeenCalled();
    });
  });
});
