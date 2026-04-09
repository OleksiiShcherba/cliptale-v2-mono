import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockRepo, mockEncrypt, mockDecrypt } = vi.hoisted(() => ({
  mockRepo: {
    getConfigByUserAndProvider: vi.fn(),
    createConfig: vi.fn().mockResolvedValue(1),
    getConfigsByUserId: vi.fn().mockResolvedValue([]),
    updateConfig: vi.fn().mockResolvedValue(undefined),
    deleteConfig: vi.fn().mockResolvedValue(undefined),
  },
  mockEncrypt: vi.fn().mockReturnValue({
    encrypted: Buffer.from('enc'),
    iv: Buffer.from('iv-bytes-16chars'),
    tag: Buffer.from('tag-bytes-16char'),
  }),
  mockDecrypt: vi.fn().mockReturnValue('decrypted-key'),
}));

vi.mock('@/repositories/aiProvider.repository.js', () => mockRepo);
vi.mock('@/lib/encryption.js', () => ({
  encryptString: mockEncrypt,
  decryptString: mockDecrypt,
}));

import {
  addProvider,
  listProviders,
  updateProvider,
  deleteProvider,
  getDecryptedKey,
} from './aiProvider.service.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

const USER_ID = 'user-abc';
const PROVIDER = 'openai' as const;
const API_KEY = 'sk-test-key-12345';

const makeConfig = (overrides = {}) => ({
  configId: 1,
  userId: USER_ID,
  provider: PROVIDER,
  apiKeyEncrypted: Buffer.from('enc'),
  encryptionIv: Buffer.from('iv'),
  encryptionTag: Buffer.from('tag'),
  isActive: true,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  ...overrides,
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('aiProvider.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('addProvider', () => {
    it('encrypts the key and calls createConfig', async () => {
      mockRepo.getConfigByUserAndProvider.mockResolvedValue(null);

      await addProvider(USER_ID, PROVIDER, API_KEY);

      expect(mockEncrypt).toHaveBeenCalledWith(API_KEY);
      expect(mockRepo.createConfig).toHaveBeenCalledWith({
        userId: USER_ID,
        provider: PROVIDER,
        apiKeyEncrypted: Buffer.from('enc'),
        encryptionIv: Buffer.from('iv-bytes-16chars'),
        encryptionTag: Buffer.from('tag-bytes-16char'),
      });
    });

    it('throws ConflictError when provider already exists', async () => {
      mockRepo.getConfigByUserAndProvider.mockResolvedValue(makeConfig());

      await expect(addProvider(USER_ID, PROVIDER, API_KEY)).rejects.toThrow(
        'already configured',
      );
    });
  });

  describe('listProviders', () => {
    it('returns provider summaries without keys', async () => {
      mockRepo.getConfigsByUserId.mockResolvedValue([
        makeConfig(),
        makeConfig({ provider: 'runway', isActive: false }),
      ]);

      const result = await listProviders(USER_ID);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        provider: 'openai',
        isActive: true,
        isConfigured: true,
        createdAt: new Date('2026-01-01'),
      });
      expect(result[1]!.isActive).toBe(false);
      // Verify no key-related fields leak
      expect(result[0]).not.toHaveProperty('apiKeyEncrypted');
    });

    it('returns empty array when no providers configured', async () => {
      mockRepo.getConfigsByUserId.mockResolvedValue([]);

      const result = await listProviders(USER_ID);

      expect(result).toEqual([]);
    });
  });

  describe('updateProvider', () => {
    it('encrypts a new key when apiKey is provided', async () => {
      mockRepo.getConfigByUserAndProvider.mockResolvedValue(makeConfig());

      await updateProvider(USER_ID, PROVIDER, { apiKey: 'new-key' });

      expect(mockEncrypt).toHaveBeenCalledWith('new-key');
      expect(mockRepo.updateConfig).toHaveBeenCalledWith(
        USER_ID,
        PROVIDER,
        expect.objectContaining({
          apiKeyEncrypted: Buffer.from('enc'),
        }),
      );
    });

    it('updates isActive without re-encrypting', async () => {
      mockRepo.getConfigByUserAndProvider.mockResolvedValue(makeConfig());

      await updateProvider(USER_ID, PROVIDER, { isActive: false });

      expect(mockEncrypt).not.toHaveBeenCalled();
      expect(mockRepo.updateConfig).toHaveBeenCalledWith(
        USER_ID,
        PROVIDER,
        { isActive: false },
      );
    });

    it('throws NotFoundError when provider not configured', async () => {
      mockRepo.getConfigByUserAndProvider.mockResolvedValue(null);

      await expect(
        updateProvider(USER_ID, PROVIDER, { isActive: true }),
      ).rejects.toThrow('not configured');
    });
  });

  describe('deleteProvider', () => {
    it('deletes an existing config', async () => {
      mockRepo.getConfigByUserAndProvider.mockResolvedValue(makeConfig());

      await deleteProvider(USER_ID, PROVIDER);

      expect(mockRepo.deleteConfig).toHaveBeenCalledWith(USER_ID, PROVIDER);
    });

    it('throws NotFoundError when provider not configured', async () => {
      mockRepo.getConfigByUserAndProvider.mockResolvedValue(null);

      await expect(deleteProvider(USER_ID, PROVIDER)).rejects.toThrow(
        'not configured',
      );
    });
  });

  describe('getDecryptedKey', () => {
    it('returns the decrypted API key for an active provider', async () => {
      mockRepo.getConfigByUserAndProvider.mockResolvedValue(makeConfig());

      const key = await getDecryptedKey(USER_ID, PROVIDER);

      expect(key).toBe('decrypted-key');
      expect(mockDecrypt).toHaveBeenCalledWith(
        makeConfig().apiKeyEncrypted,
        makeConfig().encryptionIv,
        makeConfig().encryptionTag,
      );
    });

    it('throws NotFoundError when provider not configured', async () => {
      mockRepo.getConfigByUserAndProvider.mockResolvedValue(null);

      await expect(getDecryptedKey(USER_ID, PROVIDER)).rejects.toThrow(
        'not configured',
      );
    });

    it('throws NotFoundError when provider is inactive', async () => {
      mockRepo.getConfigByUserAndProvider.mockResolvedValue(
        makeConfig({ isActive: false }),
      );

      await expect(getDecryptedKey(USER_ID, PROVIDER)).rejects.toThrow(
        'not active',
      );
    });
  });
});
