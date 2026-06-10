/**
 * RED tests for T10 — useStoryboardIllustrations must expose structured gate errors.
 *
 * AC-02 / AC-03b / AC-04b — when startStoryboardIllustrations rejects with a
 * structured gate error (code + details), the hook must propagate that structure
 * so that the UI layer can render named blocks / scenes rather than a generic
 * error string.
 *
 * Today the hook sets error: string | null and the gate structure is lost.
 * These tests assert the NEW contract: the hook must expose a `gateError` field
 * (or equivalent) with the code + details from the 422 body.
 *
 * All tests here are expected to FAIL (RED) until T10 is implemented.
 */

import { act, renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────────────────────

const hoisted = vi.hoisted(() => ({
  mockFetchStoryboardIllustrations: vi.fn(),
  mockStartStoryboardIllustrations: vi.fn(),
  mockStartStoryboardBlockIllustration: vi.fn(),
  mockDraftSubscriptionHandlers: [] as Array<{
    onEvent: (event: {
      type: 'storyboard.status.updated';
      draftId: string;
      userId: string;
      payload: Record<string, unknown>;
    }) => void;
    onReconnect?: () => void;
  }>,
}));

vi.mock('@/features/storyboard/api', () => ({
  fetchStoryboardIllustrations: hoisted.mockFetchStoryboardIllustrations,
  startStoryboardIllustrations: hoisted.mockStartStoryboardIllustrations,
  startStoryboardBlockIllustration: hoisted.mockStartStoryboardBlockIllustration,
}));

vi.mock('@/shared/hooks/useRealtimeSubscription', () => ({
  useDraftStoryboardStatusSubscription: vi.fn(
    (_draftId: string | null, handlers: {
      onEvent: (event: {
        type: 'storyboard.status.updated';
        draftId: string;
        userId: string;
        payload: Record<string, unknown>;
      }) => void;
      onReconnect?: () => void;
    }) => {
      hoisted.mockDraftSubscriptionHandlers.push(handlers);
    },
  ),
}));

// ── Import SUT after mocks ─────────────────────────────────────────────────────

import { useStoryboardIllustrations } from './useStoryboardIllustrations';

// ── Structured gate error shape (matches openapi.yaml Error schema) ────────────

interface GateError {
  code: string;
  details: {
    blocks?: Array<{ blockId: string; name: string }>;
    scenes?: Array<{ blockId: string; name: string | null }>;
  };
  message: string;
}

// ── Fixtures ───────────────────────────────────────────────────────────────────

function idleResponse() {
  return {
    automation: { phase: 'idle', planningJobId: null, errorMessage: null },
    items: [],
  };
}

function makeGateFailedError(blocks: Array<{ blockId: string; name: string }>): GateError {
  const err = new Error('Reference gate failed') as GateError & Error;
  err.code = 'references.reference_gate_failed';
  err.details = { blocks };
  return err;
}

function makeUnlinkedScenesError(scenes: Array<{ blockId: string; name: string | null }>): GateError {
  const err = new Error('Unlinked scenes') as GateError & Error;
  err.code = 'references.unlinked_scenes';
  err.details = { scenes };
  return err;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('T10 / AC-02 — useStoryboardIllustrations: reference_gate_failed exposes gateError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.mockDraftSubscriptionHandlers.length = 0;
    hoisted.mockFetchStoryboardIllustrations.mockResolvedValue(idleResponse());
  });

  it('exposes gateError with code="references.reference_gate_failed" after start() rejects with gate error', async () => {
    const blocks = [
      { blockId: 'block-aaa', name: 'Test Character' },
      { blockId: 'block-bbb', name: 'Test Environment' },
    ];
    hoisted.mockStartStoryboardIllustrations.mockRejectedValue(
      makeGateFailedError(blocks),
    );

    const { result } = renderHook(() => useStoryboardIllustrations('draft-1', {}));

    // Wait for initial fetch
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.start().catch(() => undefined);
    });

    // The hook must expose a structured gateError, not just error: string | null
    // After T10: gateError must be defined with code and details.
    // Before T10 (RED): gateError does not exist on the return value.
    const gateError = (result.current as Record<string, unknown>)['gateError'] as GateError | null | undefined;
    expect(
      gateError,
      'useStoryboardIllustrations must expose gateError after a reference_gate_failed 422',
    ).not.toBeNull();
    expect(gateError).toBeDefined();
    expect(gateError?.code).toBe('references.reference_gate_failed');
  });

  it('gateError.details.blocks contains every named blocking block (AC-02)', async () => {
    const blocks = [
      { blockId: 'block-aaa', name: 'Test Character' },
      { blockId: 'block-bbb', name: 'Test Environment' },
    ];
    hoisted.mockStartStoryboardIllustrations.mockRejectedValue(
      makeGateFailedError(blocks),
    );

    const { result } = renderHook(() => useStoryboardIllustrations('draft-1', {}));
    await act(async () => { await Promise.resolve(); });
    await act(async () => {
      await result.current.start().catch(() => undefined);
    });

    const gateError = (result.current as Record<string, unknown>)['gateError'] as GateError | null | undefined;
    expect(gateError?.details?.blocks).toEqual(blocks);
  });
});

