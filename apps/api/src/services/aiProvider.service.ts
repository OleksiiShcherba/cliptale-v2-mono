import type { AiProvider } from '@/repositories/aiProvider.repository.js';
import * as aiProviderRepo from '@/repositories/aiProvider.repository.js';
import { encryptString, decryptString } from '@/lib/encryption.js';
import { ConflictError, NotFoundError } from '@/lib/errors.js';

/** Public-facing provider summary — never exposes the actual API key. */
export type ProviderSummary = {
  provider: AiProvider;
  isActive: boolean;
  isConfigured: boolean;
  createdAt: Date;
};

/** Encrypts the API key and stores a new provider config for the user. */
export async function addProvider(
  userId: string,
  provider: AiProvider,
  apiKey: string,
): Promise<void> {
  const existing = await aiProviderRepo.getConfigByUserAndProvider(userId, provider);
  if (existing) {
    throw new ConflictError(`Provider "${provider}" is already configured`);
  }

  const { encrypted, iv, tag } = encryptString(apiKey);
  await aiProviderRepo.createConfig({
    userId,
    provider,
    apiKeyEncrypted: encrypted,
    encryptionIv: iv,
    encryptionTag: tag,
  });
}

/** Returns a summary list of all configured providers for the user. */
export async function listProviders(
  userId: string,
): Promise<ProviderSummary[]> {
  const configs = await aiProviderRepo.getConfigsByUserId(userId);
  return configs.map((c) => ({
    provider: c.provider,
    isActive: c.isActive,
    isConfigured: true,
    createdAt: c.createdAt,
  }));
}

/** Updates the API key and/or active status for an existing provider config. */
export async function updateProvider(
  userId: string,
  provider: AiProvider,
  updates: { apiKey?: string; isActive?: boolean },
): Promise<void> {
  const existing = await aiProviderRepo.getConfigByUserAndProvider(userId, provider);
  if (!existing) {
    throw new NotFoundError(`Provider "${provider}" is not configured`);
  }

  // Handle key update and active status update separately or together
  if (updates.apiKey !== undefined) {
    const { encrypted, iv, tag } = encryptString(updates.apiKey);
    const fields = {
      apiKeyEncrypted: encrypted,
      encryptionIv: iv,
      encryptionTag: tag,
      ...(updates.isActive !== undefined && { isActive: updates.isActive }),
    };
    await aiProviderRepo.updateConfig(userId, provider, fields);
  } else if (updates.isActive !== undefined) {
    await aiProviderRepo.updateConfig(userId, provider, { isActive: updates.isActive });
  }
}

/** Deletes a provider config. */
export async function deleteProvider(
  userId: string,
  provider: AiProvider,
): Promise<void> {
  const existing = await aiProviderRepo.getConfigByUserAndProvider(userId, provider);
  if (!existing) {
    throw new NotFoundError(`Provider "${provider}" is not configured`);
  }
  await aiProviderRepo.deleteConfig(userId, provider);
}

/** Decrypts and returns the API key for internal use (e.g. by the generation service). */
export async function getDecryptedKey(
  userId: string,
  provider: AiProvider,
): Promise<string> {
  const config = await aiProviderRepo.getConfigByUserAndProvider(userId, provider);
  if (!config) {
    throw new NotFoundError(`Provider "${provider}" is not configured`);
  }
  if (!config.isActive) {
    throw new NotFoundError(`Provider "${provider}" is not active`);
  }
  return decryptString(config.apiKeyEncrypted, config.encryptionIv, config.encryptionTag);
}
