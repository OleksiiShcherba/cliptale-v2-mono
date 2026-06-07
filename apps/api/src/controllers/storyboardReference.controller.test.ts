/**
 * Controller tests for storyboardReference.controller.ts (T13).
 *
 * Level: unit (handlers called directly, services mocked).
 * Precedent: apps/api/src/controllers/generation-flow.controller.test.ts
 *
 * ACs covered:
 *   AC-01  — POST .../extract returns 202 { jobId, status:'queued' } on success
 *   AC-01b — POST .../extract returns 409 references.cast_already_confirmed when
 *            draft already has reference blocks
 *   AC-01b — POST .../extract returns 409 references.extraction_in_progress when
 *            an extraction job is already queued/running (openapi.yaml resolved gap)
 *   AC-03  — POST .../confirm returns 201 ReferenceBlockList (items[].windowStatus='pending')
 *   AC-03  — POST .../confirm returns 409 references.cast_already_confirmed when blocks exist
 *   AC-13  — non-owner on each endpoint → next(NotFoundError) — existence hiding
 *
 * Status-code / response-shape assertions are derived directly from
 * docs/features/storyboard-reference-flows/contracts/openapi.yaml.
 *
 * Run:
 *   cd apps/api && npx vitest run src/controllers/storyboardReference.controller.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

import { NotFoundError, ValidationError } from '@/lib/errors.js';

// ── Hoisted service mocks ─────────────────────────────────────────────────────

const mockExtractionService = vi.hoisted(() => ({
  startExtraction: vi.fn(),
  getExtraction: vi.fn(),
  CastAlreadyExtractedError: class CastAlreadyExtractedError extends Error {
    readonly statusCode = 409;
    constructor(message = 'Draft already has reference blocks') {
      super(message);
      this.name = 'CastAlreadyExtractedError';
    }
  },
}));

const mockConfirmService = vi.hoisted(() => ({
  confirmCast: vi.fn(),
}));

const mockBlocksService = vi.hoisted(() => ({
  listBlocks: vi.fn(),
}));

vi.mock('@/services/storyboardReference.extraction.service.js', () => mockExtractionService);
vi.mock('@/services/storyboardReference.confirm.service.js', () => mockConfirmService);
vi.mock('@/services/storyboardReference.blocks.service.js', () => mockBlocksService);

// Import handlers AFTER mocking
import {
  startCastExtraction,
  getCastExtraction,
  confirmCast,
} from './storyboardReference.controller.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const USER = { userId: 'user-srf-001', email: 'creator@example.test', displayName: 'Creator' };
const DRAFT_ID = '22222222-2222-4222-8222-222222222222';
const IDEM = '99999999-9999-4999-8999-999999999999';

function makeReq(
  opts: {
    params?: Record<string, string>;
    body?: unknown;
    query?: Record<string, string>;
    headers?: Record<string, string>;
  } = {},
): Request {
  const headers = opts.headers ?? {};
  const lookup = (name: string): string | undefined => {
    const lower = name.toLowerCase();
    const found = Object.keys(headers).find((k) => k.toLowerCase() === lower);
    return found ? headers[found] : undefined;
  };
  return {
    params: opts.params ?? {},
    body: opts.body ?? {},
    query: opts.query ?? {},
    headers,
    user: USER,
    get: vi.fn((name: string) =>
      name.toLowerCase() === 'host' ? 'localhost:3001' : lookup(name),
    ),
    header: vi.fn((name: string) => lookup(name)),
  } as unknown as Request;
}

function makeRes(): {
  res: Response;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
} {
  const end = vi.fn().mockReturnThis();
  const json = vi.fn().mockReturnThis();
  const status = vi.fn().mockReturnThis();
  status.mockReturnValue({ json, end });
  const res = { status, json, end } as unknown as Response;
  return { res, status, json, end };
}

function makeNext(): NextFunction {
  return vi.fn() as unknown as NextFunction;
}

// ── Shared fixtures ───────────────────────────────────────────────────────────

const EXTRACTION_ACCEPTED = {
  jobId: '11111111-1111-4111-8111-111111111111',
  status: 'queued' as const,
};

const CONFIRMED_BLOCKS = [
  {
    blockId: '55555555-5555-4555-8555-555555555555',
    flowId: '66666666-6666-4666-8666-666666666666',
    sortOrder: 0,
  },
];

function makeExtractReq(overrides: Partial<Parameters<typeof makeReq>[0]> = {}) {
  return makeReq({
    params: { draftId: DRAFT_ID },
    headers: { 'Idempotency-Key': IDEM },
    ...overrides,
  });
}

function makeConfirmReq(overrides: Partial<Parameters<typeof makeReq>[0]> = {}) {
  return makeReq({
    params: { draftId: DRAFT_ID },
    headers: { 'Idempotency-Key': IDEM },
    body: {
      entries: [
        {
          castType: 'character',
          name: 'Test Character',
          description: 'A test protagonist.',
          imageFileIds: [],
          sceneBlockIds: [],
        },
      ],
      acknowledgedAggregateCredits: 0.42,
    },
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── startCastExtraction ───────────────────────────────────────────────────────

describe('startCastExtraction handler (POST .../references/extract)', () => {
  it('AC-01 — returns 202 { jobId, status:"queued" } when service succeeds', async () => {
    mockExtractionService.startExtraction.mockResolvedValueOnce(EXTRACTION_ACCEPTED);
    const req = makeExtractReq();
    const { res, status, json } = makeRes();
    const next = makeNext();

    await startCastExtraction(req, res, next);

    expect(mockExtractionService.startExtraction).toHaveBeenCalledWith(
      USER.userId,
      DRAFT_ID,
    );
    expect(status).toHaveBeenCalledWith(202);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: EXTRACTION_ACCEPTED.jobId,
        status: 'queued',
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('AC-01b — returns 409 with code references.cast_already_confirmed when draft has blocks', async () => {
    const err = new mockExtractionService.CastAlreadyExtractedError();
    mockExtractionService.startExtraction.mockRejectedValueOnce(err);
    const req = makeExtractReq();
    const { res, status, json } = makeRes();
    const next = makeNext();

    await startCastExtraction(req, res, next);

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.any(String),
        code: 'references.cast_already_confirmed',
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('AC-01b(edge) — returns 409 with code references.extraction_in_progress when a job is already running', async () => {
    // ExtractionInProgressError is a new error type the controller must recognise
    // (resolved sequence gap, openapi.yaml 2026-06-07).
    const err = new Error('Cast extraction is already running for this draft.');
    (err as Error & { statusCode: number; code: string }).statusCode = 409;
    (err as Error & { statusCode: number; code: string }).code = 'references.extraction_in_progress';
    Object.defineProperty(err, 'name', { value: 'ExtractionInProgressError' });
    mockExtractionService.startExtraction.mockRejectedValueOnce(err);
    const req = makeExtractReq();
    const { res, status, json } = makeRes();
    const next = makeNext();

    await startCastExtraction(req, res, next);

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'references.extraction_in_progress',
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('AC-13 — non-owner: NotFoundError forwarded to next() (existence hiding)', async () => {
    const err = new NotFoundError('Draft not found.');
    mockExtractionService.startExtraction.mockRejectedValueOnce(err);
    const req = makeExtractReq();
    const { res } = makeRes();
    const next = makeNext();

    await startCastExtraction(req, res, next);

    expect(next).toHaveBeenCalledWith(err);
  });

  it('validates: missing Idempotency-Key header → ValidationError forwarded to next()', async () => {
    const req = makeExtractReq({ headers: {} });
    const { res } = makeRes();
    const next = makeNext();

    await startCastExtraction(req, res, next);

    expect(mockExtractionService.startExtraction).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0]![0]).toBeInstanceOf(ValidationError);
  });
});

// ── getCastExtraction ─────────────────────────────────────────────────────────

describe('getCastExtraction handler (GET .../references/extraction)', () => {
  it('AC-01 — returns 200 CastExtractionJob when service returns a job', async () => {
    const job = {
      jobId: '11111111-1111-4111-8111-111111111111',
      status: 'completed' as const,
      proposalJson: [
        {
          type: 'character',
          name: 'Test Character',
          description: 'A test protagonist.',
          image_file_ids: [],
          scene_block_ids: [],
          per_run_estimate: 0.42,
        },
      ],
      truncated: true,
      aggregateEstimateCredits: '0.4200',
      errorMessage: null,
      completedAt: new Date('2026-06-07T12:00:00Z'),
      failedAt: null,
      createdAt: new Date('2026-06-07T11:59:00Z'),
    };
    mockExtractionService.getExtraction.mockResolvedValueOnce(job);
    const req = makeReq({ params: { draftId: DRAFT_ID } });
    const { res, json } = makeRes();
    const next = makeNext();

    await getCastExtraction(req, res, next);

    expect(mockExtractionService.getExtraction).toHaveBeenCalledWith(USER.userId, DRAFT_ID);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: job.jobId,
        draftId: DRAFT_ID,
        status: 'completed',
        // F4: the controller must surface the truncation flag to the client.
        truncated: true,
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('AC-13 — no extraction found → 404 with code references.extraction_not_found', async () => {
    // Service returns null when no job exists for this draft (AC-13: existence hiding).
    mockExtractionService.getExtraction.mockResolvedValueOnce(null);
    const req = makeReq({ params: { draftId: DRAFT_ID } });
    const { res, status, json } = makeRes();
    const next = makeNext();

    await getCastExtraction(req, res, next);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'references.extraction_not_found',
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('AC-13 — non-owner: NotFoundError forwarded to next()', async () => {
    const err = new NotFoundError('Draft not found.');
    mockExtractionService.getExtraction.mockRejectedValueOnce(err);
    const req = makeReq({ params: { draftId: DRAFT_ID } });
    const { res } = makeRes();
    const next = makeNext();

    await getCastExtraction(req, res, next);

    expect(next).toHaveBeenCalledWith(err);
  });
});

// ── confirmCast ───────────────────────────────────────────────────────────────

describe('confirmCast handler (POST .../references/confirm)', () => {
  it('AC-03 — returns 201 ReferenceBlockList with items when service succeeds', async () => {
    mockConfirmService.confirmCast.mockResolvedValueOnce(CONFIRMED_BLOCKS);
    const req = makeConfirmReq();
    const { res, status, json } = makeRes();
    const next = makeNext();

    await confirmCast(req, res, next);

    expect(mockConfirmService.confirmCast).toHaveBeenCalledWith(
      expect.objectContaining({
        draftId: DRAFT_ID,
        userId: USER.userId,
        entries: expect.arrayContaining([
          expect.objectContaining({ castType: 'character', name: 'Test Character' }),
        ]),
        acknowledgedAggregateCredits: 0.42,
      }),
    );
    expect(status).toHaveBeenCalledWith(201);
    // Response must be { items: [...] } matching ReferenceBlockList (openapi.yaml).
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({ blockId: CONFIRMED_BLOCKS[0]!.blockId }),
        ]),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('AC-03 — 409 references.cast_already_confirmed when blocks already exist', async () => {
    const err = new mockExtractionService.CastAlreadyExtractedError();
    mockConfirmService.confirmCast.mockRejectedValueOnce(err);
    const req = makeConfirmReq();
    const { res, status, json } = makeRes();
    const next = makeNext();

    await confirmCast(req, res, next);

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'references.cast_already_confirmed',
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('AC-13 — non-owner: NotFoundError forwarded to next()', async () => {
    const err = new NotFoundError('Draft not found.');
    mockConfirmService.confirmCast.mockRejectedValueOnce(err);
    const req = makeConfirmReq();
    const { res } = makeRes();
    const next = makeNext();

    await confirmCast(req, res, next);

    expect(next).toHaveBeenCalledWith(err);
  });

  it('validates: missing entries → ValidationError forwarded to next()', async () => {
    const req = makeConfirmReq({
      body: { acknowledgedAggregateCredits: 0.42 }, // entries missing
    });
    const { res } = makeRes();
    const next = makeNext();

    await confirmCast(req, res, next);

    expect(mockConfirmService.confirmCast).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0]![0]).toBeInstanceOf(ValidationError);
  });

  it('validates: empty entries array → ValidationError forwarded to next()', async () => {
    const req = makeConfirmReq({
      body: { entries: [], acknowledgedAggregateCredits: 0.42 },
    });
    const { res } = makeRes();
    const next = makeNext();

    await confirmCast(req, res, next);

    expect(mockConfirmService.confirmCast).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0]![0]).toBeInstanceOf(ValidationError);
  });

  it('validates: missing acknowledgedAggregateCredits → ValidationError forwarded to next()', async () => {
    const req = makeConfirmReq({
      body: {
        entries: [{ castType: 'character', name: 'Test Character' }],
        // acknowledgedAggregateCredits missing
      },
    });
    const { res } = makeRes();
    const next = makeNext();

    await confirmCast(req, res, next);

    expect(mockConfirmService.confirmCast).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0]![0]).toBeInstanceOf(ValidationError);
  });

  it('validates: missing Idempotency-Key header → ValidationError forwarded to next()', async () => {
    const req = makeConfirmReq({ headers: {} });
    const { res } = makeRes();
    const next = makeNext();

    await confirmCast(req, res, next);

    expect(mockConfirmService.confirmCast).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0]![0]).toBeInstanceOf(ValidationError);
  });
});
