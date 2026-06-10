/**
 * T2 — ReferenceNotReadyError and UnlinkedScenesError (scene-generation-reference-gate)
 *
 * AC-02  — full-draft gate blocked: ≥1 reference block not ready → 422, code
 *          references.reference_gate_failed, details.blocks names every blocking block.
 * AC-03b — per-scene gate blocked: same error, same code, same details shape.
 * AC-04b — every-scene-must-be-linked rule broken → 422, code references.unlinked_scenes,
 *          details.scenes names every scene with no linked reference block.
 *
 * Wire shape asserted directly from contracts/openapi.yaml:
 *   { error: string, code: string, details: { blocks?: BlockingBlock[] } | { scenes?: UnlinkedScene[] } }
 *   BlockingBlock  = { blockId: string, name: string }
 *   UnlinkedScene  = { blockId: string, name: string | null }
 *
 * Test level: unit — class structure + central errorHandler mapping (same level as
 * apps/api/src/__tests__/error-handler.unit.test.ts, which is the established
 * convention for this error suite).
 */
import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

import { errorHandler } from '@/index.js';
import { ReferenceNotReadyError, UnlinkedScenesError } from '@/lib/errors.js';

// ── shared mock helpers (mirrors error-handler.unit.test.ts) ──────────────────

function makeRes(): {
  res: Response;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  setHeader: ReturnType<typeof vi.fn>;
} {
  const json = vi.fn().mockReturnThis();
  const setHeader = vi.fn().mockReturnThis();
  const status = vi.fn().mockReturnThis();
  status.mockReturnValue({ json });
  const res = { status, json, setHeader } as unknown as Response;
  return { res, status, json, setHeader };
}

const req = {} as Request;
const next = vi.fn() as unknown as NextFunction;

// ── sample fixture data matching openapi.yaml examples ────────────────────────

const BLOCKING_BLOCKS = [
  { blockId: '55555555-5555-4555-8555-555555555555', name: 'Test Character' },
  { blockId: '88888888-8888-4888-8888-888888888888', name: 'Test Environment' },
];

const UNLINKED_SCENES = [
  { blockId: '99999999-9999-4999-8999-999999999999', name: 'Test Scene' },
];

// ── ReferenceNotReadyError: class-level shape ─────────────────────────────────

describe('ReferenceNotReadyError — class shape (AC-02 / AC-03b)', () => {
  it('is an instance of Error', () => {
    const err = new ReferenceNotReadyError('msg', BLOCKING_BLOCKS);
    expect(err).toBeInstanceOf(Error);
  });

  it('has statusCode 422', () => {
    const err = new ReferenceNotReadyError('msg', BLOCKING_BLOCKS);
    expect(err.statusCode).toBe(422);
  });

  it('has code references.reference_gate_failed', () => {
    const err = new ReferenceNotReadyError('msg', BLOCKING_BLOCKS);
    expect(err.code).toBe('references.reference_gate_failed');
  });

  it('carries details.blocks with all blocking blocks', () => {
    const err = new ReferenceNotReadyError('msg', BLOCKING_BLOCKS);
    expect(err.details).toEqual({ blocks: BLOCKING_BLOCKS });
  });

  it('each blocking block has blockId and name (no extra fields — openapi additionalProperties: false)', () => {
    const err = new ReferenceNotReadyError('msg', BLOCKING_BLOCKS);
    const blocks = (err.details as { blocks: Array<{ blockId: string; name: string }> }).blocks;
    for (const block of blocks) {
      expect(Object.keys(block).sort()).toEqual(['blockId', 'name']);
    }
  });

  it('works with a single blocking block (AC-03b)', () => {
    const single = [{ blockId: '55555555-5555-4555-8555-555555555555', name: 'Test Character' }];
    const err = new ReferenceNotReadyError(
      '1 reference block linked to this scene has not finished generating: Test Character.',
      single,
    );
    expect(err.code).toBe('references.reference_gate_failed');
    expect((err.details as { blocks: typeof single }).blocks).toHaveLength(1);
    expect((err.details as { blocks: typeof single }).blocks[0]!.blockId).toBe(
      '55555555-5555-4555-8555-555555555555',
    );
  });
});

// ── UnlinkedScenesError: class-level shape ────────────────────────────────────

