import { useState, useEffect, useCallback } from 'react';

import {
  listProviders,
  addProvider as addProviderApi,
  updateProvider as updateProviderApi,
  deleteProvider as deleteProviderApi,
} from '@/features/ai-providers/api';
import type { AiProvider, ProviderSummary } from '@/features/ai-providers/types';

// ---------------------------------------------------------------------------
// Hook result type
// ---------------------------------------------------------------------------

/** Return type for the useAiProviders hook — provider list, loading/error state, and CRUD mutations. */
export type UseAiProvidersResult = {
  /** List of configured providers from the server. */
  providers: ProviderSummary[];
  /** Whether the initial fetch is in progress. */
  isLoading: boolean;
  /** Error from the most recent operation. */
  error: string | null;
  /** Add a new provider configuration. */
  addProvider: (provider: AiProvider, apiKey: string) => Promise<void>;
  /** Update an existing provider (key and/or active status). */
  updateProvider: (provider: AiProvider, updates: { apiKey?: string; isActive?: boolean }) => Promise<void>;
  /** Remove a provider configuration. */
  deleteProvider: (provider: AiProvider) => Promise<void>;
  /** Whether a mutation is currently in progress. */
  isMutating: boolean;
};

// ---------------------------------------------------------------------------
// useAiProviders
// ---------------------------------------------------------------------------

/**
 * Manages AI provider CRUD state.
 *
 * Fetches the provider list on mount and refetches after every mutation.
 * Uses raw `apiClient` calls via the feature api module — no React Query.
 */
export function useAiProviders(): UseAiProvidersResult {
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState(false);

  const fetchProviders = useCallback(async () => {
    try {
      const data = await listProviders();
      setProviders(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load providers');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchProviders();
  }, [fetchProviders]);

  const addProvider = useCallback(
    async (provider: AiProvider, apiKey: string): Promise<void> => {
      setIsMutating(true);
      setError(null);
      try {
        await addProviderApi(provider, apiKey);
        await fetchProviders();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add provider');
        throw err;
      } finally {
        setIsMutating(false);
      }
    },
    [fetchProviders],
  );

  const updateProvider = useCallback(
    async (provider: AiProvider, updates: { apiKey?: string; isActive?: boolean }): Promise<void> => {
      setIsMutating(true);
      setError(null);
      try {
        await updateProviderApi(provider, updates);
        await fetchProviders();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update provider');
        throw err;
      } finally {
        setIsMutating(false);
      }
    },
    [fetchProviders],
  );

  const deleteProvider = useCallback(
    async (provider: AiProvider): Promise<void> => {
      setIsMutating(true);
      setError(null);
      try {
        await deleteProviderApi(provider);
        await fetchProviders();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete provider');
        throw err;
      } finally {
        setIsMutating(false);
      }
    },
    [fetchProviders],
  );

  return { providers, isLoading, error, addProvider, updateProvider, deleteProvider, isMutating };
}
