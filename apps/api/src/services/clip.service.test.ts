import { describe, it, expect, vi, beforeEach } from 'vitest';

import { NotFoundError, ForbiddenError } from '@/lib/errors.js';

// ── Hoist shared mock objects ─────────────────────────────────────────────────
const { mockGetClip, mockPatchClip, mockInsertClip } = vi.hoisted(() => ({
  mockGetClip: vi.fn(),
  mockPatchClip: vi.fn(),
  mockInsertClip: vi.fn(),
}));

vi.mock('@/repositories/clip.repository.js', () => ({
  getClipByIdAndProject: mockGetClip,
  patchClip: mockPatchClip,
  insertClip: mockInsertClip,
}));

// ── Import SUT after mocks are registered ────────────────────────────────────
import { patchClip, createClip } from './clip.service.js';

// ─────────────────────────────────────────────────────────────────────────────

const baseClip = {
  clipId: 'clip-uuid-001',
  projectId: 'proj-uuid-001',
  trackId: 'track-uuid-001',
  startFrame: 0,
  durationFrames: 30,
  trimInFrames: 0,
  trimOutFrames: null,
  transform: null,
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

const baseParams = {
  projectId: 'proj-uuid-001',
  clipId: 'clip-uuid-001',
  requestingUserId: 'user-001',
  projectOwnerId: null,
  patch: { startFrame: 10 },
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env['NODE_ENV'] = 'test';
});

describe('clip.service', () => {
  describe('createClip', () => {
    const baseInsert = {
      clipId: 'new-clip-uuid-001',
      projectId: 'proj-uuid-001',
      trackId: 'track-uuid-001',
      type: 'video' as const,
      startFrame: 0,
      durationFrames: 30,
    };

    it('calls insertClip with the provided params on success', async () => {
      mockInsertClip.mockResolvedValue(undefined);

      await createClip(baseInsert);

      expect(mockInsertClip).toHaveBeenCalledWith(baseInsert);
    });

    it('propagates errors thrown by insertClip (e.g. duplicate clipId)', async () => {
      mockInsertClip.mockRejectedValue(new Error('Duplicate entry'));

      await expect(createClip(baseInsert)).rejects.toThrow('Duplicate entry');
    });

    it('passes optional fields (assetId, trimInFrames, layer) through to insertClip', async () => {
      mockInsertClip.mockResolvedValue(undefined);
      const params = {
        ...baseInsert,
        assetId: 'asset-uuid-001',
        trimInFrames: 5,
        trimOutFrames: null,
        layer: 2,
      };

      await createClip(params);

      expect(mockInsertClip).toHaveBeenCalledWith(params);
    });
  });

  describe('patchClip', () => {
    it('returns updated clip when clip exists and patch is valid', async () => {
      const updated = { ...baseClip, startFrame: 10 };
      mockGetClip.mockResolvedValue(baseClip);
      mockPatchClip.mockResolvedValue(updated);

      const result = await patchClip(baseParams);

      expect(result).toEqual(updated);
      expect(mockGetClip).toHaveBeenCalledWith('clip-uuid-001', 'proj-uuid-001');
      expect(mockPatchClip).toHaveBeenCalledWith(
        'clip-uuid-001',
        'proj-uuid-001',
        { startFrame: 10 },
      );
    });

    it('throws NotFoundError when clip does not exist', async () => {
      mockGetClip.mockResolvedValue(null);

      await expect(patchClip(baseParams)).rejects.toThrow(NotFoundError);
      expect(mockPatchClip).not.toHaveBeenCalled();
    });

    it('throws ForbiddenError when requesting user does not own the project', async () => {
      mockGetClip.mockResolvedValue(baseClip);
      process.env['NODE_ENV'] = 'production';

      await expect(
        patchClip({
          ...baseParams,
          requestingUserId: 'user-attacker',
          projectOwnerId: 'user-owner',
        }),
      ).rejects.toThrow(ForbiddenError);

      expect(mockPatchClip).not.toHaveBeenCalled();
    });

    it('skips the ownership check when NODE_ENV is development', async () => {
      mockGetClip.mockResolvedValue(baseClip);
      mockPatchClip.mockResolvedValue(baseClip);
      process.env['NODE_ENV'] = 'development';

      await expect(
        patchClip({
          ...baseParams,
          requestingUserId: 'user-attacker',
          projectOwnerId: 'user-owner',
        }),
      ).resolves.not.toThrow();
    });

    it('skips the ownership check when projectOwnerId is null', async () => {
      mockGetClip.mockResolvedValue(baseClip);
      mockPatchClip.mockResolvedValue(baseClip);
      process.env['NODE_ENV'] = 'production';

      await expect(
        patchClip({
          ...baseParams,
          requestingUserId: 'user-attacker',
          projectOwnerId: null,
        }),
      ).resolves.not.toThrow();
    });

    it('passes trimOutFrames null through to the repository', async () => {
      const updated = { ...baseClip, trimOutFrames: null };
      mockGetClip.mockResolvedValue(baseClip);
      mockPatchClip.mockResolvedValue(updated);

      await patchClip({
        ...baseParams,
        patch: { trimOutFrames: null },
      });

      expect(mockPatchClip).toHaveBeenCalledWith(
        'clip-uuid-001',
        'proj-uuid-001',
        { trimOutFrames: null },
      );
    });

    it('passes transform null through to the repository', async () => {
      const updated = { ...baseClip, transform: null };
      mockGetClip.mockResolvedValue(baseClip);
      mockPatchClip.mockResolvedValue(updated);

      await patchClip({
        ...baseParams,
        patch: { transform: null },
      });

      expect(mockPatchClip).toHaveBeenCalledWith(
        'clip-uuid-001',
        'proj-uuid-001',
        { transform: null },
      );
    });

    it('passes trackId to the repository for cross-track clip movement', async () => {
      const newTrackId = 'track-uuid-002';
      const updated = { ...baseClip, trackId: newTrackId };
      mockGetClip.mockResolvedValue(baseClip);
      mockPatchClip.mockResolvedValue(updated);

      const result = await patchClip({
        ...baseParams,
        patch: { trackId: newTrackId },
      });

      expect(mockPatchClip).toHaveBeenCalledWith(
        'clip-uuid-001',
        'proj-uuid-001',
        { trackId: newTrackId },
      );
      expect(result.trackId).toBe(newTrackId);
    });

    it('passes both trackId and startFrame together when clip moves track and position', async () => {
      const newTrackId = 'track-uuid-002';
      const updated = { ...baseClip, trackId: newTrackId, startFrame: 25 };
      mockGetClip.mockResolvedValue(baseClip);
      mockPatchClip.mockResolvedValue(updated);

      await patchClip({
        ...baseParams,
        patch: { trackId: newTrackId, startFrame: 25 },
      });

      expect(mockPatchClip).toHaveBeenCalledWith(
        'clip-uuid-001',
        'proj-uuid-001',
        { trackId: newTrackId, startFrame: 25 },
      );
    });
  });
});
