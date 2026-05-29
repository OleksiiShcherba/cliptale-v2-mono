import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import type { AiGenerationContext, AiGenerationJob } from '@/shared/ai-generation/types';

const { mockSubmitGeneration, mockUseJobPolling } = vi.hoisted(() => ({
  mockSubmitGeneration: vi.fn(),
  mockUseJobPolling: vi.fn(),
}));

vi.mock('@/shared/ai-generation/api', () => ({
  submitGeneration: mockSubmitGeneration,
}));

vi.mock('./useJobPolling', () => ({
  useJobPolling: mockUseJobPolling,
}));

import { useAiGeneration } from './useAiGeneration';

const PROJECT_CTX: AiGenerationContext = { kind: 'project', id: 'proj-1' };
const DRAFT_CTX: AiGenerationContext = { kind: 'draft', id: 'draft-42' };

function makeJob(overrides: Partial<AiGenerationJob> = {}): AiGenerationJob {
  return {
    jobId: 'job-1',
    status: 'processing',
    progress: 25,
    resultAssetId: null,
    errorMessage: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseJobPolling.mockReturnValue({ job: null, isPolling: false });
});

describe('useAiGeneration', () => {
  it('starts in idle state', () => {
    const { result } = renderHook(() => useAiGeneration());
    expect(result.current.currentJob).toBeNull();
    expect(result.current.isGenerating).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('submits a project-context generation request and seeds a queued realtime job', async () => {
    mockSubmitGeneration.mockResolvedValue({ jobId: 'job-1', status: 'queued' });

    const { result } = renderHook(() => useAiGeneration());

    await act(async () => {
      await result.current.submit(PROJECT_CTX, {
        modelId: 'fal-ai/nano-banana-2',
        prompt: 'A sunset',
        options: {},
      });
    });

    expect(mockSubmitGeneration).toHaveBeenCalledWith(PROJECT_CTX, {
      modelId: 'fal-ai/nano-banana-2',
      prompt: 'A sunset',
      options: {},
    });
    expect(mockUseJobPolling).toHaveBeenLastCalledWith('job-1', {
      jobId: 'job-1',
      status: 'queued',
      progress: 0,
      resultAssetId: null,
      errorMessage: null,
    });
  });

  it('submits a draft-context generation request', async () => {
    mockSubmitGeneration.mockResolvedValue({ jobId: 'job-2', status: 'queued' });

    const { result } = renderHook(() => useAiGeneration());

    await act(async () => {
      await result.current.submit(DRAFT_CTX, {
        modelId: 'fal-ai/nano-banana-2',
        options: {},
      });
    });

    expect(mockSubmitGeneration).toHaveBeenCalledWith(DRAFT_CTX, {
      modelId: 'fal-ai/nano-banana-2',
      options: {},
    });
    expect(mockUseJobPolling).toHaveBeenLastCalledWith('job-2', expect.objectContaining({
      jobId: 'job-2',
      status: 'queued',
    }));
  });

  it('exposes the current realtime job and generating state from useJobPolling', () => {
    mockUseJobPolling.mockReturnValue({
      job: makeJob({ status: 'processing', progress: 60 }),
      isPolling: true,
    });

    const { result } = renderHook(() => useAiGeneration());

    expect(result.current.currentJob).toEqual(makeJob({ status: 'processing', progress: 60 }));
    expect(result.current.isGenerating).toBe(true);
  });

  it('sets error when submission fails', async () => {
    mockSubmitGeneration.mockRejectedValue(new Error('Bad request'));

    const { result } = renderHook(() => useAiGeneration());

    await act(async () => {
      await result.current.submit(PROJECT_CTX, {
        modelId: 'fal-ai/nano-banana-2',
        options: {},
      });
    });

    expect(result.current.error).toBe('Bad request');
    expect(result.current.isGenerating).toBe(false);
  });

  it('sets error with fallback message for non-Error throws', async () => {
    mockSubmitGeneration.mockRejectedValue('string error');

    const { result } = renderHook(() => useAiGeneration());

    await act(async () => {
      await result.current.submit(PROJECT_CTX, {
        modelId: 'fal-ai/nano-banana-2',
        prompt: 'test',
        options: {},
      });
    });

    expect(result.current.error).toBe('Failed to submit generation');
  });

  it('reset returns to idle state and clears the subscribed job id', async () => {
    mockSubmitGeneration.mockResolvedValue({ jobId: 'job-1', status: 'queued' });
    const { result } = renderHook(() => useAiGeneration());

    await act(async () => {
      await result.current.submit(PROJECT_CTX, {
        modelId: 'fal-ai/nano-banana-2',
        prompt: 'Test',
        options: {},
      });
    });

    act(() => {
      result.current.reset();
    });

    expect(mockUseJobPolling).toHaveBeenLastCalledWith(null, null);
    expect(result.current.currentJob).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.isGenerating).toBe(false);
  });
});
