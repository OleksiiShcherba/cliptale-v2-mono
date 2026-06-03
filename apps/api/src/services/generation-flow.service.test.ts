/**
 * Unit tests for generation-flow.service.
 *
 * All repository dependencies are mocked. Tests cover:
 *   - list: delegates to repo
 *   - create: generates UUID + calls createFlow
 *   - open: owner can read; non-owner → NotFoundError; absent → NotFoundError (same error)
 *   - rename: owner-scoped; non-owner → NotFoundError
 *   - delete: owner-scoped; non-owner → NotFoundError
 *   - saveCanvas: matching version → success + new version returned
 *                  stale version  → OptimisticLockError
 *
 * Requirement: non-owner and absent are INDISTINGUISHABLE → both raise NotFoundError (AC-04, §8).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import * as flowRepo from '@/repositories/generation-flow.repository.js';
import * as jobRepo from '@/repositories/aiGenerationJob.repository.js';
import { NotFoundError, OptimisticLockError } from '@/lib/errors.js';

// Hoisted mock — must appear before the first import of the service module.
vi.mock('@/repositories/generation-flow.repository.js', () => ({
  findFlowsByUserId: vi.fn(),
  createFlow: vi.fn(),
  findFlowById: vi.fn(),
  renameFlow: vi.fn(),
  softDeleteFlow: vi.fn(),
  saveFlowCanvas: vi.fn(),
}));

vi.mock('@/repositories/aiGenerationJob.repository.js', () => ({
  getJobsByFlowId: vi.fn(),
}));

// Import after mocks are registered.
import {
  listFlows,
  createFlow,
  openFlow,
  renameFlow,
  deleteFlow,
  saveCanvas,
} from './generation-flow.service.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const OWNER_ID    = 'owner-user-00000000-0000-4000-8000-000000000001';
const OTHER_ID    = 'other-user-00000000-0000-4000-8000-000000000002';
const FLOW_ID     = 'flow-00000000-0000-4000-8000-000000000001';

const MINIMAL_CANVAS = { blocks: [], edges: [] };

function makeFlow(overrides: Partial<ReturnType<typeof makeFlow>> = {}) {
  return {
    flowId: FLOW_ID,
    userId: OWNER_ID,
    title: 'Test flow',
    canvas: MINIMAL_CANVAS,
    version: 1,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    deletedAt: null,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('generation-flow.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── listFlows ─────────────────────────────────────────────────────────────

  describe('listFlows', () => {
    it('returns the repo result for the calling user', async () => {
      const flows = [makeFlow(), makeFlow({ flowId: 'flow-2' })];
      vi.mocked(flowRepo.findFlowsByUserId).mockResolvedValue(flows);

      const result = await listFlows(OWNER_ID);

      expect(flowRepo.findFlowsByUserId).toHaveBeenCalledWith(OWNER_ID);
      expect(result).toEqual(flows);
    });

    it('returns an empty array when the user has no flows', async () => {
      vi.mocked(flowRepo.findFlowsByUserId).mockResolvedValue([]);

      const result = await listFlows(OWNER_ID);

      expect(result).toEqual([]);
    });
  });

  // ── createFlow ────────────────────────────────────────────────────────────

  describe('createFlow', () => {
    it('calls the repo with a generated UUID and returns the new flow', async () => {
      const flow = makeFlow();
      vi.mocked(flowRepo.createFlow).mockResolvedValue(flow);

      const result = await createFlow(OWNER_ID, 'My new flow');

      expect(flowRepo.createFlow).toHaveBeenCalledOnce();
      const [call] = vi.mocked(flowRepo.createFlow).mock.calls;
      expect(call![0].userId).toBe(OWNER_ID);
      expect(call![0].title).toBe('My new flow');
      // flowId must be a UUID v4
      expect(call![0].flowId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(result).toEqual(flow);
    });
  });

  // ── openFlow ──────────────────────────────────────────────────────────────

  describe('openFlow', () => {
    it('returns the canvas + job states when the owner opens their flow', async () => {
      const flow = makeFlow();
      const jobs = [
        { jobId: 'job-1', blockId: 'block-1', status: 'completed', flowId: FLOW_ID },
      ];
      vi.mocked(flowRepo.findFlowById).mockResolvedValue(flow);
      vi.mocked(jobRepo.getJobsByFlowId).mockResolvedValue(jobs as never);

      const result = await openFlow(FLOW_ID, OWNER_ID);

      expect(flowRepo.findFlowById).toHaveBeenCalledWith(FLOW_ID, OWNER_ID);
      expect(jobRepo.getJobsByFlowId).toHaveBeenCalledWith(FLOW_ID);
      expect(result.flow).toEqual(flow);
      expect(result.jobs).toEqual(jobs);
    });

    it('raises NotFoundError when the flow does not exist (absent case)', async () => {
      vi.mocked(flowRepo.findFlowById).mockResolvedValue(null);

      await expect(openFlow(FLOW_ID, OWNER_ID)).rejects.toThrow(NotFoundError);
      expect(jobRepo.getJobsByFlowId).not.toHaveBeenCalled();
    });

    it('raises NotFoundError when the flow belongs to another user (non-owner case)', async () => {
      // repo already owner-scopes: returns null for non-owner
      vi.mocked(flowRepo.findFlowById).mockResolvedValue(null);

      await expect(openFlow(FLOW_ID, OTHER_ID)).rejects.toThrow(NotFoundError);
    });

    it('absent and non-owner raise the SAME error class — indistinguishable', async () => {
      vi.mocked(flowRepo.findFlowById).mockResolvedValue(null);

      const absentErr = await openFlow(FLOW_ID, OWNER_ID).catch((e) => e);
      const nonOwnerErr = await openFlow(FLOW_ID, OTHER_ID).catch((e) => e);

      expect(absentErr).toBeInstanceOf(NotFoundError);
      expect(nonOwnerErr).toBeInstanceOf(NotFoundError);
      // Both carry a 404 status code — callers cannot tell them apart.
      expect((absentErr as NotFoundError).statusCode).toBe(404);
      expect((nonOwnerErr as NotFoundError).statusCode).toBe(404);
    });
  });

  // ── renameFlow ────────────────────────────────────────────────────────────

  describe('renameFlow', () => {
    it('returns the updated flow when the owner renames', async () => {
      const updated = makeFlow({ title: 'Renamed' });
      vi.mocked(flowRepo.renameFlow).mockResolvedValue(true);
      vi.mocked(flowRepo.findFlowById).mockResolvedValue(updated);

      const result = await renameFlow(FLOW_ID, OWNER_ID, 'Renamed');

      expect(flowRepo.renameFlow).toHaveBeenCalledWith(FLOW_ID, OWNER_ID, 'Renamed');
      expect(result).toEqual(updated);
    });

    it('raises NotFoundError when the flow is absent or belongs to another user', async () => {
      vi.mocked(flowRepo.renameFlow).mockResolvedValue(false);

      await expect(renameFlow(FLOW_ID, OTHER_ID, 'Title')).rejects.toThrow(NotFoundError);
    });
  });

  // ── deleteFlow ────────────────────────────────────────────────────────────

  describe('deleteFlow', () => {
    it('soft-deletes without error when the owner deletes their flow', async () => {
      vi.mocked(flowRepo.softDeleteFlow).mockResolvedValue(true);

      await expect(deleteFlow(FLOW_ID, OWNER_ID)).resolves.toBeUndefined();
      expect(flowRepo.softDeleteFlow).toHaveBeenCalledWith(FLOW_ID, OWNER_ID);
    });

    it('raises NotFoundError when the flow is absent or belongs to another user', async () => {
      vi.mocked(flowRepo.softDeleteFlow).mockResolvedValue(false);

      await expect(deleteFlow(FLOW_ID, OTHER_ID)).rejects.toThrow(NotFoundError);
    });
  });

  // ── saveCanvas ────────────────────────────────────────────────────────────

  describe('saveCanvas', () => {
    it('returns the updated flow record when the version matches', async () => {
      const updated = makeFlow({ version: 2 });
      vi.mocked(flowRepo.saveFlowCanvas).mockResolvedValue({ saved: true, flow: updated });

      const result = await saveCanvas(FLOW_ID, OWNER_ID, MINIMAL_CANVAS, 1);

      expect(flowRepo.saveFlowCanvas).toHaveBeenCalledWith({
        flowId: FLOW_ID,
        userId: OWNER_ID,
        canvas: MINIMAL_CANVAS,
        parentVersion: 1,
      });
      expect(result).toEqual(updated);
      expect(result.version).toBe(2);
    });

    it('raises OptimisticLockError when the version is stale', async () => {
      vi.mocked(flowRepo.saveFlowCanvas).mockResolvedValue({ saved: false, flow: null });

      await expect(saveCanvas(FLOW_ID, OWNER_ID, MINIMAL_CANVAS, 0)).rejects.toThrow(
        OptimisticLockError,
      );
    });

    it('stale version and non-owner are both OptimisticLockError (repo returns saved:false for both)', async () => {
      vi.mocked(flowRepo.saveFlowCanvas).mockResolvedValue({ saved: false, flow: null });

      const err = await saveCanvas(FLOW_ID, OTHER_ID, MINIMAL_CANVAS, 1).catch((e) => e);
      expect(err).toBeInstanceOf(OptimisticLockError);
    });
  });
});
