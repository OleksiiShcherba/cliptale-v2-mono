import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const { mockListProviders, mockAddProvider, mockUpdateProvider, mockDeleteProvider } = vi.hoisted(() => ({
  mockListProviders: vi.fn(),
  mockAddProvider: vi.fn(),
  mockUpdateProvider: vi.fn(),
  mockDeleteProvider: vi.fn(),
}));

vi.mock('@/features/ai-providers/api', () => ({
  listProviders: mockListProviders,
  addProvider: mockAddProvider,
  updateProvider: mockUpdateProvider,
  deleteProvider: mockDeleteProvider,
}));

import { useAiProviders } from './useAiProviders';
import type { ProviderSummary } from '@/features/ai-providers/types';

const MOCK_PROVIDERS: ProviderSummary[] = [
  { provider: 'openai', isActive: true, isConfigured: true, createdAt: '2026-01-01' },
  { provider: 'runway', isActive: false, isConfigured: true, createdAt: '2026-01-02' },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockListProviders.mockResolvedValue(MOCK_PROVIDERS);
  mockAddProvider.mockResolvedValue(undefined);
  mockUpdateProvider.mockResolvedValue(undefined);
  mockDeleteProvider.mockResolvedValue(undefined);
});

describe('useAiProviders', () => {
  it('fetches providers on mount and sets isLoading to false', async () => {
    const { result } = renderHook(() => useAiProviders());

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.providers).toEqual(MOCK_PROVIDERS);
    expect(result.current.error).toBeNull();
    expect(mockListProviders).toHaveBeenCalledOnce();
  });

  it('sets error when initial fetch fails', async () => {
    mockListProviders.mockRejectedValueOnce(new Error('Network error'));
    const { result } = renderHook(() => useAiProviders());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('Network error');
    expect(result.current.providers).toEqual([]);
  });

  it('addProvider calls API and refetches', async () => {
    const { result } = renderHook(() => useAiProviders());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.addProvider('stability_ai', 'sk-test');
    });

    expect(mockAddProvider).toHaveBeenCalledWith('stability_ai', 'sk-test');
    // Initial fetch + refetch after add
    expect(mockListProviders).toHaveBeenCalledTimes(2);
  });

  it('addProvider sets error on failure and rethrows', async () => {
    mockAddProvider.mockRejectedValueOnce(new Error('Invalid key'));
    const { result } = renderHook(() => useAiProviders());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let thrownError: Error | undefined;
    await act(async () => {
      try {
        await result.current.addProvider('openai', 'bad-key');
      } catch (err) {
        thrownError = err as Error;
      }
    });

    expect(thrownError?.message).toBe('Invalid key');
    expect(result.current.error).toBe('Invalid key');
  });

  it('updateProvider calls API with updates and refetches', async () => {
    const { result } = renderHook(() => useAiProviders());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.updateProvider('openai', { isActive: false });
    });

    expect(mockUpdateProvider).toHaveBeenCalledWith('openai', { isActive: false });
    expect(mockListProviders).toHaveBeenCalledTimes(2);
  });

  it('deleteProvider calls API and refetches', async () => {
    const { result } = renderHook(() => useAiProviders());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.deleteProvider('runway');
    });

    expect(mockDeleteProvider).toHaveBeenCalledWith('runway');
    expect(mockListProviders).toHaveBeenCalledTimes(2);
  });

  it('sets isMutating during mutation', async () => {
    let resolveAdd: () => void;
    mockAddProvider.mockImplementationOnce(
      () => new Promise<void>((r) => { resolveAdd = r; }),
    );

    const { result } = renderHook(() => useAiProviders());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let addPromise: Promise<void>;
    act(() => {
      addPromise = result.current.addProvider('kling', 'sk-123');
    });

    await waitFor(() => {
      expect(result.current.isMutating).toBe(true);
    });

    await act(async () => {
      resolveAdd!();
      await addPromise!;
    });

    expect(result.current.isMutating).toBe(false);
  });
});
