import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import type { AiGenerationContext } from '@/shared/ai-generation/types';

const { mockSubmitGeneration, mockGetJobStatus } = vi.hoisted(() => ({
  mockSubmitGeneration: vi.fn(),
  mockGetJobStatus: vi.fn(),
}));

vi.mock('@/shared/ai-generation/api', () => ({
  submitGeneration: mockSubmitGeneration,
  getJobStatus: mockGetJobStatus,
}));

import { useAiGeneration } from './useAiGeneration';

const PROJECT_CTX: AiGenerationContext = { kind: 'project', id: 'proj-1' };
const DRAFT_CTX: AiGenerationContext = { kind: 'draft', id: 'draft-42' };

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useAiGeneration', () => {
  it('starts in idle state', () => {
    const { result } = renderHook(() => useAiGeneration());
    expect(result.current.currentJob).toBeNull();
    expect(result.current.isGenerating).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('submits a project-context generation request and starts polling', async () => {
    mockSubmitGeneration.mockResolvedValue({ jobId: 'job-1', status: 'queued' });
    mockGetJobStatus.mockResolvedValue({
      jobId: 'job-1',
      status: 'processing',
      progress: 25,
      resultAssetId: null,
      errorMessage: null,
    });

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

    // Let the polling kick in
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(result.current.currentJob?.status).toBe('processing');
    expect(result.current.isGenerating).toBe(true);
  });

  it('submits a draft-context generation request', async () => {
    mockSubmitGeneration.mockResolvedValue({ jobId: 'job-2', status: 'queued' });
    mockGetJobStatus.mockResolvedValue({
      jobId: 'job-2',
      status: 'queued',
      progress: 0,
      resultAssetId: null,
      errorMessage: null,
    });

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

  it('reset returns to idle state', async () => {
    mockSubmitGeneration.mockResolvedValue({ jobId: 'job-1', status: 'queued' });
    mockGetJobStatus.mockResolvedValue({
      jobId: 'job-1',
      status: 'completed',
      progress: 100,
      resultAssetId: 'asset-1',
      errorMessage: null,
    });

    const { result } = renderHook(() => useAiGeneration());

    await act(async () => {
      await result.current.submit(PROJECT_CTX, {
        modelId: 'fal-ai/nano-banana-2',
        prompt: 'Test',
        options: {},
      });
    });

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(result.current.currentJob?.status).toBe('completed');

    act(() => {
      result.current.reset();
    });

    expect(result.current.currentJob).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.isGenerating).toBe(false);
  });
});
