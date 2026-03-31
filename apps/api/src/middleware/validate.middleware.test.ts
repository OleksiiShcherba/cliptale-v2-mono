import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import { validateBody } from './validate.middleware.js';

function mockRes(): Response {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res as unknown as Response;
}

function mockNext(): NextFunction {
  return vi.fn() as unknown as NextFunction;
}

const testSchema = z.object({
  name: z.string().min(1),
  age: z.number().int().positive(),
});

describe('validateBody', () => {
  describe('valid body', () => {
    it('calls next() with no arguments when body matches the schema', () => {
      const req = { body: { name: 'Alice', age: 30 } } as Request;
      const res = mockRes();
      const next = mockNext();

      validateBody(testSchema)(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('replaces req.body with the parsed (coerced) data from Zod', () => {
      const coercingSchema = z.object({ count: z.number() });
      const req = { body: { count: 5 } } as Request;
      const next = mockNext();

      validateBody(coercingSchema)(req, mockRes(), next);

      expect(req.body).toEqual({ count: 5 });
    });
  });

  describe('invalid body', () => {
    it('returns 400 when a required field is missing', () => {
      const req = { body: { name: 'Alice' } } as Request; // age missing
      const res = mockRes();
      const next = mockNext();

      validateBody(testSchema)(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Validation failed' }),
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 400 when a field fails its constraint', () => {
      const req = { body: { name: '', age: 25 } } as Request; // name too short
      const res = mockRes();
      const next = mockNext();

      validateBody(testSchema)(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });

    it('includes field-level error details in the response', () => {
      const req = { body: { name: 'Bob' } } as Request; // age missing
      const res = mockRes();
      const next = mockNext();

      validateBody(testSchema)(req, res, next);

      const jsonArg = vi.mocked(res.json).mock.calls[0]![0] as {
        details: Record<string, string[]>;
      };
      expect(jsonArg.details).toHaveProperty('age');
    });

    it('returns 400 when req.body is empty', () => {
      const req = { body: {} } as Request;
      const res = mockRes();
      const next = mockNext();

      validateBody(testSchema)(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });
  });
});
