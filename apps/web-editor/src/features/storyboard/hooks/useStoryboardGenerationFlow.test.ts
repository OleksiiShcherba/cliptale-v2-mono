/**
 * useStoryboardGenerationFlow — mapping tests (T15 reconciliation).
 *
 * Verifies that the hook correctly maps pipeline phase statuses from
 * `state.phases.<phase>.status` to the derived plan/illustration status
 * objects consumed by StoryboardPageWorkspace.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// Mock usePipelineState so tests are fully synchronous and server-free.
vi.mock('./usePipelineState');

// Spy the pipeline API so the retry/regenerate actions can be asserted.
vi.mock('@/features/storyboard/api', () => ({
  triggerPhase: vi.fn(() => Promise.resolve()),
}));

import { usePipelineState } from './usePipelineState';
import { triggerPhase } from '@/features/storyboard/api';
import type { PipelineState } from '@/features/storyboard/api';
import { useStoryboardGenerationFlow } from './useStoryboardGenerationFlow';

const mockUsePipelineState = vi.mocked(usePipelineState);
const mockTriggerPhase = vi.mocked(triggerPhase);

/** Build a minimal PipelineState with explicit phase statuses. */
function makePipelineState(
  sceneStatus: PipelineState['phases']['scene']['status'],
  sceneImageStatus: PipelineState['phases']['scene_image']['status'],
): PipelineState {
  return {
    draft_id: 'draft-test',
    active_phase: 'scene',
    active_run_phase: null,
    phases: {
      scene: { status: sceneStatus },
      reference_data: { status: 'idle' },
      reference_image: { status: 'idle' },
      scene_image: { status: sceneImageStatus },
    },
    payload: null,
    version: 1,
    cost_estimate: null,
    error_message: null,
    updated_at: null,
  };
}

const HOOK_ARGS = {
  draftId: 'draft-test',
  nodes: [],
  isLoading: false,
  error: null,
  autoStartedPlanDraftRef: { current: null },
  setNodes: vi.fn(),
  setEdges: vi.fn(),
  removeNode: vi.fn(),
  reloadStoryboard: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useStoryboardGenerationFlow — scene phase → planGeneration mapping', () => {
  it('scene running → planGeneration.status === "running" and isPlanBlocking === true', () => {
    mockUsePipelineState.mockReturnValue({
      state: makePipelineState('running', 'idle'),
    });

    const { result } = renderHook(() => useStoryboardGenerationFlow(HOOK_ARGS));

    expect(result.current.planGeneration.status).toBe('running');
    expect(result.current.isPlanBlocking).toBe(true);
  });

  it('scene completed → planGeneration.status === "completed" and isPlanBlocking === false', () => {
    mockUsePipelineState.mockReturnValue({
      state: makePipelineState('completed', 'idle'),
    });

    const { result } = renderHook(() => useStoryboardGenerationFlow(HOOK_ARGS));

    expect(result.current.planGeneration.status).toBe('completed');
    expect(result.current.isPlanBlocking).toBe(false);
  });

  it('scene queued → planGeneration.status === "queued" and isPlanBlocking === true', () => {
    mockUsePipelineState.mockReturnValue({
      state: makePipelineState('queued', 'idle'),
    });

    const { result } = renderHook(() => useStoryboardGenerationFlow(HOOK_ARGS));

    expect(result.current.planGeneration.status).toBe('queued');
    expect(result.current.isPlanBlocking).toBe(true);
  });

  it('scene awaiting_review → planGeneration.status === "running" (mapped to running)', () => {
    mockUsePipelineState.mockReturnValue({
      state: makePipelineState('awaiting_review', 'idle'),
    });

    const { result } = renderHook(() => useStoryboardGenerationFlow(HOOK_ARGS));

    expect(result.current.planGeneration.status).toBe('running');
  });

  it('scene skipped → planGeneration.status === "completed" (skipped counts as done)', () => {
    mockUsePipelineState.mockReturnValue({
      state: makePipelineState('skipped', 'idle'),
    });

    const { result } = renderHook(() => useStoryboardGenerationFlow(HOOK_ARGS));

    expect(result.current.planGeneration.status).toBe('completed');
  });

  it('scene failed → planGeneration.status === "failed"', () => {
    mockUsePipelineState.mockReturnValue({
      state: makePipelineState('failed', 'idle'),
    });

    const { result } = renderHook(() => useStoryboardGenerationFlow(HOOK_ARGS));

    expect(result.current.planGeneration.status).toBe('failed');
  });

  it('scene idle → planGeneration.status === "idle" and isPlanBlocking === false', () => {
    mockUsePipelineState.mockReturnValue({
      state: makePipelineState('idle', 'idle'),
    });

    const { result } = renderHook(() => useStoryboardGenerationFlow(HOOK_ARGS));

    expect(result.current.planGeneration.status).toBe('idle');
    expect(result.current.isPlanBlocking).toBe(false);
  });
});

