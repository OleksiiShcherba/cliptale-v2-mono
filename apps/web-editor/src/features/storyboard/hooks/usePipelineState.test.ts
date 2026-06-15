/**
 * usePipelineState — hook tests (storyboard-generation-pipeline T15, AC-05).
 *
 * AC (resume): on mount, GET pipeline state is fetched once; result is exposed
 *   as `state`.
 *
 * AC (apply-newer): a realtime event with version > held version updates state.
 *
 * AC-05 (version-monotonic convergence / ignore-stale):
 *   Events with version <= the currently held version are silently dropped —
 *   state must not change.
 *
 * Level: unit (per test-plan AC-05 row — hook in isolation, no network).
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  mockGetPipelineState: vi.fn(),
  mockDraftSubscriptionHandlers: [] as Array<{
    onEvent: (event: {
      type: 'storyboard.status.updated';
      draftId: string;
      userId: string;
      payload: PipelineState;
    }) => void;
    onReconnect?: () => void;
  }>,
}));

vi.mock('@/features/storyboard/api', () => ({
  getPipelineState: mocks.mockGetPipelineState,
}));

vi.mock('@/shared/hooks/useRealtimeSubscription', () => ({
  useDraftStoryboardStatusSubscription: vi.fn(
    (
      _draftId: string | null,
      handlers: {
        onEvent: (event: {
          type: 'storyboard.status.updated';
          draftId: string;
          userId: string;
          payload: PipelineState;
        }) => void;
        onReconnect?: () => void;
      },
    ) => {
      mocks.mockDraftSubscriptionHandlers.push(handlers);
    },
  ),
}));

// ── Types (mirror the backend DTO — no production import needed) ──────────────

type PhaseStatus =
  | 'idle'
  | 'queued'
  | 'running'
  | 'awaiting_review'
  | 'completed'
  | 'skipped'
  | 'failed';

interface PipelineState {
  draft_id: string;
  active_phase: 'scene' | 'reference_data' | 'reference_image' | 'scene_image';
  active_run_phase:
    | 'scene'
    | 'reference_data'
    | 'reference_image'
    | 'scene_image'
    | null;
  phases: {
    scene: { status: PhaseStatus };
    reference_data: { status: PhaseStatus };
    reference_image: { status: PhaseStatus };
    scene_image: { status: PhaseStatus };
  };
  payload: unknown | null;
  version: number;
  cost_estimate: string | null;
  error_message: string | null;
  updated_at: string | null;
}

// The production hook — backed by the throw-stub scaffold at usePipelineState.ts
// (same directory). The implementer replaces that stub with the real hook.

import { usePipelineState } from './usePipelineState';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const DRAFT_ID = 'draft-pipeline-1';

function makePipelineState(overrides: Partial<PipelineState> = {}): PipelineState {
  return {
    draft_id: DRAFT_ID,
    active_phase: 'scene',
    active_run_phase: null,
    phases: {
      scene: { status: 'idle' },
      reference_data: { status: 'idle' },
      reference_image: { status: 'idle' },
      scene_image: { status: 'idle' },
    },
    payload: null,
    version: 1,
    cost_estimate: null,
    error_message: null,
    updated_at: null,
    ...overrides,
  };
}

function emitPipelineEvent(state: PipelineState): void {
  act(() => {
    mocks.mockDraftSubscriptionHandlers.at(-1)?.onEvent({
      type: 'storyboard.status.updated',
      draftId: DRAFT_ID,
      userId: 'user-1',
      payload: state,
    });
  });
}

function emitReconnect(): void {
  act(() => {
    mocks.mockDraftSubscriptionHandlers.at(-1)?.onReconnect?.();
  });
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mocks.mockDraftSubscriptionHandlers.length = 0;
  mocks.mockGetPipelineState.mockResolvedValue(
    makePipelineState({ version: 1 }),
  );
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('usePipelineState — resume (fetch on mount)', () => {
  it('calls getPipelineState once with the draftId and exposes the DTO as state', async () => {
    const initialState = makePipelineState({
      version: 5,
      active_phase: 'reference_data',
      phases: {
        scene: { status: 'completed' },
        reference_data: { status: 'running' },
        reference_image: { status: 'idle' },
        scene_image: { status: 'idle' },
      },
    });
    mocks.mockGetPipelineState.mockResolvedValue(initialState);

    const { result } = renderHook(() => usePipelineState(DRAFT_ID));

    await waitFor(() => {
      expect(result.current.state).not.toBeNull();
    });

    expect(mocks.mockGetPipelineState).toHaveBeenCalledTimes(1);
    expect(mocks.mockGetPipelineState).toHaveBeenCalledWith(DRAFT_ID);
    expect(result.current.state?.version).toBe(5);
    expect(result.current.state?.active_phase).toBe('reference_data');
  });
});

describe('usePipelineState — realtime apply-newer (AC-05 positive path)', () => {
  it('applies an incoming event when its version is greater than the held version', async () => {
    const fetchedState = makePipelineState({ version: 5, active_phase: 'scene' });
    mocks.mockGetPipelineState.mockResolvedValue(fetchedState);

    const { result } = renderHook(() => usePipelineState(DRAFT_ID));

    await waitFor(() => {
      expect(result.current.state?.version).toBe(5);
    });

    const newerState = makePipelineState({
      version: 6,
      active_phase: 'reference_data',
    });
    emitPipelineEvent(newerState);

    expect(result.current.state?.version).toBe(6);
    expect(result.current.state?.active_phase).toBe('reference_data');
  });
});

describe('usePipelineState — ignore-stale guard (AC-05 negative path)', () => {
  it('ignores an event whose version equals the held version', async () => {
    const fetchedState = makePipelineState({
      version: 5,
      active_phase: 'reference_data',
    });
    mocks.mockGetPipelineState.mockResolvedValue(fetchedState);

    const { result } = renderHook(() => usePipelineState(DRAFT_ID));

    await waitFor(() => {
      expect(result.current.state?.version).toBe(5);
    });

    const staleEqualState = makePipelineState({
      version: 5,
      active_phase: 'scene_image', // would be a different phase — must not apply
    });
    emitPipelineEvent(staleEqualState);

    // state must be unchanged
    expect(result.current.state?.version).toBe(5);
    expect(result.current.state?.active_phase).toBe('reference_data');
  });

  it('ignores an event whose version is lower than the held version', async () => {
    const fetchedState = makePipelineState({
      version: 5,
      active_phase: 'reference_data',
    });
    mocks.mockGetPipelineState.mockResolvedValue(fetchedState);

    const { result } = renderHook(() => usePipelineState(DRAFT_ID));

    await waitFor(() => {
      expect(result.current.state?.version).toBe(5);
    });

    const staleLowerState = makePipelineState({
      version: 3,
      active_phase: 'scene',
    });
    emitPipelineEvent(staleLowerState);

    // state must be unchanged
    expect(result.current.state?.version).toBe(5);
    expect(result.current.state?.active_phase).toBe('reference_data');
  });
});

describe('usePipelineState — reconnect re-fetch (F4, AC-05 / resume-freshness)', () => {
  it('re-fetches GET state on realtime reconnect and applies the fresher snapshot', async () => {
    // Mount: fetch version 5.
    mocks.mockGetPipelineState.mockResolvedValue(
      makePipelineState({ version: 5, active_phase: 'scene' }),
    );

    const { result } = renderHook(() => usePipelineState(DRAFT_ID));

    await waitFor(() => {
      expect(result.current.state?.version).toBe(5);
    });
    expect(mocks.mockGetPipelineState).toHaveBeenCalledTimes(1);

    // While the socket was dropped the backend advanced to version 8. On reconnect
    // the hook must re-GET the snapshot (a non-replaying resubscribe delivers no
    // missed events) and converge to the true state.
    mocks.mockGetPipelineState.mockResolvedValue(
      makePipelineState({ version: 8, active_phase: 'reference_data' }),
    );

    emitReconnect();

    await waitFor(() => {
      expect(result.current.state?.version).toBe(8);
    });
    expect(mocks.mockGetPipelineState).toHaveBeenCalledTimes(2);
    expect(result.current.state?.active_phase).toBe('reference_data');
  });

  it('does not regress to an older snapshot if the reconnect re-fetch is stale', async () => {
    mocks.mockGetPipelineState.mockResolvedValue(
      makePipelineState({ version: 7, active_phase: 'reference_image' }),
    );

    const { result } = renderHook(() => usePipelineState(DRAFT_ID));
    await waitFor(() => {
      expect(result.current.state?.version).toBe(7);
    });

    // A realtime event advances to version 9 before the reconnect fires.
    emitPipelineEvent(makePipelineState({ version: 9, active_phase: 'scene_image' }));
    expect(result.current.state?.version).toBe(9);

    // Reconnect re-fetch returns a stale snapshot (version 7) — must be ignored.
    mocks.mockGetPipelineState.mockResolvedValue(
      makePipelineState({ version: 7, active_phase: 'reference_image' }),
    );
    emitReconnect();

    await waitFor(() => {
      expect(mocks.mockGetPipelineState).toHaveBeenCalledTimes(2);
    });
    expect(result.current.state?.version).toBe(9);
    expect(result.current.state?.active_phase).toBe('scene_image');
  });
});
