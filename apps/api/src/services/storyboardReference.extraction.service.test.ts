/**
 * Unit tests for storyboardReference.extraction.service.ts
 *
 * Covers T4 acceptance criteria:
 *   AC-01  — startExtraction creates a queued job row and enqueues a cast-extract job
 *   AC-01b — startExtraction on a draft that already has reference blocks throws a typed error
 *   AC-13  — non-owner on startExtraction / getExtraction receives not-found (no content leak)
 *
 * Test level: unit (mocked repositories + queue; no I/O).
 * Precedent: apps/api/src/services/generationDraft.storyboardPlan.service.test.ts
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NotFoundError } from '@/lib/errors.js';
import * as generationDraftRepository from '@/repositories/generationDraft.repository.js';
import * as storyboardReferenceRepository from '@/repositories/storyboardReference.repository.js';
import {
  startExtraction,
  getExtraction,
  CastAlreadyExtractedError,
} from './storyboardReference.extraction.service.js';
import {
  DRAFT_ID,
  OTHER_USER_ID,
  USER_ID,
  makeDraft,
} from './generationDraft.service.fixtures.js';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/repositories/generationDraft.repository.js', () => ({
  findDraftById: vi.fn(),
}));

vi.mock('@/repositories/storyboardReference.repository.js', () => ({
  createCastExtractionJob: vi.fn(),
  findLatestCastExtractionJobForDraft: vi.fn(),
  listReferenceBlocksByDraftId: vi.fn(),
}));

vi.mock('@/queues/jobs/enqueue-cast-extract.js', () => ({
  enqueueCastExtract: vi.fn(),
}));

vi.mock('@/lib/realtimePublisher.js', () => ({
  publishStoryboardStatusUpdated: vi.fn().mockResolvedValue(undefined),
}));

import { enqueueCastExtract } from '@/queues/jobs/enqueue-cast-extract.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const JOB_ID = '00000000-0000-4000-8000-000000000001';

function makeJob(overrides?: Partial<{
  id: string;
  draftId: string;
  userId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  proposalJson: unknown | null;
  aggregateEstimateCredits: string | null;
  errorMessage: string | null;
  completedAt: Date | null;
  failedAt: Date | null;
}>) {
  return {
    id: JOB_ID,
    draftId: DRAFT_ID,
    userId: USER_ID,
    status: 'queued' as const,
    proposalJson: null,
    aggregateEstimateCredits: null,
    errorMessage: null,
    completedAt: null,
    failedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('storyboardReference.extraction.service — startExtraction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // AC-01 — happy path: creates job row and enqueues
  it('creates a queued extraction job and enqueues a cast-extract job (AC-01)', async () => {
    vi.mocked(generationDraftRepository.findDraftById).mockResolvedValue(makeDraft());
    vi.mocked(storyboardReferenceRepository.listReferenceBlocksByDraftId).mockResolvedValue([]);
    vi.mocked(storyboardReferenceRepository.createCastExtractionJob).mockResolvedValue(
      makeJob({ status: 'queued' }),
    );
    vi.mocked(enqueueCastExtract).mockResolvedValue(undefined);

    const result = await startExtraction(USER_ID, DRAFT_ID);

    expect(result.status).toBe('queued');
    expect(result.jobId).toBeTruthy();

    // Job row must be persisted BEFORE the queue enqueue call.
    expect(storyboardReferenceRepository.createCastExtractionJob).toHaveBeenCalledWith(
      expect.objectContaining({ draftId: DRAFT_ID, userId: USER_ID }),
    );
    expect(enqueueCastExtract).toHaveBeenCalledWith(
      expect.objectContaining({ draftId: DRAFT_ID, userId: USER_ID }),
    );
    expect(
      vi.mocked(storyboardReferenceRepository.createCastExtractionJob).mock.invocationCallOrder[0],
    ).toBeLessThan(vi.mocked(enqueueCastExtract).mock.invocationCallOrder[0]!);
  });

  // AC-01b — edge: draft already has reference blocks → typed error
  it('throws CastAlreadyExtractedError when reference blocks already exist (AC-01b)', async () => {
    vi.mocked(generationDraftRepository.findDraftById).mockResolvedValue(makeDraft());
    vi.mocked(storyboardReferenceRepository.listReferenceBlocksByDraftId).mockResolvedValue([
      {
        id: 'block-01',
        draftId: DRAFT_ID,
        flowId: null,
        castType: 'character',
        name: 'Test Character',
        description: null,
        sortOrder: 0,
        positionX: 0,
        positionY: 0,
        windowStatus: null,
        firstJobId: null,
        errorMessage: null,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    await expect(startExtraction(USER_ID, DRAFT_ID)).rejects.toThrow(CastAlreadyExtractedError);

    // No job row created, no queue enqueue.
    expect(storyboardReferenceRepository.createCastExtractionJob).not.toHaveBeenCalled();
    expect(enqueueCastExtract).not.toHaveBeenCalled();
  });

  // AC-05 — idempotent: latest job is queued/running/completed → return existing, no second row
  it.each(['queued', 'running', 'completed'] as const)(
    'returns the existing job and inserts no second row when latest is %s (AC-05)',
    async (status) => {
      vi.mocked(generationDraftRepository.findDraftById).mockResolvedValue(makeDraft());
      vi.mocked(storyboardReferenceRepository.listReferenceBlocksByDraftId).mockResolvedValue([]);
      vi.mocked(
        storyboardReferenceRepository.findLatestCastExtractionJobForDraft,
      ).mockResolvedValue(makeJob({ id: 'existing-job-id', status }));

      const result = await startExtraction(USER_ID, DRAFT_ID);

      // Same job returned with its own status — no created/queued row.
      expect(result.jobId).toBe('existing-job-id');
      expect(result.status).toBe(status);
      expect(storyboardReferenceRepository.createCastExtractionJob).not.toHaveBeenCalled();
      expect(enqueueCastExtract).not.toHaveBeenCalled();
    },
  );

  // AC-07 — failed latest counts as not-existing → a fresh start is allowed
  it('creates a fresh queued job when the latest job is failed (AC-07)', async () => {
    vi.mocked(generationDraftRepository.findDraftById).mockResolvedValue(makeDraft());
    vi.mocked(storyboardReferenceRepository.listReferenceBlocksByDraftId).mockResolvedValue([]);
    vi.mocked(
      storyboardReferenceRepository.findLatestCastExtractionJobForDraft,
    ).mockResolvedValue(makeJob({ id: 'failed-job-id', status: 'failed' }));
    vi.mocked(storyboardReferenceRepository.createCastExtractionJob).mockResolvedValue(
      makeJob({ id: 'new-job-id', status: 'queued' }),
    );
    vi.mocked(enqueueCastExtract).mockResolvedValue(undefined);

    const result = await startExtraction(USER_ID, DRAFT_ID);

    expect(result.status).toBe('queued');
    expect(result.jobId).toBe('new-job-id');
    expect(storyboardReferenceRepository.createCastExtractionJob).toHaveBeenCalledTimes(1);
    expect(enqueueCastExtract).toHaveBeenCalledTimes(1);
  });

  // AC-01b — blocks guard still wins over the idempotent return (strict no-op)
  it('throws CastAlreadyExtractedError before consulting the latest job (AC-01b precedence)', async () => {
    vi.mocked(generationDraftRepository.findDraftById).mockResolvedValue(makeDraft());
    vi.mocked(storyboardReferenceRepository.listReferenceBlocksByDraftId).mockResolvedValue([
      {
        id: 'block-01',
        draftId: DRAFT_ID,
        flowId: null,
        castType: 'character',
        name: 'Test Character',
        description: null,
        sortOrder: 0,
        positionX: 0,
        positionY: 0,
        windowStatus: null,
        firstJobId: null,
        errorMessage: null,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    await expect(startExtraction(USER_ID, DRAFT_ID)).rejects.toThrow(CastAlreadyExtractedError);
    expect(
      storyboardReferenceRepository.findLatestCastExtractionJobForDraft,
    ).not.toHaveBeenCalled();
    expect(storyboardReferenceRepository.createCastExtractionJob).not.toHaveBeenCalled();
  });

  // AC-13 — non-owner on startExtraction → not-found (no content leak)
  it('throws NotFoundError for a missing draft without revealing existence (AC-13)', async () => {
    vi.mocked(generationDraftRepository.findDraftById).mockResolvedValue(null);

    await expect(startExtraction(USER_ID, DRAFT_ID)).rejects.toThrow(NotFoundError);
    // The implementation MUST consult findDraftById to discover the missing draft.
    expect(generationDraftRepository.findDraftById).toHaveBeenCalledWith(DRAFT_ID);
    expect(storyboardReferenceRepository.createCastExtractionJob).not.toHaveBeenCalled();
  });

  it('throws NotFoundError for a non-owner (AC-13 — denies without revealing contents)', async () => {
    vi.mocked(generationDraftRepository.findDraftById).mockResolvedValue(
      makeDraft({ userId: OTHER_USER_ID }),
    );

    await expect(startExtraction(USER_ID, DRAFT_ID)).rejects.toThrow(NotFoundError);
    // The implementation MUST consult findDraftById before denying.
    expect(generationDraftRepository.findDraftById).toHaveBeenCalledWith(DRAFT_ID);
    expect(storyboardReferenceRepository.listReferenceBlocksByDraftId).not.toHaveBeenCalled();
    expect(storyboardReferenceRepository.createCastExtractionJob).not.toHaveBeenCalled();
  });
});

describe('storyboardReference.extraction.service — getExtraction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // AC-01 — get returns proposal after completed
  it('returns proposal_json and aggregate_estimate_credits for a completed job (AC-01)', async () => {
    vi.mocked(generationDraftRepository.findDraftById).mockResolvedValue(makeDraft());
    const proposal = [{ type: 'character', name: 'Test Character', scene_block_ids: [] }];
    vi.mocked(storyboardReferenceRepository.findLatestCastExtractionJobForDraft).mockResolvedValue(
      makeJob({
        status: 'completed',
        proposalJson: proposal,
        aggregateEstimateCredits: '2.5000',
        completedAt: new Date(),
      }),
    );

    const result = await getExtraction(USER_ID, DRAFT_ID);

    expect(result.status).toBe('completed');
    expect(result.proposalJson).toEqual(proposal);
    expect(result.aggregateEstimateCredits).toBe('2.5000');
  });

  // AC-01 — get returns error_message after failed
  it('returns errorMessage for a failed job (AC-01)', async () => {
    vi.mocked(generationDraftRepository.findDraftById).mockResolvedValue(makeDraft());
    vi.mocked(storyboardReferenceRepository.findLatestCastExtractionJobForDraft).mockResolvedValue(
      makeJob({
        status: 'failed',
        errorMessage: 'LLM provider unavailable',
        failedAt: new Date(),
      }),
    );

    const result = await getExtraction(USER_ID, DRAFT_ID);

    expect(result.status).toBe('failed');
    expect(result.errorMessage).toBe('LLM provider unavailable');
  });

  // AC-13 — non-owner on getExtraction → not-found
  it('throws NotFoundError for a non-owner on getExtraction (AC-13)', async () => {
    vi.mocked(generationDraftRepository.findDraftById).mockResolvedValue(
      makeDraft({ userId: OTHER_USER_ID }),
    );

    await expect(getExtraction(USER_ID, DRAFT_ID)).rejects.toThrow(NotFoundError);
    // The implementation MUST consult findDraftById before denying.
    expect(generationDraftRepository.findDraftById).toHaveBeenCalledWith(DRAFT_ID);
    expect(storyboardReferenceRepository.findLatestCastExtractionJobForDraft).not.toHaveBeenCalled();
  });

  // AC-01 — getExtraction returns null when no job exists yet (reattach-fallback realtime)
  it('returns null when no extraction job exists yet for the draft (AC-01 reattach)', async () => {
    vi.mocked(generationDraftRepository.findDraftById).mockResolvedValue(makeDraft());
    vi.mocked(storyboardReferenceRepository.findLatestCastExtractionJobForDraft).mockResolvedValue(
      null,
    );

    const result = await getExtraction(USER_ID, DRAFT_ID);

    expect(result).toBeNull();
  });
});
