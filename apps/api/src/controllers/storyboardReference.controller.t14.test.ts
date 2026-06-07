/**
 * Controller tests for storyboardReference.controller.ts (T14).
 *
 * Level: unit (handlers called directly, services mocked).
 * Precedent: apps/api/src/controllers/storyboardReference.controller.test.ts (T13)
 *
 * ACs covered:
 *   AC-04  — POST .../blocks/{blockId}/retry returns 202 { blockId, windowStatus:'pending' }
 *            on success; 409 references.block_not_failed when not in 'failed' state
 *   AC-06  — PUT  .../blocks/{blockId}/stars/{fileId} returns 200 BlockStarsState; idempotent
 *            DELETE .../blocks/{blockId}/stars/{fileId} returns 200 BlockStarsState
 *   AC-10  — PUT  .../blocks/{blockId}/scene-links returns 200 { sceneBlockIds, version }
 *            on success; 409 references.version_conflict on stale version
 *   AC-11  — POST .../blocks returns 201 ReferenceBlock (manual add, windowStatus null);
 *            GET  .../blocks returns 200 ReferenceBlockList
 *   AC-13  — non-owner on each endpoint → next(NotFoundError) — existence hiding
 *   AC-14  — DELETE .../blocks/{blockId} returns 204; flow survives (tested at service layer;
 *            here we verify the controller routes the call and returns 204)
 *
 * Status-code / response-shape assertions are derived directly from
 * docs/features/storyboard-reference-flows/contracts/openapi.yaml.
 *
 * Run:
 *   cd apps/api && APP_DB_PASSWORD=cliptale APP_REDIS_URL=redis://localhost:6380 \
 *     npx vitest run src/controllers/storyboardReference.controller.t14.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

import { NotFoundError, ValidationError, ConflictError } from '@/lib/errors.js';

// ── Hoisted service mocks ─────────────────────────────────────────────────────

const mockBlocksService = vi.hoisted(() => ({
  listBlocks: vi.fn(),
  createBlock: vi.fn(),
  updateBlock: vi.fn(),
  deleteBlock: vi.fn(),
  retryBlock: vi.fn(),
  saveSceneLinks: vi.fn(),
}));

const mockStarsService = vi.hoisted(() => ({
  starResult: vi.fn(),
  unstarResult: vi.fn(),
}));

vi.mock('@/services/storyboardReference.blocks.service.js', () => mockBlocksService);
vi.mock('@/services/storyboardReference.stars.service.js', () => mockStarsService);

// Import handlers AFTER mocking.
// These are the NEW handlers added in T14 — they do not exist yet in the controller.
import {
  listReferenceBlocks,
  createReferenceBlock,
  updateReferenceBlock,
  deleteReferenceBlock,
  retryReferenceBlockGeneration,
  saveSceneLinks,
  starReferenceResult,
  unstarReferenceResult,
} from './storyboardReference.controller.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const USER = { userId: 'user-t14-001', email: 'creator-t14@example.test', displayName: 'Creator' };
const DRAFT_ID   = '22222222-2222-4222-8222-222222222222';
const BLOCK_ID   = '55555555-5555-4555-8555-555555555555';
const FILE_ID    = '77777777-7777-4777-8777-777777777777';
const FLOW_ID    = '66666666-6666-4666-8666-666666666666';
const SCENE_ID   = '44444444-4444-4444-8444-444444444444';
const IDEM       = '99999999-9999-4999-8999-999999999999';

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

/** Minimal ReferenceBlock wire shape (openapi.yaml#/components/schemas/ReferenceBlock). */
const BLOCK_FIXTURE = {
  id: BLOCK_ID,
  blockId: BLOCK_ID,
  draftId: DRAFT_ID,
  flowId: FLOW_ID,
  castType: 'character' as const,
  name: 'Test Character',
  description: 'A test protagonist.',
  sortOrder: 0,
  positionX: 0,
  positionY: 0,
  windowStatus: null,
  errorMessage: null,
  version: 1,
  sceneBlockIds: [],
  stars: [],
  previewFileId: null,
  createdAt: new Date('2026-06-07T13:00:00Z'),
  updatedAt: new Date('2026-06-07T13:00:00Z'),
};

