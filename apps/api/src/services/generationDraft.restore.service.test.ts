/**
 * Unit tests for generationDraft.restore.service.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { GoneError, NotFoundError } from '@/lib/errors.js';
import * as generationDraftRepository from '@/repositories/generationDraft.repository.js';

import { restoreDraft } from './generationDraft.restore.service.js';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/repositories/generationDraft.repository.js', () => ({
  findDraftByIdIncludingDeleted: vi.fn(),
  restoreDraft: vi.fn().mockResolvedValue(true),
  findDraftById: vi.fn(),
  insertDraft: vi.fn(),
  findDraftsByUserId: vi.fn(),
  updateDraftPromptDoc: vi.fn(),
  deleteDraft: vi.fn(),
  softDeleteDraft: vi.fn(),
  findStoryboardDraftsForUser: vi.fn(),
  findAssetPreviewsByIds: vi.fn(),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const baseDraft = {
  id: 'draft-restore-001',
  userId: 'user-111',
  promptDoc: { blocks: [] },
  status: 'draft' as const,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-15T00:00:00.000Z'),
  deletedAt: new Date('2026-04-10T00:00:00.000Z'), // recent — within TTL
};

// ── restoreDraft ─────────────────────────────────────────────────────────────

describe('generationDraft.restore.service', () => {
  describe('restoreDraft', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.mocked(generationDraftRepository.findDraftByIdIncludingDeleted).mockResolvedValue(baseDraft);
      vi.mocked(generationDraftRepository.restoreDraft).mockResolvedValue(true);
    });

    it('calls restoreDraft and returns the draft with deletedAt null on happy path', async () => {
      const result = await restoreDraft('user-111', 'draft-restore-001');
      expect(generationDraftRepository.restoreDraft).toHaveBeenCalledWith('draft-restore-001');
      expect(result.deletedAt).toBeNull();
      expect(result.id).toBe('draft-restore-001');
    });

    it('throws GoneError when the row does not exist (hard-purged)', async () => {
      vi.mocked(generationDraftRepository.findDraftByIdIncludingDeleted).mockResolvedValueOnce(null);
      await expect(restoreDraft('user-111', 'draft-restore-001')).rejects.toBeInstanceOf(GoneError);
      expect(generationDraftRepository.restoreDraft).not.toHaveBeenCalled();
    });

    it('throws NotFoundError when the draft belongs to another user', async () => {
      vi.mocked(generationDraftRepository.findDraftByIdIncludingDeleted).mockResolvedValueOnce({
        ...baseDraft,
        userId: 'other-user',
      });
      await expect(restoreDraft('user-111', 'draft-restore-001')).rejects.toBeInstanceOf(NotFoundError);
      expect(generationDraftRepository.restoreDraft).not.toHaveBeenCalled();
    });

    it('throws GoneError when deleted_at is older than 30 days', async () => {
      const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
      vi.mocked(generationDraftRepository.findDraftByIdIncludingDeleted).mockResolvedValueOnce({
        ...baseDraft,
        deletedAt: oldDate,
      });
      await expect(restoreDraft('user-111', 'draft-restore-001')).rejects.toBeInstanceOf(GoneError);
      expect(generationDraftRepository.restoreDraft).not.toHaveBeenCalled();
    });

    it('returns the draft without calling restoreDraft when already active (idempotent)', async () => {
      vi.mocked(generationDraftRepository.findDraftByIdIncludingDeleted).mockResolvedValueOnce({
        ...baseDraft,
        deletedAt: null,
      });
      const result = await restoreDraft('user-111', 'draft-restore-001');
      expect(generationDraftRepository.restoreDraft).not.toHaveBeenCalled();
      expect(result.deletedAt).toBeNull();
    });

    it('preserves draft fields (id, userId, promptDoc, status) in the returned object', async () => {
      const result = await restoreDraft('user-111', 'draft-restore-001');
      expect(result.id).toBe(baseDraft.id);
      expect(result.userId).toBe(baseDraft.userId);
      expect(result.status).toBe(baseDraft.status);
    });
  });
});