describe('UnlinkedScenesError — class shape (AC-04b)', () => {
  it('is an instance of Error', () => {
    const err = new UnlinkedScenesError('msg', UNLINKED_SCENES);
    expect(err).toBeInstanceOf(Error);
  });

  it('has statusCode 422', () => {
    const err = new UnlinkedScenesError('msg', UNLINKED_SCENES);
    expect(err.statusCode).toBe(422);
  });

  it('has code references.unlinked_scenes', () => {
    const err = new UnlinkedScenesError('msg', UNLINKED_SCENES);
    expect(err.code).toBe('references.unlinked_scenes');
  });

  it('carries details.scenes with all unlinked scenes', () => {
    const err = new UnlinkedScenesError('msg', UNLINKED_SCENES);
    expect(err.details).toEqual({ scenes: UNLINKED_SCENES });
  });

  it('scene entry name may be null (openapi schema: string | null)', () => {
    const withNull = [{ blockId: '99999999-9999-4999-8999-999999999999', name: null }];
    const err = new UnlinkedScenesError('msg', withNull);
    const scenes = (err.details as { scenes: typeof withNull }).scenes;
    expect(scenes[0]!.name).toBeNull();
  });

  it('each unlinked scene has blockId and name (no extra fields — openapi additionalProperties: false)', () => {
    const err = new UnlinkedScenesError('msg', UNLINKED_SCENES);
    const scenes = (err.details as { scenes: Array<{ blockId: string; name: string | null }> }).scenes;
    for (const scene of scenes) {
      expect(Object.keys(scene).sort()).toEqual(['blockId', 'name']);
    }
  });
});

// ── Central handler wire shape: ReferenceNotReadyError ────────────────────────

describe('errorHandler — ReferenceNotReadyError wire shape (AC-02)', () => {
  it('emits HTTP 422', () => {
    const { res, status } = makeRes();
    errorHandler(new ReferenceNotReadyError('msg', BLOCKING_BLOCKS), req, res, next);
    expect(status).toHaveBeenCalledWith(422);
  });

  it('body has error, code, details (openapi Error schema — error required, code + details additive)', () => {
    const { res, json } = makeRes();
    const msg =
      '2 reference blocks have not finished generating: Test Character, Test Environment. Finish, retry, or remove them before starting.';
    errorHandler(new ReferenceNotReadyError(msg, BLOCKING_BLOCKS), req, res, next);
    expect(json).toHaveBeenCalledWith({
      error: msg,
      code: 'references.reference_gate_failed',
      details: { blocks: BLOCKING_BLOCKS },
    });
  });

  it('details.blocks matches openapi example exactly (blockId + name per entry)', () => {
    const { res, json } = makeRes();
    errorHandler(new ReferenceNotReadyError('msg', BLOCKING_BLOCKS), req, res, next);
    const body: { details: { blocks: Array<{ blockId: string; name: string }> } } =
      json.mock.calls[0]![0] as never;
    expect(body.details.blocks).toEqual(BLOCKING_BLOCKS);
  });

  it('no Retry-After header is set (not a rate-limit)', () => {
    const { res, setHeader } = makeRes();
    errorHandler(new ReferenceNotReadyError('msg', BLOCKING_BLOCKS), req, res, next);
    expect(setHeader).not.toHaveBeenCalledWith('Retry-After', expect.anything());
  });
});

// ── Central handler wire shape: UnlinkedScenesError ──────────────────────────

describe('errorHandler — UnlinkedScenesError wire shape (AC-04b)', () => {
  it('emits HTTP 422', () => {
    const { res, status } = makeRes();
    errorHandler(new UnlinkedScenesError('msg', UNLINKED_SCENES), req, res, next);
    expect(status).toHaveBeenCalledWith(422);
  });

  it('body has error, code, details (openapi Error schema)', () => {
    const { res, json } = makeRes();
    const msg = '1 scene has no linked reference: Test Scene. Link a reference before starting.';
    errorHandler(new UnlinkedScenesError(msg, UNLINKED_SCENES), req, res, next);
    expect(json).toHaveBeenCalledWith({
      error: msg,
      code: 'references.unlinked_scenes',
      details: { scenes: UNLINKED_SCENES },
    });
  });

  it('details.scenes matches openapi example exactly (blockId + name per entry)', () => {
    const { res, json } = makeRes();
    errorHandler(new UnlinkedScenesError('msg', UNLINKED_SCENES), req, res, next);
    const body: { details: { scenes: Array<{ blockId: string; name: string | null }> } } =
      json.mock.calls[0]![0] as never;
    expect(body.details.scenes).toEqual(UNLINKED_SCENES);
  });
});
