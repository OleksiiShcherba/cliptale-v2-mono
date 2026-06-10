/**
 * RED test for AC-08 — useStoryboardGenerationFlow must NOT expose a
 * principalImageModal property after T9.
 *
 * AC-08: the system offers no principal-image approval step; the generation
 * flow proceeds without any principal step.
 *
 * This test verifies the hook-level contract: the returned object from
 * useStoryboardGenerationFlow must not contain a `principalImageModal` key.
 *
 * FAILS today because useStoryboardGenerationFlow still returns principalImageModal.
 * PASSES after T9 removes that property.
 */

import type React from 'react';
import { createElement, type ReactNode } from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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
  // plan generation mocks
  mockStartStoryboardPlan: vi.fn(),
  mockGetStoryboardPlanStatus: vi.fn(),
  mockApplyLatestStoryboardPlan: vi.fn(),
}));

vi.mock('@/features/storyboard/api', () => ({
  fetchStoryboardIllustrations: hoisted.mockFetchStoryboardIllustrations,
  startStoryboardIllustrations: hoisted.mockStartStoryboardIllustrations,
  startStoryboardBlockIllustration: hoisted.mockStartStoryboardBlockIllustration,
  startStoryboardPlan: hoisted.mockStartStoryboardPlan,
  getStoryboardPlanStatus: hoisted.mockGetStoryboardPlanStatus,
  applyLatestStoryboardPlan: hoisted.mockApplyLatestStoryboardPlan,
  // Principal-image callers: intentionally absent here to mirror the post-T9 state,
  // but they are still present in the real api.ts today — so the import of
  // useStoryboardGenerationFlow (which imports them) will pull them in, and the
  // hook will still expose principalImageModal.  That is exactly what makes this RED.
}));

vi.mock('@/shared/hooks/useRealtimeSubscription', () => ({
  useDraftStoryboardStatusSubscription: vi.fn(
    (_draftId: string | null, handlers: { onEvent: () => void; onReconnect?: () => void }) => {
      hoisted.mockDraftSubscriptionHandlers.push(handlers);
    },
  ),
}));

// ── Import SUT after mocks ─────────────────────────────────────────────────────

import { useStoryboardGenerationFlow } from '@/features/storyboard/hooks/useStoryboardGenerationFlow';
import type { Node } from '@xyflow/react';

// ── Wrapper ────────────────────────────────────────────────────────────────────

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

// ── Fixtures ───────────────────────────────────────────────────────────────────

function idleIllustrationResponse() {
  return {
    // New wire shape: no `reference` field (AC-08 / openapi delta)
    automation: { phase: 'idle', planningJobId: null, errorMessage: null },
    items: [],
  };
}

function makeArgs() {
  const nodes: Node[] = [
    { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: {} },
    { id: 'end', type: 'end', position: { x: 800, y: 0 }, data: {} },
  ];
  return {
    draftId: 'draft-ac08',
    nodes,
    isLoading: false,
    error: null,
    autoStartedPlanDraftRef: { current: null } as React.MutableRefObject<string | null>,
    setNodes: vi.fn(),
    setEdges: vi.fn(),
    removeNode: vi.fn(),
    reloadStoryboard: vi.fn().mockResolvedValue(undefined),
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('AC-08 — useStoryboardGenerationFlow: no principalImageModal in return', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.mockDraftSubscriptionHandlers.length = 0;
    hoisted.mockFetchStoryboardIllustrations.mockResolvedValue(idleIllustrationResponse());
    hoisted.mockStartStoryboardIllustrations.mockResolvedValue(idleIllustrationResponse());
    hoisted.mockStartStoryboardPlan.mockResolvedValue({ jobId: 'plan-job-1', status: 'queued' });
    hoisted.mockGetStoryboardPlanStatus.mockResolvedValue({ jobId: 'plan-job-1', status: 'running', plan: null, errorMessage: null });
    hoisted.mockApplyLatestStoryboardPlan.mockResolvedValue({ blocks: [], edges: [] });
  });

  it('hook return value does not contain a principalImageModal property (AC-08)', async () => {
    const args = makeArgs();
    const { result } = renderHook(() => useStoryboardGenerationFlow(args), { wrapper });

    await act(async () => {
      await Promise.resolve();
    });

    // After T9: principalImageModal must not exist on the returned object.
    // Today (RED): it is present with shouldRender/isBusy/onApprove etc.
    expect(
      (result.current as Record<string, unknown>)['principalImageModal'],
      'useStoryboardGenerationFlow must not return principalImageModal after T9 (AC-08)',
    ).toBeUndefined();
  });

  it('principalImageModal.shouldRender is never true for a no-reference payload (AC-08)', async () => {
    // This test also fails today: principalImageModal.shouldRender exists in the
    // return (it's false here because the mock returns no reference with approval-pending),
    // but the property itself being present means the removal hasn't happened yet.
    // After T9 the entire principalImageModal key must be gone.
    const args = makeArgs();
    args.autoStartedPlanDraftRef.current = 'draft-ac08';
    const { result } = renderHook(() => useStoryboardGenerationFlow(args), { wrapper });

    await act(async () => {
      await Promise.resolve();
    });

    // The very existence of principalImageModal on the return is the violation.
    // (Covered by the first test; this is the belt-and-suspenders check on the
    //  shouldRender property specifically.)
    const modal = (result.current as Record<string, unknown>)['principalImageModal'] as
      | { shouldRender: boolean }
      | undefined;
    expect(
      modal,
      'principalImageModal must not be returned from useStoryboardGenerationFlow after T9 (AC-08)',
    ).toBeUndefined();
  });

  it('isStep3Disabled is NOT blocked by an approvalContinuationFailed flag (AC-08)', async () => {
    // With no principal-approval state, isStep3Disabled must depend only on
    // plan/illustration blocking + lifecycle status — never on a
    // approvalContinuationFailed flag that no longer exists.
    //
    // In the idle state (no plan running, illustrations idle) isStep3Disabled
    // must be false after T9.
    const args = makeArgs();
    // prevent auto-start plan by pre-marking the draft
    args.autoStartedPlanDraftRef.current = 'draft-ac08';

    const { result } = renderHook(() => useStoryboardGenerationFlow(args), { wrapper });

    await act(async () => {
      await Promise.resolve();
    });

    await waitFor(() => {
      // isStep3Disabled today is true because isAwaitingPrincipalApproval is
      // evaluated and illustrationGeneration.status !== 'completed'.
      // After T9 with no reference field in the wire shape, the
      // awaiting-principal gate is gone, and isStep3Disabled may be false
      // in the idle/no-plan state.
      //
      // We assert it is NOT true SOLELY because of a principal-image check.
      // The observable: when plan is idle and illustrations are idle and
      // there is no reference approval blocking it, isStep3Disabled === false.
      expect(result.current.isStep3Disabled).toBe(false);
    });
  });
});