describe('T10 / AC-04b — useStoryboardIllustrations: unlinked_scenes exposes gateError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.mockDraftSubscriptionHandlers.length = 0;
    hoisted.mockFetchStoryboardIllustrations.mockResolvedValue(idleResponse());
  });

  it('exposes gateError with code="references.unlinked_scenes" after start() rejects with unlinked-scenes error', async () => {
    const scenes = [
      { blockId: 'scene-ccc', name: 'Test Scene' },
    ];
    hoisted.mockStartStoryboardIllustrations.mockRejectedValue(
      makeUnlinkedScenesError(scenes),
    );

    const { result } = renderHook(() => useStoryboardIllustrations('draft-1', {}));
    await act(async () => { await Promise.resolve(); });
    await act(async () => {
      await result.current.start().catch(() => undefined);
    });

    const gateError = (result.current as Record<string, unknown>)['gateError'] as GateError | null | undefined;
    expect(
      gateError,
      'useStoryboardIllustrations must expose gateError after an unlinked_scenes 422',
    ).not.toBeNull();
    expect(gateError).toBeDefined();
    expect(gateError?.code).toBe('references.unlinked_scenes');
  });

  it('gateError.details.scenes includes null-name scenes with a fallback label opportunity (AC-04b)', async () => {
    const scenes = [
      { blockId: 'scene-ccc', name: 'Test Scene' },
      { blockId: 'scene-ddd', name: null },
    ];
    hoisted.mockStartStoryboardIllustrations.mockRejectedValue(
      makeUnlinkedScenesError(scenes),
    );

    const { result } = renderHook(() => useStoryboardIllustrations('draft-1', {}));
    await act(async () => { await Promise.resolve(); });
    await act(async () => {
      await result.current.start().catch(() => undefined);
    });

    const gateError = (result.current as Record<string, unknown>)['gateError'] as GateError | null | undefined;
    expect(gateError?.details?.scenes).toEqual(scenes);
  });

  it('gateError is cleared when start() succeeds after a prior gate failure', async () => {
    const scenes = [{ blockId: 'scene-ccc', name: 'Test Scene' }];
    hoisted.mockStartStoryboardIllustrations
      .mockRejectedValueOnce(makeUnlinkedScenesError(scenes))
      .mockResolvedValueOnce({
        automation: { phase: 'generating_scene_illustrations', planningJobId: null, errorMessage: null },
        items: [],
      });

    const { result } = renderHook(() => useStoryboardIllustrations('draft-1', {}));
    await act(async () => { await Promise.resolve(); });

    // First call: gate error
    await act(async () => {
      await result.current.start().catch(() => undefined);
    });
    const gateErrorAfterFail = (result.current as Record<string, unknown>)['gateError'] as GateError | null | undefined;
    expect(gateErrorAfterFail?.code).toBe('references.unlinked_scenes');

    // Second call: success — gateError must be cleared
    await act(async () => {
      await result.current.start().catch(() => undefined);
    });
    const gateErrorAfterSuccess = (result.current as Record<string, unknown>)['gateError'] as GateError | null | undefined;
    expect(
      gateErrorAfterSuccess,
      'gateError must be null/undefined after a successful start',
    ).toBeFalsy();
  });
});