/** Minimal BlockStarsState wire shape (openapi.yaml#/components/schemas/BlockStarsState). */
const STARS_STATE_FIXTURE = {
  blockId: BLOCK_ID,
  stars: [
    {
      fileId: FILE_ID,
      isPrimary: true,
      createdAt: '2026-06-07T12:30:00.000Z',
    },
  ],
  previewFileId: FILE_ID,
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// listReferenceBlocks — GET /storyboards/:draftId/references/blocks
// ─────────────────────────────────────────────────────────────────────────────

describe('listReferenceBlocks handler (GET .../references/blocks)', () => {
  it('AC-11 — returns 200 ReferenceBlockList { items: [...] } when service succeeds', async () => {
    mockBlocksService.listBlocks.mockResolvedValueOnce([BLOCK_FIXTURE]);
    const req = makeReq({ params: { draftId: DRAFT_ID } });
    const { res, json } = makeRes();
    const next = makeNext();

    await listReferenceBlocks(req, res, next);

    expect(mockBlocksService.listBlocks).toHaveBeenCalledWith(USER.userId, DRAFT_ID);
    // Response must be { items: [...] } — ReferenceBlockList (openapi.yaml).
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({ blockId: BLOCK_ID }),
        ]),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('AC-11 — returns 200 with items:[] when draft has no blocks yet', async () => {
    mockBlocksService.listBlocks.mockResolvedValueOnce([]);
    const req = makeReq({ params: { draftId: DRAFT_ID } });
    const { res, json } = makeRes();
    const next = makeNext();

    await listReferenceBlocks(req, res, next);

    expect(json).toHaveBeenCalledWith(expect.objectContaining({ items: [] }));
    expect(next).not.toHaveBeenCalled();
  });

  it('AC-13 — non-owner: NotFoundError forwarded to next() (existence hiding)', async () => {
    const err = new NotFoundError('Draft not found.');
    mockBlocksService.listBlocks.mockRejectedValueOnce(err);
    const req = makeReq({ params: { draftId: DRAFT_ID } });
    const { res } = makeRes();
    const next = makeNext();

    await listReferenceBlocks(req, res, next);

    expect(next).toHaveBeenCalledWith(err);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createReferenceBlock — POST /storyboards/:draftId/references/blocks
// ─────────────────────────────────────────────────────────────────────────────

describe('createReferenceBlock handler (POST .../references/blocks)', () => {
  function makeCreateReq(overrides: Partial<Parameters<typeof makeReq>[0]> = {}) {
    return makeReq({
      params: { draftId: DRAFT_ID },
      body: {
        castType: 'environment',
        name: 'Test Environment',
        description: 'A test location.',
      },
      ...overrides,
    });
  }

  it('AC-11 — returns 201 ReferenceBlock with windowStatus:null when service succeeds', async () => {
    const block = { ...BLOCK_FIXTURE, castType: 'environment' as const, name: 'Test Environment', windowStatus: null };
    mockBlocksService.createBlock.mockResolvedValueOnce(block);
    const req = makeCreateReq();
    const { res, status, json } = makeRes();
    const next = makeNext();

    await createReferenceBlock(req, res, next);

    expect(mockBlocksService.createBlock).toHaveBeenCalledWith(
      expect.objectContaining({
        draftId: DRAFT_ID,
        userId: USER.userId,
        castType: 'environment',
        name: 'Test Environment',
      }),
    );
    expect(status).toHaveBeenCalledWith(201);
    // Response body must be a single ReferenceBlock (not wrapped in { items }).
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        blockId: expect.any(String),
        windowStatus: null,
        flowId: expect.any(String),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('AC-11 — validates: missing castType → ValidationError forwarded to next()', async () => {
    const req = makeCreateReq({
      body: { name: 'Test Environment' }, // castType missing
    });
    const { res } = makeRes();
    const next = makeNext();

    await createReferenceBlock(req, res, next);

    expect(mockBlocksService.createBlock).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0]![0]).toBeInstanceOf(ValidationError);
  });

  it('AC-11 — validates: missing name → ValidationError forwarded to next()', async () => {
    const req = makeCreateReq({
      body: { castType: 'character' }, // name missing
    });
    const { res } = makeRes();
    const next = makeNext();

    await createReferenceBlock(req, res, next);

    expect(mockBlocksService.createBlock).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0]![0]).toBeInstanceOf(ValidationError);
  });

  it('AC-11 — validates: invalid castType value → ValidationError forwarded to next()', async () => {
    const req = makeCreateReq({
      body: { castType: 'unknown_type', name: 'Test' },
    });
    const { res } = makeRes();
    const next = makeNext();

    await createReferenceBlock(req, res, next);

    expect(mockBlocksService.createBlock).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0]![0]).toBeInstanceOf(ValidationError);
  });

  it('AC-13 — non-owner: NotFoundError forwarded to next()', async () => {
    const err = new NotFoundError('Draft not found.');
    mockBlocksService.createBlock.mockRejectedValueOnce(err);
    const req = makeCreateReq();
    const { res } = makeRes();
    const next = makeNext();

    await createReferenceBlock(req, res, next);

    expect(next).toHaveBeenCalledWith(err);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// updateReferenceBlock — PATCH /storyboards/:draftId/references/blocks/:blockId
// ─────────────────────────────────────────────────────────────────────────────

describe('updateReferenceBlock handler (PATCH .../references/blocks/:blockId)', () => {
  function makeUpdateReq(overrides: Partial<Parameters<typeof makeReq>[0]> = {}) {
    return makeReq({
      params: { draftId: DRAFT_ID, blockId: BLOCK_ID },
      body: { positionX: 240.5, positionY: 96 },
      ...overrides,
    });
  }

  it('AC-14(move) — returns 200 ReferenceBlock with updated position when service succeeds', async () => {
    const updated = { ...BLOCK_FIXTURE, positionX: 240.5, positionY: 96 };
    mockBlocksService.updateBlock.mockResolvedValueOnce(updated);
    const req = makeUpdateReq();
    const { res, json } = makeRes();
    const next = makeNext();

    await updateReferenceBlock(req, res, next);

    expect(mockBlocksService.updateBlock).toHaveBeenCalledWith(
      expect.objectContaining({
        blockId: BLOCK_ID,
        draftId: DRAFT_ID,
        userId: USER.userId,
        positionX: 240.5,
        positionY: 96,
      }),
    );
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        positionX: 240.5,
        positionY: 96,
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('validates: missing positionX → ValidationError forwarded to next()', async () => {
    const req = makeUpdateReq({
      body: { positionY: 96 }, // positionX missing
    });
    const { res } = makeRes();
    const next = makeNext();

    await updateReferenceBlock(req, res, next);

    expect(mockBlocksService.updateBlock).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0]![0]).toBeInstanceOf(ValidationError);
  });

  it('validates: missing positionY → ValidationError forwarded to next()', async () => {
    const req = makeUpdateReq({
      body: { positionX: 100 }, // positionY missing
    });
    const { res } = makeRes();
    const next = makeNext();

    await updateReferenceBlock(req, res, next);

    expect(mockBlocksService.updateBlock).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0]![0]).toBeInstanceOf(ValidationError);
  });

  it('AC-13 — non-owner: NotFoundError forwarded to next()', async () => {
    const err = new NotFoundError('Reference block not found.');
    mockBlocksService.updateBlock.mockRejectedValueOnce(err);
    const req = makeUpdateReq();
    const { res } = makeRes();
    const next = makeNext();

    await updateReferenceBlock(req, res, next);

    expect(next).toHaveBeenCalledWith(err);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// deleteReferenceBlock — DELETE /storyboards/:draftId/references/blocks/:blockId
// ─────────────────────────────────────────────────────────────────────────────

describe('deleteReferenceBlock handler (DELETE .../references/blocks/:blockId)', () => {
  function makeDeleteReq(overrides: Partial<Parameters<typeof makeReq>[0]> = {}) {
    return makeReq({
      params: { draftId: DRAFT_ID, blockId: BLOCK_ID },
      ...overrides,
    });
  }

  it('AC-14 — returns 204 No Content when service succeeds', async () => {
    mockBlocksService.deleteBlock.mockResolvedValueOnce(undefined);
    const req = makeDeleteReq();
    const { res, status, end } = makeRes();
    const next = makeNext();

    await deleteReferenceBlock(req, res, next);

    expect(mockBlocksService.deleteBlock).toHaveBeenCalledWith(
      expect.objectContaining({
        blockId: BLOCK_ID,
        draftId: DRAFT_ID,
        userId: USER.userId,
      }),
    );
    expect(status).toHaveBeenCalledWith(204);
    expect(end).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('AC-13 — non-owner: NotFoundError forwarded to next() (existence hiding)', async () => {
    const err = new NotFoundError('Reference block not found.');
    mockBlocksService.deleteBlock.mockRejectedValueOnce(err);
    const req = makeDeleteReq();
    const { res } = makeRes();
    const next = makeNext();

    await deleteReferenceBlock(req, res, next);

    expect(next).toHaveBeenCalledWith(err);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// retryReferenceBlockGeneration — POST .../blocks/:blockId/retry
// ─────────────────────────────────────────────────────────────────────────────

describe('retryReferenceBlockGeneration handler (POST .../blocks/:blockId/retry)', () => {
  function makeRetryReq(overrides: Partial<Parameters<typeof makeReq>[0]> = {}) {
    return makeReq({
      params: { draftId: DRAFT_ID, blockId: BLOCK_ID },
      headers: { 'Idempotency-Key': IDEM },
      ...overrides,
    });
  }

  it('AC-04 — returns 202 { blockId, windowStatus:"pending" } when service succeeds', async () => {
    const retried = { ...BLOCK_FIXTURE, id: BLOCK_ID, windowStatus: 'pending' as const };
    mockBlocksService.retryBlock.mockResolvedValueOnce(retried);
    const req = makeRetryReq();
    const { res, status, json } = makeRes();
    const next = makeNext();

    await retryReferenceBlockGeneration(req, res, next);

    expect(mockBlocksService.retryBlock).toHaveBeenCalledWith(
      expect.objectContaining({
        blockId: BLOCK_ID,
        draftId: DRAFT_ID,
        userId: USER.userId,
      }),
    );
    expect(status).toHaveBeenCalledWith(202);
    // Response must be RetryAccepted (openapi.yaml): { blockId, windowStatus:'pending' }.
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        blockId: BLOCK_ID,
        windowStatus: 'pending',
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('AC-04 — returns 409 references.block_not_failed when block is not in failed state', async () => {
    // The service throws ConflictError when windowStatus is not 'failed'.
    const err = new ConflictError(
      "This block's generation is not failed — there is nothing to retry.",
    );
    mockBlocksService.retryBlock.mockRejectedValueOnce(err);
    const req = makeRetryReq();
    const { res, status, json } = makeRes();
    const next = makeNext();

    await retryReferenceBlockGeneration(req, res, next);

    expect(status).toHaveBeenCalledWith(409);
    // Must include { error, code:'references.block_not_failed' } per openapi.yaml.
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.any(String),
        code: 'references.block_not_failed',
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('validates: missing Idempotency-Key header → ValidationError forwarded to next()', async () => {
    const req = makeRetryReq({ headers: {} });
    const { res } = makeRes();
    const next = makeNext();

    await retryReferenceBlockGeneration(req, res, next);

    expect(mockBlocksService.retryBlock).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0]![0]).toBeInstanceOf(ValidationError);
  });

  it('AC-13 — non-owner: NotFoundError forwarded to next()', async () => {
    const err = new NotFoundError('Reference block not found.');
    mockBlocksService.retryBlock.mockRejectedValueOnce(err);
    const req = makeRetryReq();
    const { res } = makeRes();
    const next = makeNext();

    await retryReferenceBlockGeneration(req, res, next);

    expect(next).toHaveBeenCalledWith(err);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// saveSceneLinks — PUT .../blocks/:blockId/scene-links
// ─────────────────────────────────────────────────────────────────────────────

describe('saveSceneLinks handler (PUT .../blocks/:blockId/scene-links)', () => {
  function makeLinksReq(overrides: Partial<Parameters<typeof makeReq>[0]> = {}) {
    return makeReq({
      params: { draftId: DRAFT_ID, blockId: BLOCK_ID },
      body: { sceneBlockIds: [SCENE_ID], version: 3 },
      ...overrides,
    });
  }

  it('AC-10 — returns 200 { sceneBlockIds, version } when service succeeds', async () => {
    mockBlocksService.saveSceneLinks.mockResolvedValueOnce({
      sceneBlockIds: [SCENE_ID],
      version: 4,
    });
    const req = makeLinksReq();
    const { res, json } = makeRes();
    const next = makeNext();

    await saveSceneLinks(req, res, next);

    expect(mockBlocksService.saveSceneLinks).toHaveBeenCalledWith(
      expect.objectContaining({
        blockId: BLOCK_ID,
        draftId: DRAFT_ID,
        userId: USER.userId,
        sceneBlockIds: [SCENE_ID],
        version: 3,
      }),
    );
    // Response must match SceneLinksSaveResponse (openapi.yaml).
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        sceneBlockIds: [SCENE_ID],
        version: 4,
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('AC-10 — returns 409 references.version_conflict on stale version (reload prompt)', async () => {
    const err = new ConflictError('version_conflict: block version has changed; reload and retry');
    mockBlocksService.saveSceneLinks.mockRejectedValueOnce(err);
    const req = makeLinksReq();
    const { res, status, json } = makeRes();
    const next = makeNext();

    await saveSceneLinks(req, res, next);

    expect(status).toHaveBeenCalledWith(409);
    // Must include { error, code:'references.version_conflict' } per openapi.yaml.
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.any(String),
        code: 'references.version_conflict',
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('validates: missing sceneBlockIds → ValidationError forwarded to next()', async () => {
    const req = makeLinksReq({ body: { version: 3 } });
    const { res } = makeRes();
    const next = makeNext();

    await saveSceneLinks(req, res, next);

    expect(mockBlocksService.saveSceneLinks).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0]![0]).toBeInstanceOf(ValidationError);
  });

  it('validates: missing version → ValidationError forwarded to next()', async () => {
    const req = makeLinksReq({ body: { sceneBlockIds: [SCENE_ID] } });
    const { res } = makeRes();
    const next = makeNext();

    await saveSceneLinks(req, res, next);

    expect(mockBlocksService.saveSceneLinks).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0]![0]).toBeInstanceOf(ValidationError);
  });

  it('validates: version < 1 → ValidationError forwarded to next()', async () => {
    const req = makeLinksReq({ body: { sceneBlockIds: [], version: 0 } });
    const { res } = makeRes();
    const next = makeNext();

    await saveSceneLinks(req, res, next);

    expect(mockBlocksService.saveSceneLinks).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0]![0]).toBeInstanceOf(ValidationError);
  });

  it('AC-13 — non-owner: NotFoundError forwarded to next()', async () => {
    const err = new NotFoundError('Reference block not found.');
    mockBlocksService.saveSceneLinks.mockRejectedValueOnce(err);
    const req = makeLinksReq();
    const { res } = makeRes();
    const next = makeNext();

    await saveSceneLinks(req, res, next);

    expect(next).toHaveBeenCalledWith(err);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// starReferenceResult — PUT .../blocks/:blockId/stars/:fileId
// ─────────────────────────────────────────────────────────────────────────────

describe('starReferenceResult handler (PUT .../blocks/:blockId/stars/:fileId)', () => {
  function makeStarReq(overrides: Partial<Parameters<typeof makeReq>[0]> = {}) {
    return makeReq({
      params: { draftId: DRAFT_ID, blockId: BLOCK_ID, fileId: FILE_ID },
      body: { isPrimary: true },
      ...overrides,
    });
  }

  it('AC-06 — returns 200 BlockStarsState { blockId, stars, previewFileId } when service succeeds', async () => {
    mockStarsService.starResult.mockResolvedValueOnce(STARS_STATE_FIXTURE);
    const req = makeStarReq();
    const { res, json } = makeRes();
    const next = makeNext();

    await starReferenceResult(req, res, next);

    expect(mockStarsService.starResult).toHaveBeenCalledWith(
      expect.objectContaining({
        blockId: BLOCK_ID,
        draftId: DRAFT_ID,
        userId: USER.userId,
        fileId: FILE_ID,
        isPrimary: true,
      }),
    );
    // Response must be BlockStarsState (openapi.yaml): { blockId, stars, previewFileId }.
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        blockId: BLOCK_ID,
        stars: expect.arrayContaining([
          expect.objectContaining({ fileId: FILE_ID, isPrimary: true }),
        ]),
        previewFileId: FILE_ID,
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('AC-06 — star without isPrimary body → defaults isPrimary to false', async () => {
    // Body may be omitted entirely (requestBody required:false per openapi.yaml).
    mockStarsService.starResult.mockResolvedValueOnce({
      ...STARS_STATE_FIXTURE,
      stars: [{ ...STARS_STATE_FIXTURE.stars[0], isPrimary: false }],
      previewFileId: null,
    });
    const req = makeStarReq({ body: {} }); // no isPrimary
    const { res } = makeRes();
    const next = makeNext();

    await starReferenceResult(req, res, next);

    expect(mockStarsService.starResult).toHaveBeenCalledWith(
      expect.objectContaining({
        isPrimary: false,
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('AC-13 — non-owner: NotFoundError forwarded to next()', async () => {
    const err = new NotFoundError('Reference block not found.');
    mockStarsService.starResult.mockRejectedValueOnce(err);
    const req = makeStarReq();
    const { res } = makeRes();
    const next = makeNext();

    await starReferenceResult(req, res, next);

    expect(next).toHaveBeenCalledWith(err);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// unstarReferenceResult — DELETE .../blocks/:blockId/stars/:fileId
// ─────────────────────────────────────────────────────────────────────────────

describe('unstarReferenceResult handler (DELETE .../blocks/:blockId/stars/:fileId)', () => {
  function makeUnstarReq(overrides: Partial<Parameters<typeof makeReq>[0]> = {}) {
    return makeReq({
      params: { draftId: DRAFT_ID, blockId: BLOCK_ID, fileId: FILE_ID },
      ...overrides,
    });
  }

  it('AC-06 — returns 200 BlockStarsState with empty stars and null previewFileId', async () => {
    const emptyState = { blockId: BLOCK_ID, stars: [], previewFileId: null };
    mockStarsService.unstarResult.mockResolvedValueOnce(emptyState);
    const req = makeUnstarReq();
    const { res, json } = makeRes();
    const next = makeNext();

    await unstarReferenceResult(req, res, next);

    expect(mockStarsService.unstarResult).toHaveBeenCalledWith(
      expect.objectContaining({
        blockId: BLOCK_ID,
        draftId: DRAFT_ID,
        userId: USER.userId,
        fileId: FILE_ID,
      }),
    );
    // Response per openapi.yaml: { blockId, stars:[], previewFileId:null }.
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        blockId: BLOCK_ID,
        stars: [],
        previewFileId: null,
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('AC-06/AC-07 — un-starring when another star exists → previewFileId falls back to remaining star', async () => {
    // The fallback logic lives in the service; the controller just passes through the response.
    const OTHER_FILE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const fallbackState = {
      blockId: BLOCK_ID,
      stars: [{ fileId: OTHER_FILE, isPrimary: true, createdAt: '2026-06-07T12:20:00.000Z' }],
      previewFileId: OTHER_FILE,
    };
    mockStarsService.unstarResult.mockResolvedValueOnce(fallbackState);
    const req = makeUnstarReq();
    const { res, json } = makeRes();
    const next = makeNext();

    await unstarReferenceResult(req, res, next);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        previewFileId: OTHER_FILE,
        stars: expect.arrayContaining([
          expect.objectContaining({ fileId: OTHER_FILE }),
        ]),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('AC-13 — non-owner: NotFoundError forwarded to next()', async () => {
    const err = new NotFoundError('Reference block not found.');
    mockStarsService.unstarResult.mockRejectedValueOnce(err);
    const req = makeUnstarReq();
    const { res } = makeRes();
    const next = makeNext();

    await unstarReferenceResult(req, res, next);

    expect(next).toHaveBeenCalledWith(err);
  });
});
