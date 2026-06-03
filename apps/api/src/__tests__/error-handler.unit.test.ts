/**
 * Unit tests for the centralized error handler (index.ts → errorHandler).
 *
 * T15 makes the handler additive-aware:
 *   - GateError subclasses → 422 with body { error, code, details }
 *   - RateLimitedError     → 429 with a Retry-After header (seconds) + { error, code, details }
 *   - OptimisticLockError  → 409
 *   - existing typed errors keep their bare { error } body (no regression)
 */
import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

import { errorHandler } from '@/index.js';
import {
  ValidationError,
  NotFoundError,
  OptimisticLockError,
  RequiredInputMissingError,
  ExclusivityViolationError,
  AssetMissingError,
  ContentInvalidError,
  RateLimitedError,
} from '@/lib/errors.js';

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

describe('errorHandler', () => {
  it('maps a GateError subclass to 422 with { error, code, details }', () => {
    const { res, status, json } = makeRes();
    const err = new RequiredInputMissingError('Connect a text input before generating.', {
      blockId: 'block-bbb',
      input: 'prompt',
    });

    errorHandler(err, req, res, next);

    expect(status).toHaveBeenCalledWith(422);
    expect(json).toHaveBeenCalledWith({
      error: 'Connect a text input before generating.',
      code: 'flow.required_input_missing',
      details: { blockId: 'block-bbb', input: 'prompt' },
    });
  });

  it.each([
    ['exclusivity', () => new ExclusivityViolationError('x', { exclusiveGroup: 'g', provided: [] }), 'flow.exclusivity_violation'],
    ['asset', () => new AssetMissingError('x', { blockId: 'b' }), 'flow.asset_missing'],
    ['content', () => new ContentInvalidError('x', { blockId: 'b', reason: 'empty' }), 'flow.content_invalid'],
  ])('maps the %s gate error to 422 with its code', (_label, mk, code) => {
    const { res, status, json } = makeRes();
    errorHandler(mk(), req, res, next);
    expect(status).toHaveBeenCalledWith(422);
    expect(json.mock.calls[0]![0]).toMatchObject({ code });
  });

  it('maps RateLimitedError to 429 with a Retry-After header + body code/details', () => {
    const { res, status, json, setHeader } = makeRes();
    const err = new RateLimitedError('Too many generations.', 42, { limitPerMinute: 30 });

    errorHandler(err, req, res, next);

    expect(setHeader).toHaveBeenCalledWith('Retry-After', '42');
    expect(status).toHaveBeenCalledWith(429);
    expect(json).toHaveBeenCalledWith({
      error: 'Too many generations.',
      code: 'flow.rate_limited',
      details: { limitPerMinute: 30 },
    });
  });

  it('maps OptimisticLockError to 409', () => {
    const { res, status } = makeRes();
    errorHandler(new OptimisticLockError('stale'), req, res, next);
    expect(status).toHaveBeenCalledWith(409);
  });

  it('keeps a bare { error } body for existing typed errors (no regression)', () => {
    const { res, status, json } = makeRes();
    errorHandler(new NotFoundError('Flow not found.'), req, res, next);
    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({ error: 'Flow not found.' });
  });

  it('maps a ValidationError to 400 with a bare { error } body', () => {
    const { res, status, json } = makeRes();
    errorHandler(new ValidationError('bad'), req, res, next);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({ error: 'bad' });
  });

  it('maps an unknown error to a 500 without leaking details', () => {
    const { res, status, json } = makeRes();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    errorHandler(new Error('boom'), req, res, next);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({ error: 'Internal server error' });
    spy.mockRestore();
  });
});