describe('AC-03b — useStoryboardIllustrations: per-scene retryBlock exposes scene-scoped gateError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.mockDraftSubscriptionHandlers.length = 0;
    hoisted.mockFetchStoryboardIllustrations.mockResolvedValue(idleResponse());
  });

  it('exposes gateError with the scene-scoped blocking blocks after retryBlock() rejects with reference_gate_failed', async () => {
    const blocks = [{ blockId: 'block-aaa', name: 'Scene Character' }];
    hoisted.mockStartStoryboardBlockIllustration.mockRejectedValue(
      makeGateFailedError(blocks),
    );

    const { result } = renderHook(() => useStoryboardIllustrations('draft-1', {}));
    await act(async () => { await Promise.resolve(); });

    await act(async () => {
      await result.current.retryBlock('scene-1').catch(() => undefined);
    });

    const gateError = (result.current as Record<string, unknown>)['gateError'] as GateError | null | undefined;
    expect(
      gateError,
      'useStoryboardIllustrations must expose gateError after a per-scene reference_gate_failed 422 (AC-03b)',
    ).not.toBeNull();
    expect(gateError).toBeDefined();
    expect(gateError?.code).toBe('references.reference_gate_failed');
    expect(gateError?.details?.blocks).toEqual(blocks);
  });

  it('non-gate retryBlock failures set only the generic error, not gateError', async () => {
    hoisted.mockStartStoryboardBlockIllustration.mockRejectedValue(
      new Error('network down'),
    );

    const { result } = renderHook(() => useStoryboardIllustrations('draft-1', {}));
    await act(async () => { await Promise.resolve(); });

    await act(async () => {
      await result.current.retryBlock('scene-1').catch(() => undefined);
    });

    const gateError = (result.current as Record<string, unknown>)['gateError'] as GateError | null | undefined;
    expect(gateError).toBeFalsy();
    expect(result.current.error).toBe('Could not retry the scene illustration.');
  });

  it('gateError is cleared when retryBlock() succeeds after a prior gate failure', async () => {
    const blocks = [{ blockId: 'block-aaa', name: 'Scene Character' }];
    hoisted.mockStartStoryboardBlockIllustration
      .mockRejectedValueOnce(makeGateFailedError(blocks))
      .mockResolvedValueOnce({
        automation: { phase: 'generating_scene_illustrations', planningJobId: null, errorMessage: null },
        items: [],
      });

    const { result } = renderHook(() => useStoryboardIllustrations('draft-1', {}));
    await act(async () => { await Promise.resolve(); });

    await act(async () => {
      await result.current.retryBlock('scene-1').catch(() => undefined);
    });
    const gateErrorAfterFail = (result.current as Record<string, unknown>)['gateError'] as GateError | null | undefined;
    expect(gateErrorAfterFail?.code).toBe('references.reference_gate_failed');

    await act(async () => {
      await result.current.retryBlock('scene-1').catch(() => undefined);
    });
    const gateErrorAfterSuccess = (result.current as Record<string, unknown>)['gateError'] as GateError | null | undefined;
    expect(
      gateErrorAfterSuccess,
      'gateError must be null/undefined after a successful per-scene retry',
    ).toBeFalsy();
  });
});
