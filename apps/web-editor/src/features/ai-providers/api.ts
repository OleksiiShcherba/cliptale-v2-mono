import { apiClient } from '@/lib/api-client';

import type { AiProvider, ProviderSummary } from './types';

/** Fetch all configured AI providers for the current user. */
export async function listProviders(): Promise<ProviderSummary[]> {
  const res = await apiClient.get('/user/ai-providers');
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to list AI providers (${res.status}): ${body}`);
  }
  return res.json() as Promise<ProviderSummary[]>;
}

/** Add a new AI provider configuration. */
export async function addProvider(
  provider: AiProvider,
  apiKey: string,
): Promise<void> {
  const res = await apiClient.post('/user/ai-providers', { provider, apiKey });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to add AI provider (${res.status}): ${body}`);
  }
}

/** Update an existing AI provider (API key and/or active status). */
export async function updateProvider(
  provider: AiProvider,
  updates: { apiKey?: string; isActive?: boolean },
): Promise<void> {
  const res = await apiClient.patch(
    `/user/ai-providers/${provider}`,
    updates,
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to update AI provider (${res.status}): ${body}`);
  }
}

/** Remove an AI provider configuration. */
export async function deleteProvider(provider: AiProvider): Promise<void> {
  const res = await apiClient.delete(`/user/ai-providers/${provider}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to delete AI provider (${res.status}): ${body}`);
  }
}