describe('useStoryboardGenerationFlow — scene_image phase → illustrationGeneration mapping', () => {
  it('scene_image running → illustrationGeneration.status === "running" / isGenerationBlocking === true', () => {
    mockUsePipelineState.mockReturnValue({
      state: makePipelineState('idle', 'running'),
    });

    const { result } = renderHook(() => useStoryboardGenerationFlow(HOOK_ARGS));

    expect(result.current.illustrationGeneration.status).toBe('running');
    expect(result.current.isGenerationBlocking).toBe(true);
  });

  it('scene_image completed → illustrationGeneration.status === "completed"', () => {
    mockUsePipelineState.mockReturnValue({
      state: makePipelineState('idle', 'completed'),
    });

    const { result } = renderHook(() => useStoryboardGenerationFlow(HOOK_ARGS));

    expect(result.current.illustrationGeneration.status).toBe('completed');
  });

  it('scene_image queued → illustrationGeneration.status === "queued"', () => {
    mockUsePipelineState.mockReturnValue({
      state: makePipelineState('idle', 'queued'),
    });

    const { result } = renderHook(() => useStoryboardGenerationFlow(HOOK_ARGS));

    expect(result.current.illustrationGeneration.status).toBe('queued');
  });

  it('scene_image failed → illustrationGeneration.status === "failed"', () => {
    mockUsePipelineState.mockReturnValue({
      state: makePipelineState('idle', 'failed'),
    });

    const { result } = renderHook(() => useStoryboardGenerationFlow(HOOK_ARGS));

    expect(result.current.illustrationGeneration.status).toBe('failed');
  });

  it('scene_image skipped → illustrationGeneration.status === "completed"', () => {
    mockUsePipelineState.mockReturnValue({
      state: makePipelineState('idle', 'skipped'),
    });

    const { result } = renderHook(() => useStoryboardGenerationFlow(HOOK_ARGS));

    expect(result.current.illustrationGeneration.status).toBe('completed');
  });
});

describe('useStoryboardGenerationFlow — null pipeline state (loading)', () => {
  it('null state → all statuses idle, no blocking', () => {
    mockUsePipelineState.mockReturnValue({ state: null });

    const { result } = renderHook(() => useStoryboardGenerationFlow(HOOK_ARGS));

    expect(result.current.planGeneration.status).toBe('idle');
    expect(result.current.illustrationGeneration.status).toBe('idle');
    expect(result.current.isPlanBlocking).toBe(false);
    expect(result.current.isGenerationBlocking).toBe(false);
  });
});

describe('useStoryboardGenerationFlow — retry/regenerate actions (F3, AC-12)', () => {
  it('planGeneration.retry() triggers the scene phase', async () => {
    mockUsePipelineState.mockReturnValue({
      state: makePipelineState('failed', 'idle'),
    });

    const { result } = renderHook(() => useStoryboardGenerationFlow(HOOK_ARGS));

    await result.current.planGeneration.retry();

    expect(mockTriggerPhase).toHaveBeenCalledWith('draft-test', 'scene');
  });

  it('illustrationGeneration.start() triggers the scene_image phase', async () => {
    mockUsePipelineState.mockReturnValue({
      state: makePipelineState('completed', 'failed'),
    });

    const { result } = renderHook(() => useStoryboardGenerationFlow(HOOK_ARGS));

    await result.current.illustrationGeneration.start();

    expect(mockTriggerPhase).toHaveBeenCalledWith('draft-test', 'scene_image');
  });
});

describe('useStoryboardGenerationFlow — pipelineState passthrough', () => {
  it('returns pipelineState: state so callers can access raw pipeline data', () => {
    const state = makePipelineState('completed', 'idle');
    mockUsePipelineState.mockReturnValue({ state });

    const { result } = renderHook(() => useStoryboardGenerationFlow(HOOK_ARGS));

    expect(result.current.pipelineState).toBe(state);
  });
});
