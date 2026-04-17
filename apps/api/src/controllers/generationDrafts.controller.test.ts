/**
 * Unit tests for the enhance-related handlers in generationDrafts.controller.ts.
 *
 * Controllers are thin — they parse the request, delegate to the service, and
 * format the response. These tests verify:
 *  - The correct service method is called with the right arguments.
 *  - HTTP status codes are correct (202 for startEnhance, 200 for getEnhanceStatus).
 *  - Errors from the service are forwarded to next() for the central error handler.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

import * as generationDraftService from '@/services/generationDraft.service.js';
import { startEnhance, getEnhanceStatus } from './generationDrafts.controller.js';
import { NotFoundError } from '@/lib/errors.js';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/services/generationDraft.service.js', () => ({
  startEnhance: vi.fn(),
  getEnhanceStatus: vi.fn(),
  // Stub the rest to avoid import errors (not under test here).
  create: vi.fn(),
  getById: vi.fn(),
  listMine: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq(
  params: Record<string, string> = {},
  user = { userId: 'user-123', email: 'u@example.com', displayName: 'User' },
): Request {
  return { params, user } as unknown as Request;
}

function makeRes(): { res: Response; status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const res = { status, json } as unknown as Response;
  return { res, status, json };
}

function makeNext(): NextFunction {
  return vi.fn() as unknown as NextFunction;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('generationDrafts.controller — enhance handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── startEnhance ───────────────────────────────────────────────────────────

  describe('startEnhance', () => {
    it('should call generationDraftService.startEnhance and respond 202 with jobId', async () => {
      vi.mocked(generationDraftService.startEnhance).mockResolvedValue({ jobId: 'job-abc' });

      const req = makeReq({ id: 'draft-1' });
      const { res, status, json } = makeRes();
      const next = makeNext();

      await startEnhance(req, res, next);

      expect(generationDraftService.startEnhance).toHaveBeenCalledWith('user-123', 'draft-1');
      expect(status).toHaveBeenCalledWith(202);
      expect(json).toHaveBeenCalledWith({ jobId: 'job-abc' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should call next(err) when the service throws', async () => {
      const err = new NotFoundError('Draft not found');
      vi.mocked(generationDraftService.startEnhance).mockRejectedValue(err);

      const req = makeReq({ id: 'draft-missing' });
      const { res } = makeRes();
      const next = makeNext();

      await startEnhance(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  // ── getEnhanceStatus ───────────────────────────────────────────────────────

  describe('getEnhanceStatus', () => {
    it('should call generationDraftService.getEnhanceStatus and respond 200 with status', async () => {
      const serviceResult = { status: 'running' as const };
      vi.mocked(generationDraftService.getEnhanceStatus).mockResolvedValue(serviceResult);

      const req = makeReq({ id: 'draft-1', jobId: 'job-xyz' });
      const { res, status, json } = makeRes();
      const next = makeNext();

      await getEnhanceStatus(req, res, next);

      expect(generationDraftService.getEnhanceStatus).toHaveBeenCalledWith(
        'user-123',
        'draft-1',
        'job-xyz',
      );
      // Default res.json (no explicit status call) → implicit 200.
      expect(json).toHaveBeenCalledWith(serviceResult);
      expect(status).not.toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    it('should call next(err) when the service throws', async () => {
      const err = new NotFoundError('Job expired');
      vi.mocked(generationDraftService.getEnhanceStatus).mockRejectedValue(err);

      const req = makeReq({ id: 'draft-1', jobId: 'expired-job' });
      const { res } = makeRes();
      const next = makeNext();

      await getEnhanceStatus(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });
});
