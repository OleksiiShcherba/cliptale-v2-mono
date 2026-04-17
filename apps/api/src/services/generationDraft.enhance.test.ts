import { describe, it, expect, vi, beforeEach } from 'vitest';

import * as generationDraftRepository from '@/repositories/generationDraft.repository.js';
import { ForbiddenError, NotFoundError } from '@/lib/errors.js';
import { startEnhance, getEnhanceStatus } from './generationDraft.service.js';
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
}));

// Mock the BullMQ queue used in getEnhanceStatus.
const { mockGetJob } = vi.hoisted(() => ({
  mockGetJob: vi.fn(),
}));

vi.mock('@/queues/bullmq.js', () => ({
  aiEnhanceQueue: {
    getJob: mockGetJob,
  },
}));

// Mock the enqueue helper used in startEnhance.
const { mockEnqueueEnhancePrompt } = vi.hoisted(() => ({
  mockEnqueueEnhancePrompt: vi.fn(),
}));

vi.mock('@/queues/jobs/enqueue-enhance-prompt.js', () => ({
  enqueueEnhancePrompt: mockEnqueueEnhancePrompt,
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('generationDraft.service — enhance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── startEnhance ─────────────────────────────────────────────────────────

  describe('startEnhance', () => {
    it('should enqueue an enhance job and return the jobId when draft is owned by user', async () => {
      const draft = makeDraft();
      vi.mocked(generationDraftRepository.findDraftById).mockResolvedValue(draft);
      mockEnqueueEnhancePrompt.mockResolvedValue('job-uuid-1');

      const result = await startEnhance(USER_ID, DRAFT_ID);

      expect(mockEnqueueEnhancePrompt).toHaveBeenCalledWith({
        draftId: DRAFT_ID,
        userId: USER_ID,
        promptDoc: draft.promptDoc,
      });
      expect(result).toEqual({ jobId: 'job-uuid-1' });
    });

    it('should throw NotFoundError (404) when draft does not exist', async () => {
      vi.mocked(generationDraftRepository.findDraftById).mockResolvedValue(null);

      await expect(startEnhance(USER_ID, DRAFT_ID)).rejects.toThrow(NotFoundError);
      expect(mockEnqueueEnhancePrompt).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenError (403) when draft belongs to another user', async () => {
      const draft = makeDraft({ userId: OTHER_USER_ID });
      vi.mocked(generationDraftRepository.findDraftById).mockResolvedValue(draft);

      await expect(startEnhance(USER_ID, DRAFT_ID)).rejects.toThrow(ForbiddenError);
      expect(mockEnqueueEnhancePrompt).not.toHaveBeenCalled();
    });
  });

  // ── getEnhanceStatus ──────────────────────────────────────────────────────

  describe('getEnhanceStatus', () => {
    const JOB_ID = 'enhance-job-uuid-42';

    function makeJob(overrides: { state?: string; returnvalue?: unknown; failedReason?: string }) {
      return {
        getState: vi.fn().mockResolvedValue(overrides.state ?? 'waiting'),
        returnvalue: overrides.returnvalue,
        failedReason: overrides.failedReason,
      };
    }

    beforeEach(() => {
      // Default: draft exists and is owned by USER_ID.
      vi.mocked(generationDraftRepository.findDraftById).mockResolvedValue(makeDraft());
    });

    it('should return status=done with result when job state is completed', async () => {
      const job = makeJob({ state: 'completed', returnvalue: VALID_PROMPT_DOC });
      mockGetJob.mockResolvedValue(job);

      const result = await getEnhanceStatus(USER_ID, DRAFT_ID, JOB_ID);

      expect(result.status).toBe('done');
      expect(result.result).toEqual(VALID_PROMPT_DOC);
      expect(result.error).toBeUndefined();
    });

    it('should return status=running when job state is active', async () => {
      const job = makeJob({ state: 'active' });
      mockGetJob.mockResolvedValue(job);

      const result = await getEnhanceStatus(USER_ID, DRAFT_ID, JOB_ID);

      expect(result.status).toBe('running');
      expect(result.result).toBeUndefined();
    });

    it('should return status=queued when job state is waiting', async () => {
      const job = makeJob({ state: 'waiting' });
      mockGetJob.mockResolvedValue(job);

      const result = await getEnhanceStatus(USER_ID, DRAFT_ID, JOB_ID);

      expect(result.status).toBe('queued');
    });

    it('should return status=queued when job state is delayed', async () => {
      const job = makeJob({ state: 'delayed' });
      mockGetJob.mockResolvedValue(job);

      const result = await getEnhanceStatus(USER_ID, DRAFT_ID, JOB_ID);

      expect(result.status).toBe('queued');
    });

    it('should return status=failed with error when job state is failed and failedReason is set', async () => {
      const job = makeJob({ state: 'failed', failedReason: 'OpenAI API error' });
      mockGetJob.mockResolvedValue(job);

      const result = await getEnhanceStatus(USER_ID, DRAFT_ID, JOB_ID);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('OpenAI API error');
      expect(result.result).toBeUndefined();
    });

    it('should throw NotFoundError (404) when job is not found in the queue', async () => {
      mockGetJob.mockResolvedValue(null);

      await expect(getEnhanceStatus(USER_ID, DRAFT_ID, JOB_ID)).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError (404) when draft does not exist', async () => {
      vi.mocked(generationDraftRepository.findDraftById).mockResolvedValue(null);

      await expect(getEnhanceStatus(USER_ID, DRAFT_ID, JOB_ID)).rejects.toThrow(NotFoundError);
      expect(mockGetJob).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenError (403) when draft belongs to another user', async () => {
      vi.mocked(generationDraftRepository.findDraftById).mockResolvedValue(
        makeDraft({ userId: OTHER_USER_ID }),
      );

      await expect(getEnhanceStatus(USER_ID, DRAFT_ID, JOB_ID)).rejects.toThrow(ForbiddenError);
      expect(mockGetJob).not.toHaveBeenCalled();
    });
  });
});
